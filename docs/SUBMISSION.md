# Submission checklist

Before pressing Submit (deadline 23:59, Saturday 21/11/2026, Vietnam time). Run from the repository root on the commit being submitted.

## Automatic

- [ ] `bash scripts/check.sh` passes (typecheck, lint, tests, Foundry, node patch tests).
- [ ] `bash scripts/check-localnet.sh` passes (local three-node L1, attack suites, owner console, gateway, rule).
- [ ] `bash scripts/submission-check.sh` passes:
  - no forbidden claim in any tracked file (the list in `web/src/wording.test.ts`);
  - no statement about how the project itself was written, in files or commit messages;
  - no secret value from `.env` in any tracked file (the challenge agent key is public on purpose and is excepted);
  - no tracked file that `.gitignore` says should be ignored;
  - every https link in `README.md` answers (the RPC with `eth_chainId`).
- [ ] `docs/EVALUATION.md` equals the report generated from `services/attacks/suite/results/` (checked by the suite's tests in `check.sh`).

## By hand, in a private browser window

- [ ] Repository page opens: https://github.com/NeitLN/Sealed-Arena (public).
- [ ] Overview, owner console, challenge, rules and comparison pages open: https://sealed-arena.vercel.app, `/console`, `/arena`, `/arena/rules`, `/compare`.
- [ ] The Snowtrace links in `README.md` open (Snowtrace refuses scripted requests, so these are checked here).
- [ ] The slide deck and the demo video links open without signing in.
- [ ] The Fuji validator has balance left for the final (30/11): `platform l1` shows its remaining balance; top it up if it would run out before then.

## Content

- [ ] `README.md` states the limits (testnet; the team runs the validators; only this L1's assets are protected; a leaked key still spends inside the mandate; a key holder can grief; the challenge measures how hard the system was tried).
- [ ] Every number in the slides and the video comes from `docs/EVALUATION.md`, `services/attacks/compare/results/` or `services/agent/README.md`, and says which.
- [ ] A hand-written transcript is never presented as a model's output (`scripted-obeys-injection.json` says so in its `model` field).

## Submit

- [ ] Submit on the event dashboard before the deadline, with the repository, slide and video links.
