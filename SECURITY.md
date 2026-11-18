# Security policy

Sealed Arena runs on **testnets only**. The coins on its L1 have no monetary value, and the project is not a payment service.

## Open challenge

The open red-team challenge is live: https://sealed-arena.vercel.app/arena, rules at https://sealed-arena.vercel.app/arena/rules. A T0 breach of the challenge agent (coins leaving it beyond what the rule charged) is public by design: press "Report breach" on the page and open a public issue with the transaction hash. Everything else, including a way to forge an owner proof or to bypass the rule for other agents, should be reported privately as described below. Do not attack infrastructure outside the scope on the rules page.

## Reporting a vulnerability

Please report privately through GitHub: **Security → Report a vulnerability** on this repository. Include:

- what you did (transactions, calls, or code path), on which network and commit;
- what you expected the rule or the precompile to do, and what happened;
- whether an agent's balance dropped below what its mandate allows.

We acknowledge reports as soon as we can during the event and credit finders who wish to be named.

## Scope

In scope: the validity rule and the AgentPolicy precompile (`chain/patches/`), the contracts in `contracts/`, and the services and web app in this repository.

Out of scope, by design (see the limitations in the README):

- spending that stays inside an agent's mandate, including by someone holding a leaked agent key, until the owner freezes the agent or the mandate expires;
- using up an agent's daily budget or nonces (griefing);
- assets on any chain other than the Sealed L1;
- actions that need the team's validator or admin keys, such as network upgrades, and anything that needs the relayer host's manager key (README limit 13).
