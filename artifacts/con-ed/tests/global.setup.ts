import { clerkSetup } from "@clerk/testing/playwright";

/**
 * Fetches a Clerk Testing Token (using CLERK_SECRET_KEY) and exposes it to the
 * test run so that `setupClerkTestingToken` can bypass Clerk's bot protection
 * during programmatic sign-in.
 */
export default async function globalSetup() {
  await clerkSetup();
}
