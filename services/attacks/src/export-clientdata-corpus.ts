// Exports every clientDataJSON of a successful owner action sent to AgentPolicy (rules v1 and v2)
// into chain/testvectors/fuji-clientdata-pre-v3.json, for TestAgentPolicyLegacyParserFujiCorpus:
// the legacy parser must keep accepting all of them, and the count the rule v3 parser refuses is
// pinned (it must be 0 before T is scheduled; any other entry names a client that breaks at T).
// Read-only: it only reads blocks, transactions and receipts.
//
//   SEALED_RPC=<L1 RPC URL> [SEALED_FROM_BLOCK=0] pnpm --filter attacks export-clientdata-corpus
import { writeFileSync } from "node:fs";
import { AGENT_POLICY_ADDRESS, agentPolicyAbi, scanClientDataStrict } from "@sealed-arena/shared";
import { createPublicClient, decodeAbiParameters, decodeFunctionData, type Hex, http } from "viem";

const OWNER_ACTIONS = new Set(["setMandate", "setMandateV2", "freeze", "unfreeze"]);

async function main() {
  const rpc = process.env.SEALED_RPC;
  if (!rpc) throw new Error("set SEALED_RPC");
  const client = createPublicClient({ transport: http(rpc, { batch: { batchSize: 20 } }) });
  const head = await client.getBlockNumber();
  const entries: {
    tx: Hex;
    block: string;
    function: string;
    clientDataJSON: Hex;
    legacyOk: true;
  }[] = [];
  let strictRefusals = 0;
  for (let n = BigInt(process.env.SEALED_FROM_BLOCK ?? "0"); n <= head; n++) {
    const block = await client.getBlock({ blockNumber: n, includeTransactions: true });
    for (const tx of block.transactions) {
      if (tx.to?.toLowerCase() !== AGENT_POLICY_ADDRESS.toLowerCase()) continue;
      let name: string;
      let args: readonly unknown[] | undefined;
      try {
        ({ functionName: name, args } = decodeFunctionData({
          abi: agentPolicyAbi,
          data: tx.input,
        }));
      } catch {
        continue;
      }
      if (!OWNER_ACTIONS.has(name)) continue;
      const receipt = await client.getTransactionReceipt({ hash: tx.hash });
      if (receipt.status !== "success") continue; // a refusal can have any cause; only accepted proofs count
      const auth = args?.[args.length - 1] as Hex;
      const [, clientDataJSON] = decodeAbiParameters(
        [{ type: "bytes" }, { type: "bytes" }, { type: "bytes32" }, { type: "bytes32" }],
        auth,
      );
      if (!scanClientDataStrict(Buffer.from(clientDataJSON.slice(2), "hex")).ok) strictRefusals++;
      entries.push({
        tx: tx.hash,
        block: n.toString(),
        function: name,
        clientDataJSON,
        legacyOk: true,
      });
    }
  }
  const out = {
    comment:
      "clientDataJSON of every successful owner action before rule v3 (export-clientdata-corpus.ts)",
    head: head.toString(),
    strictRefusals,
    entries,
  };
  writeFileSync(
    new URL("../../../chain/testvectors/fuji-clientdata-pre-v3.json", import.meta.url),
    `${JSON.stringify(out, null, 2)}\n`,
  );
  console.log(
    `exported ${entries.length} owner proofs up to block ${head}; strict refuses ${strictRefusals}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
