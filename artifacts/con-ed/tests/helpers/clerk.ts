import { createClerkClient } from "@clerk/backend";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  throw new Error("CLERK_SECRET_KEY is required to run the E2E suite.");
}

const backend = createClerkClient({ secretKey });

// A fixed, complex password used for all programmatically-created test users.
// These users only ever exist in the development Clerk instance and are
// deleted after each test.
export const TEST_PASSWORD = "Oss-ConEd-E2E-Pw-2026!";

export interface CreateClerkUserInput {
  firstName: string;
  lastName: string;
  email: string;
}

export async function createClerkUser(
  input: CreateClerkUserInput,
): Promise<string> {
  const user = await backend.users.createUser({
    emailAddress: [input.email],
    password: TEST_PASSWORD,
    firstName: input.firstName,
    lastName: input.lastName,
    skipPasswordChecks: true,
  });
  return user.id;
}

export async function deleteClerkUser(clerkId: string): Promise<void> {
  try {
    await backend.users.deleteUser(clerkId);
  } catch {
    // Best-effort cleanup — ignore failures (e.g. already deleted).
  }
}

/**
 * Programmatically sign a user in via Clerk's testing helpers. This bypasses
 * the Clerk UI entirely (no real M365 SSO needed). It uses the email/ticket
 * strategy (Clerk mints a short-lived sign-in token with the secret key), which
 * internally waits until `window.Clerk.user` is populated before resolving.
 *
 * After this resolves, the browser holds an active Clerk session, so all
 * same-origin `/api/*` calls made by the app are authenticated automatically.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.loaded({ page });
  await clerk.signIn({ page, emailAddress: email });
  // Ensure the session is fully established (and persisted to the dev browser)
  // before any caller performs a full-page navigation.
  await page.waitForFunction(() => Boolean((window as Window & { Clerk?: { user?: unknown } }).Clerk?.user));
}
