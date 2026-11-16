# Genesis

`sealed-local.json` is the genesis of the **local** Sealed L1 (`scripts/localnet.sh up`). Every key behind the addresses below is a public development key (see `packages/shared/src/addresses.local.ts`); none of them may hold value anywhere else.

## Chain

| Field                       | Value      | Why                                                                           |
| --------------------------- | ---------- | ----------------------------------------------------------------------------- |
| `chainId`                   | `261126`   | The Sealed chain id, shared through `packages/shared/src/chain.ts`            |
| `feeConfig.gasLimit`        | 15,000,000 | Block gas limit; equals the header `gasLimit` (`0xE4E1C0`)                    |
| `feeConfig.minBaseFee`      | 1 gwei     | Low minimum fee, as the architecture asks; senders pay gas in the native coin |
| `feeConfig.targetBlockRate` | 2 s        | Subnet-EVM default                                                            |
| `timestamp`                 | `0`        | Genesis time                                                                  |

## Precompiles

| Config key                        | Address     | Setting                                                                 | Effect                                                                                                                                                                                      |
| --------------------------------- | ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `txAllowListConfig`               | `0x0200…02` | admin: admin role; enabled: deployer, relayer, facilitator, ICM relayer | Only these addresses send transactions. Agents are added one by one by the admin once registered (`scripts/localnet.sh seed` does it for the test agent)                                    |
| `contractDeployerAllowListConfig` | `0x0200…00` | admin: admin role; enabled: deployer                                    | Only the deployer creates contracts. An agent is never listed                                                                                                                               |
| `contractNativeMinterConfig`      | `0x0200…01` | admin: admin role                                                       | Only the admin can mint native coins                                                                                                                                                        |
| `warpConfig`                      | `0x0200…05` | `blockTimestamp` 1607144400, quorum 67                                  | Warp messages for ICM. Warp may not activate before Durango; on local networks Durango is active from 2020-12-05 05:00 UTC (`InitiallyActiveTime`), so the timestamp is set to that instant |
| `agentPolicyConfig`               | `0x0300…01` | `blockTimestamp` 0                                                      | Mandates and the agent validity rule, from the first block                                                                                                                                  |

## Balances (`alloc`)

| Address       | Role                                   | Balance           |
| ------------- | -------------------------------------- | ----------------- |
| `0x8db9…52FC` | admin (allow-list admin, minter admin) | 100,000,000 coins |
| `0x7099…79C8` | deployer                               | 1,000 coins       |
| `0x3C44…93BC` | relayer (sends owner passkey actions)  | 1,000 coins       |
| `0x90F7…b906` | x402 facilitator                       | 1,000 coins       |
| `0x15d3…6A65` | ICM relayer                            | 1,000 coins       |

Agents get coins after registration, from the admin.

## Not enabled

No account delegation (no EIP-7702). No fee manager or reward manager.
