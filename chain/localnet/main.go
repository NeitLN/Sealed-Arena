// Command sealed-localnet starts (or restarts) a local avalanchego network with one
// Subnet-EVM chain, the Sealed L1, using the tmpnet fixture shipped in avalanchego.
//
// It is copied into the avalanchego source tree at build time (see chain/Dockerfile)
// so it compiles against exactly the pinned upstream version.
//
// Environment:
//
//	SEALED_NODE_COUNT   number of validator nodes (default 1)
//	SEALED_GENESIS      path to the Subnet-EVM genesis (default /sealed/genesis/sealed-local.json)
//	SEALED_DATA_DIR     root for network data and the state file (default /data)
//	AVALANCHEGO_PATH    path to the avalanchego binary (default /avalanchego/avalanchego)
//	SEALED_PLUGIN_DIR   plugin directory holding the Subnet-EVM binary (default /avalanchego/plugins)
//	SEALED_BASE_PORT    HTTP port of node i is base+2i, staking port is base+2i+1 (default 9650)
//	SEALED_NORULE_NODES comma-separated 1-based node numbers that run the Subnet-EVM plugin from
//	                    SEALED_NORULE_PLUGIN_DIR instead (a build without the agent rule, for the
//	                    test in chain/tests/byzantine); empty by default
//	SEALED_NORULE_PLUGIN_DIR  plugin directory for those nodes (default /norule/plugins)
//	SEALED_LOG_LEVEL    avalanchego log level for every node (default: avalanchego's own)
//	SEALED_RULE_V2_AT   schedules agent rule v2 (agentRuleV2Config) in the genesis of a new
//	                    network: "0" from the start, "+90" 90 seconds after the network is
//	                    created, or a unix time; empty by default (rule v1 only)
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/ava-labs/avalanchego/config"
	"github.com/ava-labs/avalanchego/genesis"
	"github.com/ava-labs/avalanchego/ids"
	"github.com/ava-labs/avalanchego/tests"
	"github.com/ava-labs/avalanchego/tests/fixture/tmpnet"
	"github.com/ava-labs/avalanchego/utils/logging"
)

const (
	subnetName = "sealed"
	// Default Subnet-EVM VM ID (graft/subnet-evm/scripts/vm_constants.sh).
	subnetEVMID  = "srEXiWaHuhNyGwPUi444Tu47ZEDwxTWrbQiuD7FmgSAQ6X7Dy"
	startTimeout = 15 * time.Minute
)

// State is written to <data dir>/sealed.json so scripts can find the chain.
type State struct {
	NetworkDir   string   `json:"networkDir"`
	SubnetID     string   `json:"subnetId"`
	BlockchainID string   `json:"blockchainId"`
	NodeURIs     []string `json:"nodeUris"`
	RPCPath      string   `json:"rpcPath"`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "sealed-localnet:", err)
		os.Exit(1)
	}
}

func run() error {
	log, err := tests.LoggerForFormat("", logging.AutoString)
	if err != nil {
		return err
	}

	dataDir := env("SEALED_DATA_DIR", "/data")
	statePath := filepath.Join(dataDir, "sealed.json")

	ctx, cancel := context.WithTimeout(context.Background(), startTimeout)
	defer cancel()

	var network *tmpnet.Network
	prev, err := readState(statePath)
	switch {
	case err == nil:
		log.Info("starting existing network " + prev.NetworkDir)
		// The container is new, so no node process from the previous run is alive.
		// Stale process context files would make tmpnet treat those nodes as running.
		if err := removeStaleProcessContexts(prev.NetworkDir); err != nil {
			return err
		}
		network, err = tmpnet.ReadNetwork(ctx, log, prev.NetworkDir)
		if err != nil {
			return fmt.Errorf("read network: %w", err)
		}
		if err := network.StartNodes(ctx, log, network.Nodes...); err != nil {
			return fmt.Errorf("start nodes: %w", err)
		}
	case errors.Is(err, fs.ErrNotExist):
		network, err = newNetwork()
		if err != nil {
			return err
		}
		if err := tmpnet.BootstrapNewNetwork(ctx, log, network, filepath.Join(dataDir, "networks")); err != nil {
			return fmt.Errorf("bootstrap network: %w", err)
		}
	default:
		return fmt.Errorf("read state: %w", err)
	}

	state, err := stateFor(network)
	if err != nil {
		return err
	}
	if err := writeState(statePath, state); err != nil {
		return err
	}
	fmt.Printf("sealed-localnet ready: blockchain %s, rpc path %s\n", state.BlockchainID, state.RPCPath)
	return nil
}

func newNetwork() (*tmpnet.Network, error) {
	nodeCount, err := strconv.Atoi(env("SEALED_NODE_COUNT", "1"))
	if err != nil || nodeCount < 1 {
		return nil, fmt.Errorf("invalid SEALED_NODE_COUNT")
	}
	basePort, err := strconv.Atoi(env("SEALED_BASE_PORT", "9650"))
	if err != nil {
		return nil, fmt.Errorf("invalid SEALED_BASE_PORT")
	}
	genesisBytes, err := os.ReadFile(env("SEALED_GENESIS", "/sealed/genesis/sealed-local.json"))
	if err != nil {
		return nil, fmt.Errorf("read genesis: %w", err)
	}
	if at := env("SEALED_RULE_V2_AT", ""); at != "" {
		ts, err := ruleV2Time(at, time.Now())
		if err != nil {
			return nil, err
		}
		if genesisBytes, err = withRuleV2(genesisBytes, ts); err != nil {
			return nil, err
		}
		fmt.Printf("sealed-localnet: agent rule v2 from unix time %d\n", ts)
	}
	vmID, err := ids.FromString(subnetEVMID)
	if err != nil {
		return nil, err
	}

	noRule, err := noRuleNodes(nodeCount)
	if err != nil {
		return nil, err
	}
	avalanchego := env("AVALANCHEGO_PATH", "/avalanchego/avalanchego")

	nodes := tmpnet.NewNodesOrPanic(nodeCount)
	validatorIDs := make([]ids.NodeID, 0, nodeCount)
	for i, node := range nodes {
		if noRule[i+1] {
			// Same avalanchego, a Subnet-EVM plugin built without the agent rule.
			node.RuntimeConfig = &tmpnet.NodeRuntimeConfig{
				Process: &tmpnet.ProcessRuntimeConfig{
					AvalancheGoPath: avalanchego,
					PluginDir:       env("SEALED_NORULE_PLUGIN_DIR", "/norule/plugins"),
				},
			}
			fmt.Printf("sealed-localnet: node %d runs the plugin without the agent rule\n", i+1)
		}
		// Fixed ports and a wildcard host so the API can be published from the container.
		node.Flags["http-host"] = "0.0.0.0"
		node.Flags["http-port"] = strconv.Itoa(basePort + 2*i)
		node.Flags["staking-port"] = strconv.Itoa(basePort + 2*i + 1)
		node.Flags["http-allowed-hosts"] = "*"
		if lvl := env("SEALED_LOG_LEVEL", ""); lvl != "" {
			node.Flags["log-level"] = lvl
		}
		validatorIDs = append(validatorIDs, node.NodeID)
	}

	return &tmpnet.Network{
		Owner: "sealed-localnet",
		Nodes: nodes,
		DefaultRuntimeConfig: tmpnet.NodeRuntimeConfig{
			Process: &tmpnet.ProcessRuntimeConfig{
				AvalancheGoPath: avalanchego,
				PluginDir:       env("SEALED_PLUGIN_DIR", "/avalanchego/plugins"),
			},
		},
		Subnets: []*tmpnet.Subnet{{
			Name: subnetName,
			Chains: []*tmpnet.Chain{{
				VMID:         vmID,
				Genesis:      genesisBytes,
				// The ewoq key is the admin account funded in chain/genesis/sealed-local.json.
				PreFundedKey: genesis.EWOQKey,
			}},
			ValidatorIDs: validatorIDs,
		}},
	}, nil
}

// noRuleNodes parses SEALED_NORULE_NODES ("3" or "2,3") into a set of 1-based node numbers.
func noRuleNodes(nodeCount int) (map[int]bool, error) {
	set := map[int]bool{}
	for _, f := range strings.Split(env("SEALED_NORULE_NODES", ""), ",") {
		f = strings.TrimSpace(f)
		if f == "" {
			continue
		}
		n, err := strconv.Atoi(f)
		if err != nil || n < 1 || n > nodeCount {
			return nil, fmt.Errorf("invalid SEALED_NORULE_NODES entry %q", f)
		}
		set[n] = true
	}
	return set, nil
}

func stateFor(network *tmpnet.Network) (*State, error) {
	subnet := network.GetSubnet(subnetName)
	if subnet == nil || len(subnet.Chains) == 0 {
		return nil, fmt.Errorf("subnet %q not found in network %s", subnetName, network.Dir)
	}
	chainID := subnet.Chains[0].ChainID
	uris := make([]string, 0, len(network.Nodes))
	for _, u := range network.GetNodeURIs() {
		uris = append(uris, u.URI)
	}
	return &State{
		NetworkDir:   network.Dir,
		SubnetID:     subnet.SubnetID.String(),
		BlockchainID: chainID.String(),
		NodeURIs:     uris,
		RPCPath:      "/ext/bc/" + chainID.String() + "/rpc",
	}, nil
}

func removeStaleProcessContexts(networkDir string) error {
	paths, err := filepath.Glob(filepath.Join(networkDir, "*", config.DefaultProcessContextFilename))
	if err != nil {
		return err
	}
	for _, p := range paths {
		if err := os.Remove(p); err != nil {
			return fmt.Errorf("remove stale process context: %w", err)
		}
	}
	return nil
}

func readState(path string) (*State, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var s State
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func writeState(path string, s *State) error {
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0o644)
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}


// ruleV2Time parses SEALED_RULE_V2_AT: "+N" is N seconds from now, anything else a unix time.
func ruleV2Time(at string, now time.Time) (uint64, error) {
	if rest, ok := strings.CutPrefix(at, "+"); ok {
		n, err := strconv.ParseUint(rest, 10, 64)
		if err != nil {
			return 0, fmt.Errorf("invalid SEALED_RULE_V2_AT %q", at)
		}
		return uint64(now.Unix()) + n, nil
	}
	ts, err := strconv.ParseUint(at, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid SEALED_RULE_V2_AT %q", at)
	}
	return ts, nil
}

// withRuleV2 adds agentRuleV2Config with the given activation time to the genesis chain config.
func withRuleV2(genesisBytes []byte, ts uint64) ([]byte, error) {
	var g map[string]any
	if err := json.Unmarshal(genesisBytes, &g); err != nil {
		return nil, fmt.Errorf("parse genesis: %w", err)
	}
	cfg, ok := g["config"].(map[string]any)
	if !ok {
		return nil, errors.New("genesis has no config")
	}
	cfg["agentRuleV2Config"] = map[string]any{"blockTimestamp": ts}
	return json.Marshal(g)
}
