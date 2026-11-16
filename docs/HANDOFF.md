# Arc — handoff

Written 16 Nov 2026 at the end of the first build session. This is everything a new session needs
to continue. `CLAUDE.md` has the working rules; `docs/STATUS.md` has what works today.

## 1. Where things are

| Thing | Where |
| --- | --- |
| Code | https://github.com/BSSE23070/ARC (public) |
| Open pull requests | #1 `feat/phase-0-foundations` (ready). #2 `feat/liveness-gate` (stacked on #1; holds everything after it) |
| Planning document (9 sections, build plan in section 8, decisions in section 3) | https://claude.ai/artifact/QiEsSSLruFRtCCn6Kz4S3N |
| Summary report, 16 Nov | https://claude.ai/artifact/TwdUyQDDknACCwaLf7ShZz |
| Logbook report, 16 Nov | https://claude.ai/artifact/ScfrgrN64oUUKu26CjrVab |
| Figma | File "ARC - touchgrass", key `2CLv3TnbvqAbqJpFRfLqJ2` |
| Abdullah's copy | `~/Desktop/ARC` on his Mac; Docker, Android Studio, emulator "Medium Phone API 37" and Node 22 are installed |
| Project documents | In the "FYP" Claude project: proposal, defense slides, handbook, log book template, report template |

**First thing to do:** ask Abdullah to merge #1 then #2 (or confirm they are merged), then branch
new work from `main`. If they are not merged, branch from `feat/liveness-gate`.

## 2. Decisions already made (do not reopen without Abdullah)

- **Stack:** React Native + Expo + TypeScript; FastAPI + PostgreSQL (+ PostGIS later) + Redis;
  S3-compatible storage later; REST under `/api/v1`; npm workspaces monorepo.
- **Name and ID:** Arc, package `pk.arc.app`, minimum Android 10 (API 29). iOS later, no rewrite.
- **Scale target:** 5,000+ users at launch; load test at 5,000 concurrent.
- **Sign-up:** email + 6-digit email code -> username + password -> 18+ gate -> liveness check.
  The account cannot use the app until liveness passes.
- **Log-in:** username or email + password. A phone the account has not used needs an email code.
- **Sessions:** stay signed in until log-out. Auto sign-out only on password change or reset,
  suspension, a stolen refresh token, or 90 days idle.
- **No SMS cost.** Phone codes by WhatsApp/SMS may come later through the same code interface.
- **University email** at sign-up covers the university-verification requirement. Host verification
  uses email codes for now.
- **Scope includes all four extras:** organisation members + door staff, moderator web panel,
  two-way host chat, partner vouchers. **Cut order if time runs out:** two-way chat, vouchers,
  interview scheduling, calendar view, casual plans, real payment gateway.
- **Dropped:** personality questions.
- **Technical choices accepted:** ECDSA P-256 keys in the Android Keystore (not Ed25519); our own
  Kotlin Expo module `arc-proximity` for Bluetooth advertise + scan; rotating ticket QR codes;
  offline door mode; on-device calendar; a curated Lahore venue table; a mock payment provider.
- **Timeline:** pilot in semester 8 weeks 8-11; public launch weeks 12-15.
- **Test devices:** 4+ Android phones including a low-end one.
- **Screens with no Figma design** are built from existing patterns and marked provisional; the
  Figma version wins when it arrives.
- **Splash:** plays only when the app opens signed out (Abdullah has seen this choice; change if asked).

## 3. Working with Figma

- Pages: cover `1:2`, brand identity `208:6`, work `0:1`, **final screens `321:6`**, screens `234:20`.
- "final screens" holds a captured gallery of 210 screens in groups A-O, frame `385:3`. Each
  screen is a card: a phone frame (164 x 354) with a label under it such as `A-LIVE-INTRO`.
- **To find a screen:** on page `321:6`, find the TEXT node whose characters equal the screen ID.
  The card is `text.parent.parent.parent`; the phone frame is `card.children[0]`. Screenshot that
  frame at scale 4 to read it.
- Liveness label nodes: INTRO `385:968`, PERM `385:1036`, CAPTURE `385:1089`,
  PROCESSING `385:1145`, PASSED `385:1187`, FAILED `385:1249`, REVIEW `385:1292`.
  Shell: `385:3664`. Welcome 3: `385:516`.
- The file has no variables, styles or components. Values were measured by hand into
  `packages/tokens/tokens.json`.
- **"fin" (`383:6`) is a Figma Make code layer. Its source cannot be read through the Figma tools.**
  When exact behaviour or animation matters, ask Abdullah to open "Open code editor" and paste the
  file. The splash was ported that way.
- The logo lives on the brand page, section `211:4859`; the wordmark vector is `298:4`.
- Abdullah's Figma plan has a limit on tool calls. Batch reads; do not screenshot one node per call
  when a single script can list many.
- Never write to the Figma file.

## 4. What exists

See `docs/STATUS.md` for the table. In code terms:

- **Backend** `backend/arc`: `core` (config, errors, db, security, rate limit, email, audit,
  health) and `modules/identity` (models, schemas, otp, passwords, emails, service, liveness, deps,
  router). 52 tests. Migrations `0001_identity`, `0002_liveness_checks`.
- **Liveness:** `LivenessProvider` interface with `StubLivenessProvider` only. `VerifiedDep` is the
  dependency that later routes use for anything only a verified person may do.
- **App** `apps/mobile/src`: `app/(auth)` welcome, sign-up, log-in, forgot password;
  `app/(verify)` liveness (provisional, one screen); `app/(app)/(tabs)` five tabs, four of them
  honest "not built yet" notices, plus profile and change password; `features/splash` animated
  splash; `auth/` session storage and provider. 59 tests.
- **Packages:** tokens, 13 UI components, generated API client.

## 5. Not verified yet

- Tab bar fix, new app icon and the splash animation have not been confirmed on a device with
  screenshots. Ask Abdullah for screenshots or a recording first thing.
- Nothing has run on a physical phone.
- Sign-up, log-in and password screens have not been compared with Figma on a device.
- The CI Android build for the final commits was still running when the session ended. One earlier
  run failed on a corrupted NDK download on the runner (not our code).

## 6. Task list, in order

Each task is one branch and one pull request. Do not start a task whose "needs" are missing: ask.

### Task 1 — Confirm the last session's work on a device
Ask Abdullah to pull, run, and send screenshots of: splash (signed out), tab bar on each tab,
app icon, sign-up, code entry, log-in, liveness. Fix what differs from Figma.
**Done when:** Abdullah confirms each screen, or every difference is fixed.

### Task 2 — Liveness screens matched to Figma
Replace the single provisional screen with Figma's flow: A-LIVE-INTRO, -PERM, -CAPTURE,
-PROCESSING, -PASSED, -FAILED, -REVIEW. Read each screen from Figma first (section 3).
The stand-in provider stays, so CAPTURE cannot run a real face check: ask Abdullah how the
stand-in should behave on that screen before building it (for example a clearly marked
development control). Camera permission needs `expo-camera` and a native rebuild.
**Needs:** nothing new for the screens; a decision for CAPTURE.
**Done when:** the registry lists each route with its Figma ID, journeys are tested, Abdullah
confirms visuals.

### Task 3 — `arc-proximity` test (highest technical risk)
A Kotlin Expo module for Bluetooth LE advertise + scan and ECDSA P-256 signing with a key in the
Android Keystore, with a small test screen. Run on two real phones; write up range, reliability,
battery and a go/no-go in `docs/`.
**Needs:** two Android phones over USB. Ask Abdullah before starting.
**Done when:** the write-up exists with measured results from real phones.

### Task 4 — Phase 1 and onwards
Follow section 8 of the planning document (5 phases; screens tiered P1, P2, P3; build P1 first).
Read that section and section 2 (requirements) before starting, and confirm the first Phase 1
slice with Abdullah. Expected first slices: profile and onboarding (A-INTERESTS, A-ROLE,
A-CALENDAR, A-AVAILABILITY, A-AREA, A-OPEN, A-DONE), then events and the Explore feed, then
tickets and check-in.
Each slice: Figma screens read first -> data model + migration -> API + tests -> generated client
-> screens + journey tests -> registry -> Abdullah confirms on device.

### Standing items
- Add the remaining UI components as screens need them.
- Move the project from Node 22 to Node 24 (22 is in maintenance).
- Review `npm audit` output.
- Turn on branch protection once a second reviewer is active.
- Record significant decisions as short notes in `docs/decisions/`.
- The real liveness provider (Noor's workstream) replaces the stand-in behind `LivenessProvider`.
- Menahil: Figma variables and components, and designs for provisional screens.

## 7. Environment notes

**Abdullah's Mac**
```bash
cd ~/Desktop/ARC && git pull
docker compose up -d --build        # API on :8000, docs at /api/docs, test inbox at :8025
adb reverse tcp:8000 tcp:8000       # lets the emulator reach the API
npm install && npm run android      # press r to reload, a to reopen
```
- Run only one emulator at a time. A black emulator screen usually means it is asleep.
- First builds are slow (Android about 20 minutes; Docker downloads packages once).
- `docker compose down -v` deletes the test database. `stop` and `down` are safe.
- A test `installation_id` for the API page must be 16-64 characters.

**Claude's cloud workspace (if used)**
- No Docker there. PostgreSQL and Redis must be started by hand before backend tests, with a
  database `arc_test` owned by user `arc`.
- The GitHub CLI may not be signed in. The GitHub REST API through `curl` works for reading
  Actions results and opening pull requests (send `Content-Type: application/json`).
- Android builds cannot run there; CI builds the APK. Only Abdullah can run the app.
- A linked Mac folder gives a Linux shell on the project files only. It cannot run `adb`, Docker
  or the Android build.

## 8. How Abdullah works

- He makes the decisions alone for now; the other two members review later.
- He tests on the emulator and sends screenshots. Give him exact commands, one step at a time,
  and say what he should see.
- He wants honest status: what is done, what is left, what deviates from the plan, after each
  milestone.
- Session time is limited. Prefer finishing one task properly over starting three.
