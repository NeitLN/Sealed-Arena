/** Chain id of the Sealed L1 (docs/ARCHITECTURE.md, section 3). */
export const CHAIN_ID = 261126;

export const CHAIN_NAME = "Sealed";

/** Symbol of the native coin. Amounts on chain use 18 decimals (wei). */
export const NATIVE_SYMBOL = "USDC";

export type Address = `0x${string}`;

/**
 * Contract and precompile addresses used by every service and the web app.
 * Each entry stays undefined until the task that deploys or verifies it fills it in.
 */
export const ADDRESSES: {
  readonly agentPolicy: Address | undefined;
  readonly arenaRecorder: Address | undefined;
  readonly reputationReceiver: Address | undefined;
} = {
  agentPolicy: "0x0300000000000000000000000000000000000001", // D4
  arenaRecorder: undefined,
  reputationReceiver: undefined,
};
