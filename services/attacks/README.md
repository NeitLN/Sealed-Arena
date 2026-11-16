# Attacks

Scripts that play an attacker against the local Sealed L1.

## `leaked-key`: someone holds the agent's private key

```bash
bash chain/scripts/fetch.sh && bash chain/scripts/build.sh   # once, or after a patch change
bash scripts/localnet.sh up       # 3 validators
bash scripts/localnet.sh seed     # register the test agent, sample mandate, coins
pnpm --filter attacks leaked-key  # or: bash scripts/check-localnet.sh
```

The seeded agent's key is in `packages/shared/src/addresses.local.ts` on purpose: it plays a leaked key. Its mandate allows two plain payees, 1 coin per transaction and 3 coins per day, for 7 days.

Each case returns `{ name, expected, result, reason }`. A case is **blocked** when the transaction never reaches a block (in practice the RPC refuses it with the rule's error); **succeeded** when it is included.

| Group            | Cases                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Positive control | pay an allowed payee inside the mandate (must succeed)                                                                                             |
| Payee            | stranger with legacy, EIP-2930 and EIP-1559 transactions; each of the three nodes directly                                                         |
| Amount           | above `perTxCap`; a gas price high enough to burn coins through fees                                                                               |
| Code             | create a contract; call an existing contract; pay a listed payee that has code                                                                     |
| Rules            | `setMandate`, `unfreeze`, `register` on AgentPolicy with the agent key; NativeMinter, TxAllowList and ContractDeployerAllowList with the agent key |
| State            | while frozen; after expiry                                                                                                                         |
| Replay           | the control transaction again; same nonce with a higher fee to a stranger                                                                          |
| Budget           | sequential payments past `dailyCap`; 20 payments at once                                                                                           |

After the cases it checks:

- **invariant**: the agent's balance dropped by no more than its `totalCharged` grew;
- a random stranger address received nothing;
- the three nodes report the same block hash at the same height.

It prints a table and exits non-zero if any case differs from what is expected or any check fails.

Owner actions in the suite (freeze, short expiry, payee with code, a raised budget for the parallel case) are sent by the relayer with a test P-256 key that stands in for the owner's passkey.
