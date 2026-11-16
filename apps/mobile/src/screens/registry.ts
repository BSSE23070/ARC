/**
 * Every route in the app and the Figma screen it implements.
 *
 * design: 'figma'        built from a screen in "ARC - touchgrass / final screens"
 * design: 'provisional'  no Figma screen yet: built from existing patterns and
 *                        to be restyled when the design arrives (Figma wins)
 * design: 'notice'       honest "not built yet" notice, replaced when the module lands
 *
 * A test (registry.test.ts) fails if a route file is missing from this list,
 * so no provisional screen can be forgotten.
 */
export type ScreenEntry = {
  route: string;
  figma: string | null;
  design: 'figma' | 'provisional' | 'notice';
  note?: string;
};

export const SCREENS: ScreenEntry[] = [
  { route: '(auth)/index', figma: 'A-WELCOME-1..3, C-SESSION', design: 'figma', note: 'C-SUSPENDED copy not yet read from Figma' },
  { route: '(auth)/sign-up/index', figma: 'A-PHONE', design: 'provisional', note: 'Email instead of phone number' },
  { route: '(auth)/sign-up/code', figma: 'A-OTP, A-OTP-WRONG', design: 'figma', note: 'Code is emailed' },
  { route: '(auth)/sign-up/account', figma: null, design: 'provisional', note: 'Create username + password' },
  { route: '(auth)/sign-up/age', figma: 'A-AGE', design: 'figma' },
  { route: '(auth)/sign-up/under-18', figma: 'A-UNDER18', design: 'figma', note: 'Copy says "no account was created"' },
  { route: '(auth)/log-in/index', figma: null, design: 'provisional', note: 'Log in with username or email' },
  { route: '(auth)/log-in/code', figma: 'A-EMAIL-CODE', design: 'provisional', note: 'New-phone email code' },
  { route: '(auth)/forgot-password/index', figma: null, design: 'provisional' },
  { route: '(auth)/forgot-password/reset', figma: null, design: 'provisional' },
  { route: '(verify)/index', figma: 'A-LIVE-INTRO..A-LIVE-REVIEW', design: 'provisional', note: 'Not yet matched to Figma; real face check not connected' },
  { route: '(app)/(tabs)/index', figma: 'C-ATTENDEE-SHELL', design: 'notice', note: 'Explore: Phase 1' },
  { route: '(app)/(tabs)/meet', figma: 'C-ATTENDEE-SHELL', design: 'notice', note: 'Meet: Phase 1' },
  { route: '(app)/(tabs)/check-in', figma: 'C-ATTENDEE-SHELL', design: 'notice', note: 'Check-in: Phase 1' },
  { route: '(app)/(tabs)/photobooth', figma: 'C-ATTENDEE-SHELL', design: 'notice', note: 'Photobooth: Phase 2' },
  { route: '(app)/(tabs)/profile', figma: 'L-PROFILE', design: 'provisional', note: 'Minimal until Phase 2' },
  { route: '(app)/change-password', figma: null, design: 'provisional' },
];
