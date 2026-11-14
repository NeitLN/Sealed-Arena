// Command sealed-localnet starts (or restarts) a local avalanchego network with one
// Subnet-EVM chain, the Sealed L1, using the tmpnet fixture shipped in avalanchego.
//
// It is copied into the avalanchego source tree at build time (see chain/Dockerfile)
// so it compiles against exactly the pinned upstream version.
//
// Environment:
//
//	SEALED_NODE_COUNT   number of validator nodes (default 1)
//	SEALED_GENESIS      path to the Subnet-EVM genesis (default /sealed/genesis/local.json)
//	SEALED_DATA_DIR     root for network data and the state file (default /data)
//	AVALANCHEGO_PATH    path to the avalanchego binary (default /avalanchego/avalanchego)
//	SEALED_PLUGIN_DIR   plugin directory holding the Subnet-EVM binary (default /avalanchego/plugins)
//	SEALED_BASE_PORT    HTTP port of node i is base+2i, staking port is base+2i+1 (default 9650)
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
	genesisBytes, err := os.ReadFile(env("SEALED_GENESIS", "/sealed/genesis/local.json"))
	if err != nil {
		return nil, fmt.Errorf("read genesis: %w", err)
	}
	vmID, err := ids.FromString(subnetEVMID)
	if err != nil {
		return nil, err
	}

	nodes := tmpnet.NewNodesOrPanic(nodeCount)
	validatorIDs := make([]ids.NodeID, 0, nodeCount)
	for i, node := range nodes {
		// Fixed ports and a wildcard host so the API can be published from the container.
		node.Flags["http-host"] = "0.0.0.0"
		node.Flags["http-port"] = strconv.Itoa(basePort + 2*i)
		node.Flags["staking-port"] = strconv.Itoa(basePort + 2*i + 1)
		node.Flags["http-allowed-hosts"] = "*"
		validatorIDs = append(validatorIDs, node.NodeID)
	}

	return &tmpnet.Network{
		Owner: "sealed-localnet",
		Nodes: nodes,
		DefaultRuntimeConfig: tmpnet.NodeRuntimeConfig{
			Process: &tmpnet.ProcessRuntimeConfig{
				AvalancheGoPath: env("AVALANCHEGO_PATH", "/avalanchego/avalanchego"),
				PluginDir:       env("SEALED_PLUGIN_DIR", "/avalanchego/plugins"),
			},
		},
		Subnets: []*tmpnet.Subnet{{
			Name: subnetName,
			Chains: []*tmpnet.Chain{{
				VMID:         vmID,
				Genesis:      genesisBytes,
				// The ewoq key is the account funded in chain/genesis/local.json.
				PreFundedKey: genesis.EWOQKey,
			}},
			ValidatorIDs: validatorIDs,
		}},
	}, nil
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
