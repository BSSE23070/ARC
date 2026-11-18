# Arc

A verified real-world connection and events platform. Final Year Project, Group 17, ITU Lahore.

Arc helps people find local events and meetups, show up in person, and prove they did. Only a verified check-in unlocks rewards.

**Status: Phase 0 (foundations).** Sign-up, log-in, sessions and the app shell work end to end. Events, matching, check-in and Photobooth arrive in later phases; their tabs say so in the app.

## What's in the repo

```
apps/mobile/          Android app: React Native + Expo, TypeScript
  src/app/            Screens (file = route). (auth)/ signed-out, (app)/ signed-in
  src/features/       Screen logic shared between routes
  src/screens/registry.ts   Every screen and the Figma screen it follows
packages/tokens/      Design tokens: tokens.json (from Figma) -> generated TypeScript
packages/ui/          Component library; screens are built only from these
packages/api-client/  Typed API client, generated from the backend's OpenAPI spec
backend/              API: FastAPI modular monolith, PostgreSQL, Redis
  arc/core/           Shared: config, errors, security, email, rate limits
  arc/modules/        One package per domain module (identity so far)
  alembic/            Database migrations
  tests/              Tests against real PostgreSQL and Redis
docker-compose.yml    Local PostgreSQL, Redis, Mailpit (email inbox) and the API
.github/workflows/    CI: lint, types, tests, Android build on every push
```

## Set up on macOS (once)

1. **Tools**
   ```bash
   brew install node@22 python@3.12 watchman
   brew install --cask zulu@17        # Java 17, needed to build the Android app
   ```
   Install **Docker Desktop** and **Android Studio** from their websites. In Android Studio's first-run wizard, accept the defaults (Android SDK, Platform-Tools, Emulator).

2. **Environment variables.** Add to `~/.zshrc`, then open a new terminal:
   ```bash
   export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
   ```
   Check: `adb --version` and `java -version` (should say 17).

3. **An emulator.** Android Studio → More Actions → Virtual Device Manager → Create Device → Pixel 7 → a recent system image. Later, add one with **API 29 (Android 10)**: that is the oldest version Arc supports.

4. **Project dependencies**
   ```bash
   git clone https://github.com/BSSE23070/ARC.git && cd ARC
   npm install
   ```

## Run it

### 1. Backend

```bash
docker compose up -d --build
curl http://localhost:8000/readyz      # {"status":"ok","database":"ok","redis":"ok"}
```

- API docs: http://localhost:8000/api/docs
- **Email inbox (sign-in codes land here):** http://localhost:8025

### 2. App on the emulator

Start the emulator from Android Studio's Device Manager, then:

```bash
adb reverse tcp:8000 tcp:8000    # lets the phone reach the API on your Mac
npm run android                  # first build takes several minutes
```

After the first build, `npm start` (then press `a`) is enough unless native dependencies change.

### 3. App on a real phone over USB

1. On the phone: Settings → About phone → tap **Build number** seven times. Then Settings → Developer options → turn on **USB debugging**.
2. Plug it in and accept the "Allow USB debugging?" prompt. `adb devices` should list it as `device`.
3. Run:
   ```bash
   adb reverse tcp:8000 tcp:8000    # repeat after every reconnect
   npm run android -- --device      # pick the phone from the list
   ```

### 4. Try it

Open the app → Skip → enter any email → read the 6-digit code at http://localhost:8025 → pick a username and password → enter a date of birth. You are signed in, and you stay signed in when you reopen the app.

## Everyday commands

| What | Command (from the repo root unless noted) |
| --- | --- |
| App tests, lint, types | `npm test`, `npm run lint`, `npm run typecheck` |
| Backend setup | `cd backend && python3.12 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]" -c constraints.txt` |
| Backend tests | `cd backend && pytest` (needs `docker compose up -d postgres redis`) |
| Backend lint, types, boundaries | `cd backend && ruff check . && ruff format --check . && mypy arc && lint-imports` |
| Run the API with auto-reload | `docker compose up -d postgres redis mailpit`, then `cd backend && cp .env.example .env && alembic upgrade head && uvicorn --factory arc.main:create_app --reload` |
| New database migration | `cd backend && alembic revision --autogenerate -m "what changed"` (review the file before committing) |
| Stop everything | `docker compose down` (add `-v` to also delete the local database) |

## When the design changes (Figma → code)

Figma is the source of truth. Screens never contain raw colours or font sizes (the linter rejects them), so a design change is made in one place:

1. **Token change** (colour, type, spacing): update `packages/tokens/tokens.json`, run `npm run tokens`, commit both files.
2. **Component change**: edit the matching file in `packages/ui/src/` (each names its Figma pattern).
3. **Screen layout change**: edit only that screen in `apps/mobile/src/app/`.

`apps/mobile/src/screens/registry.ts` lists every screen and whether it follows a Figma screen or is **provisional** (built before its design exists). When a provisional screen's design arrives, restyle it and flip its entry to `figma`.

## When the API changes

```bash
cd backend && python -m arc.export_openapi ../packages/api-client/openapi.json
cd .. && npm run api:generate
```

Commit the regenerated files. CI fails if they are stale, so the app and API cannot drift apart.

## Troubleshooting

- **"Can't reach Arc" in the app:** run `adb reverse tcp:8000 tcp:8000` again and check `curl http://localhost:8000/healthz`.
- **No email code:** open http://localhost:8025. Codes expire after 10 minutes; "Resend code" unlocks after 30 seconds.
- **Android build fails after pulling:** `rm -rf apps/mobile/android && npm install && npm run android`.
- **Port already in use:** another PostgreSQL/Redis is running; stop it or change the port mapping in `docker-compose.yml`.

## More

- [CONTRIBUTING.md](CONTRIBUTING.md): branching, reviews, definition of done
- Planning document (requirements, decisions, architecture, phases): shared separately with the team
