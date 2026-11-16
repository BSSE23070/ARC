// Every user-facing string lives here, so adding Urdu later is one new file.
// Copy marked "Figma" is taken word for word from the final screens.
export const en = {
  common: {
    back: 'Back',
    continue: 'Continue',
    close: 'Close',
    done: 'Done',
    tryAgain: 'Try again',
    resendIn: 'Resend in {time}',
    resendCode: 'Resend code',
    codeSent: 'We sent a new code.',
  },
  errors: {
    network: "Can't reach Arc. Check your connection and try again.",
    generic: 'Something went wrong. Please try again.',
    otpInvalid: "That code didn't match. {count} tries left.", // Figma: A-OTP-WRONG
    otpInvalidOne: "That code didn't match. 1 try left.",
  },
  welcome: {
    skip: 'Skip',
    next: 'Next',
    start: "Let's go",
    pages: [
      // Figma: A-WELCOME-1..3
      {
        title: 'Find your people.',
        body: "We match you on what you love and when you're free. No endless scrolling.",
      },
      {
        title: 'Show up.',
        body: "RSVP, grab your ticket and check in when you arrive. That's the whole trick.",
      },
      {
        title: 'Keep the memory.',
        body: 'Every plan you show up to unlocks the Photobooth. Your strips stay sorted by date.',
      },
    ],
  },
  signUp: {
    emailTitle: "What's your email?",
    emailBody: "We'll email you a 6-digit code. No spam, ever.",
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    emailInvalid: 'Enter a valid email address.',
    sendCode: 'Send code', // Figma: A-PHONE
    haveAccount: 'I already have an account',
    codeTitle: 'Enter the code', // Figma: A-OTP
    codeBody: 'Sent to {email}',
    verify: 'Verify',
    accountTitle: 'Create your login',
    accountBody: "Pick a username and a password. You'll use these to log in.",
    usernameLabel: 'Username',
    usernamePlaceholder: 'maryam_t',
    usernameHint: '3 to 20 letters, numbers, dots or underscores.',
    usernameInvalid: 'Use 3 to 20 letters, numbers, dots or underscores.',
    passwordLabel: 'Password',
    passwordHint: 'At least 10 characters. A short phrase works well.',
    passwordTooShort: 'Use at least 10 characters.',
    ageTitle: 'Are you 18 or older?', // Figma: A-AGE
    ageBody: 'ARC is for adults. We only ask once.',
    dobLabel: 'Date of birth',
    dobPlaceholder: 'DD / MM / YYYY',
    dobInvalid: 'Enter a real date, like 14 / 03 / 2002.',
    ageConfirm: "Yes, I'm 18 or older",
    ageDecline: "I'm under 18",
    under18Title: 'ARC is 18+ for now', // Figma: A-UNDER18
    under18Body: "We'll be here when you're ready. No account was created.",
    sessionExpired: 'That took a while. Please verify your email again.',
  },
  logIn: {
    title: 'Welcome back',
    body: 'Log in with your username or email.',
    identifierLabel: 'Username or email',
    passwordLabel: 'Password',
    submit: 'Log in',
    forgot: 'Forgot password?',
    required: 'Enter your username or email, and your password.',
    newPhoneTitle: 'Check your inbox', // Figma: A-EMAIL-CODE
    newPhoneBody: 'This is a new phone, so we sent a code to {email}.',
    passwordChanged: 'Password changed. Log in with your new password.',
  },
  forgot: {
    title: 'Reset your password',
    body: "Enter your email and we'll send you a code.",
    resetTitle: 'Choose a new password',
    resetBody: 'Enter the code we sent to {email}, then a new password.',
    newPasswordLabel: 'New password',
    submit: 'Reset password',
    codeRequired: 'Enter the 6-digit code from your email.',
  },
  session: {
    endedTitle: "You've been logged out", // Figma: C-SESSION
    endedBody: 'For your safety, please log in again to keep going.',
    logInAgain: 'Log in again',
    suspendedTitle: 'Account suspended',
    suspendedBody: "This account can't be used right now. Contact support if you think this is a mistake.",
  },
  tabs: {
    explore: 'Explore',
    meet: 'Meet',
    checkIn: 'Check in',
    photobooth: 'Photobooth',
    profile: 'Profile',
  },
  shell: {
    offline: "You're offline",
    // Honest notices while the modules behind these tabs are being built.
    exploreTitle: 'Explore opens in Phase 1',
    exploreBody: 'Events near you will show up here once the events module is built.',
    meetTitle: 'Meet opens in Phase 1',
    meetBody: 'Planning meetups with friends arrives with the matching module.',
    checkInTitle: 'Check-in opens in Phase 1',
    checkInBody: 'Ticket scanning and Bluetooth check-in arrive with the verification module.',
    photoboothTitle: 'Photobooth opens in Phase 2',
    photoboothBody: 'Photo strips unlock after a verified check-in, once check-in is built.',
  },
  splash: {
    label: 'Arc is opening',
  },
  liveness: {
    title: "Verify it's really you",
    body: 'A quick check that a real person is setting up this account. Everyone on Arc does it once.',
    privacy: 'We keep only the result, never a photo or video.',
    start: 'Start check',
    tryAgain: 'Try again',
    logOut: 'Log out',
    failedTitle: "That didn't work",
    failedBody: 'We could not confirm the check. You have {count} tries left today.',
    failedBodyOne: 'We could not confirm the check. You have 1 try left today.',
    failedBodyNone: "We could not confirm the check, and you've used today's tries. Please try again tomorrow.",
    expired: 'That took too long. Please start again.',
    unsupported: 'This version of Arc cannot run the check. Please update the app.',
    // Shown only while the development stand-in is connected instead of the real face check.
    stubNotice: 'Development build: the real face check is not connected yet.',
    stubPass: 'Simulate a pass',
    stubFail: 'Simulate a fail',
  },
  profile: {
    title: 'Profile',
    emailLabel: 'Email',
    identityLabel: 'Identity check',
    identityPending: 'Not done yet',
    identityPassed: 'Verified',
    changePassword: 'Change password',
    logOut: 'Log out',
  },
  changePassword: {
    title: 'Change password',
    body: 'Your other phones will be logged out.',
    currentLabel: 'Current password',
    newLabel: 'New password',
    submit: 'Change password',
    doneTitle: 'Password changed',
    doneBody: 'Your other phones were logged out.',
  },
} as const;
