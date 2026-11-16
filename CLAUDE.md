# Arc — working rules for AI assistants

Read `docs/HANDOFF.md` first: it has the project state, the decisions already made, and the task list.
Read `docs/STATUS.md` for what works today. Update both at the end of every session.

## What this is

Arc is a mobile app for verified real-world meetups and events (Android first). Final Year Project,
ITU Lahore, Group 17: Abdullah Shafqat (lead, makes the decisions), Noor Rizwan (ML/security),
Menahil Naeem (frontend/UX). Advisor: Dr. Usman Younis. The bar is "a company would pay for this".

## Rules that are not negotiable

1. **Figma is the source of truth.** Order of authority: Figma file "ARC - touchgrass", page
   "final screens" > defense report > proposal v3. Before building or changing a screen, look at its
   Figma screen. Never say a screen has no design without searching the gallery labels first.
2. **Ask before deciding** anything about architecture, data model or scope that is not already
   decided in `docs/HANDOFF.md`. Do not invent requirements.
3. **No fake completeness.** No TODO stubs, placeholder logic or hardcoded data presented as real.
   Stand-ins for outside services live behind an interface and are refused by production settings.
4. **Never claim something works unless it was verified.** Say exactly what was and was not verified.
   Passing tests is not the same as "looks right on a device": only Abdullah can confirm visuals.
5. **Priorities when goals conflict:** correctness and data integrity > security > maintainability >
   user experience > performance > speed of delivery.
6. **The repository is public.** Never commit secrets, `.env` files, keys, keystores or tokens.
7. **Small scope.** Change only what the task needs. One feature branch and one pull request per
   task. `main` must always run.
8. **Explain simply.** Abdullah wants direct, concise answers, the answer first, plain language.

## Layout

```
apps/mobile/          Expo (SDK 58) + TypeScript app. Routes in src/app, features in src/features
packages/tokens/      Design tokens (tokens.json -> generated TypeScript). Edit tokens.json only
packages/ui/          Shared components. Screens use these, never raw colours or font styles
packages/api-client/  Typed client generated from the backend's OpenAPI schema
backend/              FastAPI modular monolith: arc/core + arc/modules/<name>
docs/                 HANDOFF.md, STATUS.md
```

## Commands

```bash
# App (from the repo root)
npm run typecheck && npm run lint && npm test
npm run tokens            # after editing packages/tokens/tokens.json
npx prettier --write <files>   # config in .prettierrc.json; generated files are ignored

# Backend (from backend/, venv at backend/.venv)
ruff check arc tests alembic && ruff format --check arc tests alembic && mypy arc && lint-imports
ARC_TEST_DATABASE_URL=postgresql+asyncpg://arc@localhost:5432/arc_test pytest -q
alembic check             # model and migrations agree

# After any backend API change
cd backend && python -m arc.export_openapi ../packages/api-client/openapi.json && cd .. && npm run api:generate
```

All of these must pass before pushing. CI runs them again plus an Android debug build.

## Conventions

- **Backend:** every failure returns `{"error": {"code", "message", "details"}}` via `AppError`.
  Document errors on routes with `error_responses(...)`. `arc/core` never imports from
  `arc/modules`. Schema changes go through a new Alembic migration. Tests use real PostgreSQL and
  Redis. Tunable values live in `arc/core/config.py` (env prefix `ARC_`). Security events go to the
  audit log, with no personal data in it.
- **App:** all text in `src/i18n/en.ts`. Every route file must be listed in
  `src/screens/registry.ts` with its Figma screen ID and status (a test enforces this). Screens use
  `@arc/ui` components and `@arc/tokens`; a lint rule bans raw hex colours and font styles in
  `src/app` and `src/features`. New type styles are added as tokens.
- **Tests:** user journeys go in `apps/mobile/src/app-flows.test.tsx` (real router, fake server).
  Design every state: loading, empty, error, success, offline.
- **Commits:** focused, conventional prefixes (`feat`, `fix`, `docs`, `build`, `ci`), with the
  reason in the body.

## Expo SDK 58 specifics (verified, easy to get wrong)

- Routes live in `src/app/`; entry is `expo-router/entry`; guard groups with `Stack.Protected`.
- Do not import from `@react-navigation/*`. A custom tab bar receives
  `{state, descriptors, emitter, navigateToTab, insets}`.
- Type refs as `ComponentRef<typeof ScrollView>`. TypeScript 6 needs `types: ["jest", "node"]`.
- React Native Testing Library v14 APIs are async; `renderRouter('src/app', {initialUrl})` is async.
- React Native has no `translateZ` and no CSS `clip-path`; see `src/features/splash` for how the
  splash works around both.
- Changing icons, the splash image or `app.json` plugins needs a native rebuild (`npm run android`).
