# Contributing

## Workflow

1. Branch from `main`: `feat/FR-26-peer-verifier`, `fix/otp-cooldown`, `design/tokens-v1.4`.
2. Keep branches short-lived (days, not weeks) and pull requests small.
3. Open a pull request. CI must be green and one teammate must review before merging.
4. Squash-merge. `main` must always build and run.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`. Put the requirement ID in the PR title when there is one (`feat(FR-01): email code sign-up`).

## Definition of done

A change is done when it is:

- reviewed and merged with CI green
- covered by tests for its logic (a bug fix includes a test that fails without it)
- complete for every state: loading, empty, error, offline where relevant
- accessible: labels on controls, readable contrast, 44pt touch targets
- free of hard-coded text (strings go in `apps/mobile/src/i18n/en.ts`) and raw styles (use tokens)
- documented where behaviour or setup changed (README, API descriptions)

## Rules the tooling enforces

| Rule | Tool |
| --- | --- |
| Screens use `@arc/ui` and `@arc/tokens`, never raw colours or font sizes | ESLint (`apps/mobile/eslint.config.js`) |
| Every screen is listed with its Figma status | `registry.test.ts` |
| `arc.core` never imports a domain module; modules talk through service interfaces | import-linter (`backend/pyproject.toml`) |
| Database schema changes only through migrations that match the models | `alembic check` in CI |
| The app's API types match the backend | OpenAPI diff in CI |
| Formatting and types | ruff, mypy, TypeScript strict |

## Backend conventions

- One package per module under `backend/arc/modules/`: `models.py`, `schemas.py`, `service.py`, `router.py`, `deps.py`.
- Business rules live in the service, not the router. Tunable numbers live in `arc/core/config.py`.
- Raise `AppError(status, "CODE", "message a user can read")`. Never return a different error shape.
- Protect every non-public route with `AuthDep` (from `arc.modules.identity.deps`) and check ownership in the service.
- Never log emails, tokens, codes, IP addresses or locations.
- Outside services (email, SMS, payments, maps) go behind a small interface with a test double, like `EmailSender`.

## Secrets

Nothing secret is ever committed: no `.env`, keys, keystores or tokens. This repository is public. Local development needs no secrets; production values come from environment variables.
