## What and why

<!-- One or two sentences. Link the requirement: FR-01, NFR-02, ... -->

## How to check it

<!-- Commands to run, or the screens to open and what you should see. -->

## Checklist

- [ ] CI is green
- [ ] Tests cover the new logic (and a regression test for any bug fixed)
- [ ] Loading, empty and error states handled for any new screen
- [ ] New screens are listed in `apps/mobile/src/screens/registry.ts`
- [ ] No secrets, tokens or personal data in code, logs or screenshots
- [ ] API changed? Ran `python -m arc.export_openapi ...` and `npm run api:generate`
