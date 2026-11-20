export type StepState = "done" | "current" | "pending";

/** A step is complete only when all preceding prerequisites also hold. */
export function ownerSteps(state: {
  passkey: boolean;
  agent: boolean;
  linked: boolean;
  mandate: boolean;
}): StepState[] {
  const ready = [state.passkey, state.agent, state.linked, state.mandate];
  const current = ready.findIndex((done) => !done);
  return ready.map((_, i) =>
    current < 0 || i < current ? "done" : i === current ? "current" : "pending",
  );
}

/** Conservative bound: round remaining 24h periods up, plus a cap for the UTC reset.
 * Fees are already inside dailyCap. Expiry is exclusive; an expired mandate spends nothing.
 */
export function maximumLoss(dailyCap: bigint, expiry: bigint, now: bigint) {
  if (expiry <= now) return { days: 0n, boundaryDays: 0n, amount: 0n };
  const days = (expiry - now + 86_399n) / 86_400n;
  return { days, boundaryDays: 1n, amount: dailyCap * (days + 1n) };
}
