# Security policy

Sealed Arena runs on **testnets only**. The coins on its L1 have no monetary value, and the project is not a payment service.

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
- actions that need the team's validator or admin keys, such as network upgrades.

An open red-team challenge with its own rules will be announced separately. Until then, do not attack infrastructure you do not own.
