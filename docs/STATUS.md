# Arc — where the build stands

Last updated: 16 Nov 2026. Update this file at the end of each working session.

## Working today

| Area | State |
| --- | --- |
| Sign-up (email code → username + password → 18+ gate) | Built, tested, run on an emulator |
| Log-in, new-phone email code, stay signed in, log out | Built, tested, run on an emulator |
| Forgot / reset / change password | Built and tested; not yet tried by hand on an emulator |
| Liveness gate (no app access until the check passes) | Built and tested. The check itself is a stand-in: see below |
| App shell: welcome carousel, five-tab bar, profile | Built; tabs other than Profile are placeholders |
| ARC app icon, launch mark and animated splash | Built from the Figma brand page and the "fin" prototype |
| CI (backend, app, Android APK), Docker Compose, README | Working |

## Known gaps

- **Liveness screens do not match Figma.** Figma has A-LIVE-INTRO, -PERM, -CAPTURE, -PROCESSING, -PASSED, -FAILED and -REVIEW. The app has one provisional screen (`apps/mobile/src/app/(verify)/index.tsx`).
- **The face check is a stand-in.** `StubLivenessProvider` passes when the app says so. The API refuses to start in production with it. The real provider goes behind `LivenessProvider` in `backend/arc/modules/identity/liveness.py`.
- **Screens not yet compared with Figma on a device:** sign-up, code entry, log-in, password screens.
- **Splash:** plays only when the app opens signed out. The system launch screen is black and the animation is white, so there is a colour jump between them.
- **Branch protection is off** on `main`.

## Next, in order

1. Match the liveness screens to Figma (A-LIVE-*).
2. `arc-proximity` test app: Bluetooth advertise + scan and hardware-backed signing keys, on two real Android phones. Highest technical risk, so it comes early.
3. Phase 1: events, tickets and the Explore feed (see the planning document).

## Open pull requests

- #1 Phase 0 foundations — ready to merge.
- #2 Liveness gate, splash, UI fixes — stacked on #1; merge #1 first.

## Run it

See the README. In short: start Docker Desktop and the emulator, then

```bash
docker compose up -d
adb reverse tcp:8000 tcp:8000
npm run android
```

Sign-in codes arrive at http://localhost:8025.
