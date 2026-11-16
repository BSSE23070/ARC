// Where the API lives. Override with EXPO_PUBLIC_API_URL in apps/mobile/.env.
//
// The default works on the emulator and on a USB-connected phone once you run
//   adb reverse tcp:8000 tcp:8000
// which forwards the phone's localhost:8000 to your computer.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
