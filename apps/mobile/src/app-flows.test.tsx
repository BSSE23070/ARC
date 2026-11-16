/**
 * End-to-end flows through the real screens and router, against a fake server.
 * These run in Jest (no phone needed) and cover the Phase 0 user journeys.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { renderRouter } from "expo-router/testing-library";

import { tokenStore } from "@/auth/storage";

jest.mock("expo-font", () => ({ useFonts: () => [true, null] }));
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => undefined),
}));

const USER = {
  id: "5f0c7c1e-0000-4000-8000-000000000001",
  email: "maryam@itu.edu.pk",
  username: "maryam_t",
  status: "active",
  liveness_status: "passed",
  created_at: "2026-11-16T10:00:00Z",
};
// A brand-new account has not done the liveness check yet.
const NEW_USER = { ...USER, liveness_status: "pending" };
const TOKENS = {
  access_token: "access-1",
  refresh_token: "refresh-1",
  token_type: "bearer",
  expires_in: 900,
  user: USER,
};
const CORRECT_CODE = "482193";

type Call = { path: string; body: any; auth: string | null };
type Reply = { status: number; body?: unknown };
let calls: Call[];
let overrides: Record<string, (call: Call) => Reply>;

const fail = (
  status: number,
  code: string,
  message: string,
  details = {},
): Reply => ({
  status,
  body: { error: { code, message, details } },
});

/** The fake Arc server. Individual tests replace routes through `overrides`. */
function server(call: Call): Reply {
  const override = overrides[call.path];
  if (override) return override(call);
  switch (call.path) {
    case "/auth/signup/start":
    case "/auth/password/forgot":
      return { status: 202, body: { status: "sent", resend_after_s: 30 } };
    case "/auth/signup/verify":
      return call.body.code === CORRECT_CODE
        ? {
            status: 200,
            body: { signup_token: "signup-token", expires_in: 900 },
          }
        : fail(400, "OTP_INVALID", "That code didn't match.", {
            attempts_remaining: 4,
          });
    case "/auth/signup/complete":
      return { status: 201, body: { ...TOKENS, user: NEW_USER } };
    case "/liveness/checks":
      return {
        status: 201,
        body: {
          check_id: "check-1",
          provider: "stub",
          expires_in: 300,
          client_payload: { mode: "stub" },
          attempts_left: 4,
        },
      };
    case "/liveness/checks/check-1/complete":
      return call.body.evidence.stub_outcome === "pass"
        ? {
            status: 200,
            body: {
              status: "passed",
              reason: null,
              attempts_left: 4,
              user: USER,
            },
          }
        : {
            status: 200,
            body: {
              status: "failed",
              reason: "stub_declined",
              attempts_left: 3,
              user: NEW_USER,
            },
          };
    case "/auth/login":
      return { status: 200, body: TOKENS };
    case "/auth/logout":
      return { status: 204 };
    case "/me":
      return call.auth === "Bearer access-1"
        ? { status: 200, body: USER }
        : fail(401, "TOKEN_INVALID", "bad token");
    default:
      return fail(404, "NOT_FOUND", `no fake route for ${call.path}`);
  }
}

const SAVED_SESSION = { accessToken: "access-1", refreshToken: "refresh-1" };

beforeEach(async () => {
  calls = [];
  overrides = {};
  (SecureStore as unknown as { __reset: () => void }).__reset();
  await tokenStore.clear(); // also drops the store's in-memory copy between tests
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    const call: Call = {
      path: url.replace(/^.*\/api\/v1/, ""),
      body: init.body ? JSON.parse(init.body as string) : undefined,
      auth: headers.Authorization ?? null,
    };
    calls.push(call);
    const reply = server(call);
    return {
      status: reply.status,
      text: async () =>
        reply.body === undefined ? "" : JSON.stringify(reply.body),
    };
  }) as unknown as typeof fetch;
});

const press = async (label: string) =>
  fireEvent.press(await screen.findByRole("button", { name: label }));
const type = async (label: string, value: string) =>
  fireEvent.changeText(await screen.findByLabelText(label), value);
const callTo = (path: string) => calls.find((call) => call.path === path);

async function reachCodeScreen() {
  await renderRouter("src/app", { initialUrl: "/" });
  expect(await screen.findByText("Find your people.")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText("Skip"));
  await type("Email", "Maryam@ITU.edu.pk");
  await press("Send code");
  expect(
    await screen.findByText("Sent to maryam@itu.edu.pk"),
  ).toBeOnTheScreen();
}

describe("sign-up", () => {
  it("takes a new user from the welcome screen into the app", async () => {
    await reachCodeScreen();
    expect(callTo("/auth/signup/start")!.body).toEqual({
      email: "maryam@itu.edu.pk",
    });

    await fireEvent.changeText(screen.getByTestId("otp-input"), CORRECT_CODE);
    await type("Username", "Maryam_T");
    await type("Password", "correct horse battery");
    await press("Continue");

    await type("Date of birth", "14032002");
    await press("Yes, I'm 18 or older");

    // A new account has to pass the liveness check before the app opens.
    expect(await screen.findByText("Verify it's really you")).toBeOnTheScreen();
    await press("Start check");
    await press("Simulate a pass");

    expect(
      await screen.findByText("Explore opens in Phase 1"),
    ).toBeOnTheScreen();
    expect(callTo("/liveness/checks/check-1/complete")!.body).toEqual({
      evidence: { stub_outcome: "pass" },
    });
    expect(callTo("/auth/signup/complete")!.body).toEqual({
      signup_token: "signup-token",
      username: "maryam_t",
      password: "correct horse battery",
      date_of_birth: "2002-03-14",
      installation_id: "11111111-2222-4333-8444-555555555555",
    });
    // The session is saved, so the next launch opens straight into the app.
    expect(
      JSON.parse((await SecureStore.getItemAsync("arc.session"))!),
    ).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });
  });

  it("shows how many tries are left after a wrong code", async () => {
    await reachCodeScreen();
    await fireEvent.changeText(screen.getByTestId("otp-input"), "000000");
    expect(
      await screen.findByText("That code didn't match. 4 tries left."),
    ).toBeOnTheScreen();
    expect(screen.queryByText("Create your login")).toBeNull();
  });

  it("catches an invalid email before calling the server", async () => {
    await renderRouter("src/app", { initialUrl: "/sign-up" });
    await type("Email", "not-an-email");
    await press("Send code");
    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeOnTheScreen();
    expect(calls).toEqual([]);
  });

  it("blocks under-18s without creating an account", async () => {
    overrides["/auth/signup/complete"] = () =>
      fail(403, "UNDERAGE", "Arc is 18+ for now.");
    await reachCodeScreen();
    await fireEvent.changeText(screen.getByTestId("otp-input"), CORRECT_CODE);
    await type("Username", "young_user");
    await type("Password", "correct horse battery");
    await press("Continue");
    await type("Date of birth", "01012012");
    await press("Yes, I'm 18 or older");

    expect(await screen.findByText("ARC is 18+ for now")).toBeOnTheScreen();
    expect(await SecureStore.getItemAsync("arc.session")).toBeNull();
  });

  it("sends the user back to fix a username that is taken", async () => {
    overrides["/auth/signup/complete"] = () =>
      fail(409, "USERNAME_TAKEN", "That username is taken. Try another.");
    await reachCodeScreen();
    await fireEvent.changeText(screen.getByTestId("otp-input"), CORRECT_CODE);
    await type("Username", "maryam_t");
    await type("Password", "correct horse battery");
    await press("Continue");
    await type("Date of birth", "14032002");
    await press("Yes, I'm 18 or older");

    expect(
      await screen.findByText("That username is taken. Try another."),
    ).toBeOnTheScreen();
    expect(screen.getByText("Create your login")).toBeOnTheScreen();
  });
});

describe("log-in and sessions", () => {
  it("logs in with a password on a known phone", async () => {
    await renderRouter("src/app", { initialUrl: "/log-in" });
    await type("Username or email", "maryam_t");
    await type("Password", "correct horse battery");
    await press("Log in");

    expect(
      await screen.findByText("Explore opens in Phase 1"),
    ).toBeOnTheScreen();
    expect(callTo("/auth/login")!.body).toMatchObject({
      identifier: "maryam_t",
      installation_id: expect.any(String),
    });
  });

  it("asks for an emailed code on a new phone", async () => {
    overrides["/auth/login"] = () => ({
      status: 202,
      body: {
        challenge: "email_code",
        challenge_token: "challenge",
        email_hint: "m***@itu.edu.pk",
        resend_after_s: 30,
      },
    });
    overrides["/auth/login/verify"] = (call) =>
      call.body.code === CORRECT_CODE
        ? { status: 200, body: TOKENS }
        : fail(400, "OTP_INVALID", "no", { attempts_remaining: 1 });

    await renderRouter("src/app", { initialUrl: "/log-in" });
    await type("Username or email", "maryam_t");
    await type("Password", "correct horse battery");
    await press("Log in");

    expect(
      await screen.findByText(
        "This is a new phone, so we sent a code to m***@itu.edu.pk.",
      ),
    ).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("otp-input"), "111111");
    expect(
      await screen.findByText("That code didn't match. 1 try left."),
    ).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId("otp-input"), CORRECT_CODE);
    expect(
      await screen.findByText("Explore opens in Phase 1"),
    ).toBeOnTheScreen();
    expect(callTo("/auth/login/verify")!.body).toMatchObject({
      challenge_token: "challenge",
    });
  });

  it("shows the server message for a wrong password", async () => {
    overrides["/auth/login"] = () =>
      fail(
        401,
        "INVALID_CREDENTIALS",
        "That username or password isn't right.",
      );
    await renderRouter("src/app", { initialUrl: "/log-in" });
    await type("Username or email", "maryam_t");
    await type("Password", "wrong");
    await press("Log in");
    expect(
      await screen.findByText("That username or password isn't right."),
    ).toBeOnTheScreen();
  });

  it("stays signed in across launches", async () => {
    await tokenStore.set(SAVED_SESSION);
    await renderRouter("src/app", { initialUrl: "/" });
    expect(
      await screen.findByText("Explore opens in Phase 1"),
    ).toBeOnTheScreen();
    expect(screen.queryByText("Find your people.")).toBeNull();
  });

  it("opens offline with the last known user", async () => {
    await tokenStore.set(SAVED_SESSION);
    await SecureStore.setItemAsync("arc.user", JSON.stringify(USER));
    (globalThis.fetch as jest.Mock).mockRejectedValue(
      new TypeError("Network request failed"),
    );

    await renderRouter("src/app", { initialUrl: "/" });
    expect(
      await screen.findByText("Explore opens in Phase 1"),
    ).toBeOnTheScreen();
  });

  it("explains when the server has ended the session", async () => {
    await tokenStore.set({ accessToken: "stale", refreshToken: "stale" });
    overrides["/me"] = () =>
      fail(401, "SESSION_REVOKED", "Please log in again.");

    await renderRouter("src/app", { initialUrl: "/" });
    expect(await screen.findByText("You've been logged out")).toBeOnTheScreen();
    expect(await SecureStore.getItemAsync("arc.session")).toBeNull();

    await press("Log in again");
    expect(await screen.findByText("Welcome back")).toBeOnTheScreen();
  });

  it("logs out from the profile tab", async () => {
    await tokenStore.set(SAVED_SESSION);
    await renderRouter("src/app", { initialUrl: "/profile" });
    expect(await screen.findByText("@maryam_t")).toBeOnTheScreen();

    await press("Log out");
    expect(await screen.findByText("Find your people.")).toBeOnTheScreen();
    await waitFor(() =>
      expect(callTo("/auth/logout")!.body).toEqual({
        refresh_token: "refresh-1",
      }),
    );
    expect(await SecureStore.getItemAsync("arc.session")).toBeNull();
  });
});

describe("liveness check", () => {
  const asNewUser = async () => {
    overrides["/me"] = () => ({ status: 200, body: NEW_USER });
    await tokenStore.set(SAVED_SESSION);
    await renderRouter("src/app", { initialUrl: "/" });
    expect(await screen.findByText("Verify it's really you")).toBeOnTheScreen();
  };

  it("keeps an unverified account out of the app, even by direct link", async () => {
    overrides["/me"] = () => ({ status: 200, body: NEW_USER });
    await tokenStore.set(SAVED_SESSION);
    await renderRouter("src/app", { initialUrl: "/profile" });
    expect(await screen.findByText("Verify it's really you")).toBeOnTheScreen();
    expect(screen.queryByText("@maryam_t")).toBeNull();
  });

  it("lets the user try again after a failed check", async () => {
    await asNewUser();
    await press("Start check");
    await press("Simulate a fail");
    expect(
      await screen.findByText(
        "We could not confirm the check. You have 3 tries left today.",
      ),
    ).toBeOnTheScreen();

    await press("Try again");
    await press("Simulate a pass");
    expect(
      await screen.findByText("Explore opens in Phase 1"),
    ).toBeOnTheScreen();
  });

  it("shows the server's message when today's tries are used up", async () => {
    overrides["/liveness/checks"] = () =>
      fail(
        429,
        "LIVENESS_ATTEMPTS_EXCEEDED",
        "You've used today's verification attempts. Please try again tomorrow.",
      );
    await asNewUser();
    await press("Start check");
    expect(
      await screen.findByText(
        "You've used today's verification attempts. Please try again tomorrow.",
      ),
    ).toBeOnTheScreen();
  });

  it("opens the app if the account turns out to be verified already", async () => {
    overrides["/liveness/checks"] = () =>
      fail(409, "LIVENESS_ALREADY_PASSED", "You've already been verified.");
    await asNewUser();
    overrides["/me"] = () => ({ status: 200, body: USER });
    await press("Start check");
    expect(
      await screen.findByText("Explore opens in Phase 1"),
    ).toBeOnTheScreen();
  });

  it("refuses a provider this version of the app does not know", async () => {
    overrides["/liveness/checks"] = () => ({
      status: 201,
      body: {
        check_id: "check-1",
        provider: "future",
        expires_in: 300,
        client_payload: {},
        attempts_left: 4,
      },
    });
    await asNewUser();
    await press("Start check");
    expect(
      await screen.findByText(
        "This version of Arc cannot run the check. Please update the app.",
      ),
    ).toBeOnTheScreen();
  });

  it("lets the user log out instead", async () => {
    await asNewUser();
    await press("Log out");
    expect(await screen.findByText("Find your people.")).toBeOnTheScreen();
  });
});

describe("passwords", () => {
  it("resets a forgotten password and returns to log-in", async () => {
    overrides["/auth/password/reset"] = () => ({ status: 204 });
    await renderRouter("src/app", { initialUrl: "/log-in" });
    await press("Forgot password?");
    await type("Email", "maryam@itu.edu.pk");
    await press("Send code");

    expect(await screen.findByText("Choose a new password")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("otp-input"), CORRECT_CODE);
    await type("New password", "a brand new passphrase");
    await press("Reset password");

    expect(
      await screen.findByText(
        "Password changed. Log in with your new password.",
      ),
    ).toBeOnTheScreen();
    expect(callTo("/auth/password/reset")!.body).toEqual({
      email: "maryam@itu.edu.pk",
      code: CORRECT_CODE,
      new_password: "a brand new passphrase",
    });
  });

  it("changes the password from the profile", async () => {
    overrides["/auth/password/change"] = (call) =>
      call.body.current_password === "correct horse battery"
        ? { status: 204 }
        : fail(
            400,
            "CURRENT_PASSWORD_WRONG",
            "Your current password isn't right.",
          );
    await tokenStore.set(SAVED_SESSION);
    await renderRouter("src/app", { initialUrl: "/profile" });

    await press("Change password");
    await type("Current password", "wrong one");
    await type("New password", "a brand new passphrase");
    await press("Change password");
    expect(
      await screen.findByText("Your current password isn't right."),
    ).toBeOnTheScreen();

    await type("Current password", "correct horse battery");
    await press("Change password");
    expect(await screen.findByText("Password changed")).toBeOnTheScreen();
    expect(callTo("/auth/password/change")!.auth).toBe("Bearer access-1");
  });
});
