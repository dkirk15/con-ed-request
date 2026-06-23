import { test as base, expect } from "@playwright/test";
import { customAlphabet } from "nanoid";
// Restrict to lowercase alphanumeric — Clerk normalises email local parts and
// may strip or alter underscores / hyphens that appear in nanoid's default alphabet.
const emailId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);
import { createClerkUser, deleteClerkUser, signIn } from "./helpers/clerk";
import { insertUser, type Role } from "./helpers/db";

export interface TestUser {
  clerkId: string;
  dbId: number;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  role: Role;
  clinicId: number | null;
  managerId: number | null;
}

export interface ProvisionUserInput {
  role: Role;
  firstName?: string;
  lastName?: string;
  clinicId?: number | null;
  managerId?: number | null;
  hireDate?: string | null;
}

export interface SignedUpUser {
  clerkId: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
}

interface Fixtures {
  /**
   * Creates a Clerk user (dev instance) and a matching DB user row with the
   * requested role/clinic, so that when the app provisions the user on first
   * request it finds the pre-seeded record. All created Clerk users are deleted
   * during fixture teardown.
   */
  provisionUser: (input: ProvisionUserInput) => Promise<TestUser>;
  /**
   * Creates a Clerk user only — no DB row. Used to exercise the app's
   * auto-provision path (first authenticated request inserts a `role=employee`
   * record), after which a test can promote the account with `setRole`. All
   * created Clerk users are deleted during fixture teardown.
   */
  signUpUser: (input?: {
    firstName?: string;
    lastName?: string;
  }) => Promise<SignedUpUser>;
  /** Programmatically signs the given user in within the current browser page. */
  signInAs: (user: { email: string }) => Promise<void>;
}

export const test = base.extend<Fixtures>({
  provisionUser: async ({}, use) => {
    const createdClerkIds: string[] = [];

    const provision = async (input: ProvisionUserInput): Promise<TestUser> => {
      const id = emailId();
      const firstName = input.firstName ?? "E2E";
      const lastName = input.lastName ?? id;
      const name = `${firstName} ${lastName}`;
      const email = `e2e.${id}+clerk_test@example.com`;

      const clerkId = await createClerkUser({ firstName, lastName, email });
      createdClerkIds.push(clerkId);

      const dbId = await insertUser({
        clerkId,
        name,
        email,
        role: input.role,
        clinicId: input.clinicId ?? null,
        managerId: input.managerId ?? null,
        hireDate: input.hireDate ?? null,
      });

      return {
        clerkId,
        dbId,
        email,
        name,
        firstName,
        lastName,
        role: input.role,
        clinicId: input.clinicId ?? null,
        managerId: input.managerId ?? null,
      };
    };

    await use(provision);

    for (const clerkId of createdClerkIds) {
      await deleteClerkUser(clerkId);
    }
  },

  signUpUser: async ({}, use) => {
    const createdClerkIds: string[] = [];

    const signUp = async (input?: {
      firstName?: string;
      lastName?: string;
    }): Promise<SignedUpUser> => {
      const id = emailId();
      const firstName = input?.firstName ?? "E2E";
      const lastName = input?.lastName ?? id;
      const name = `${firstName} ${lastName}`;
      const email = `e2e.${id}+clerk_test@example.com`;

      const clerkId = await createClerkUser({ firstName, lastName, email });
      createdClerkIds.push(clerkId);

      return { clerkId, email, name, firstName, lastName };
    };

    await use(signUp);

    for (const clerkId of createdClerkIds) {
      await deleteClerkUser(clerkId);
    }
  },

  signInAs: async ({ page }, use) => {
    await use(async (user: { email: string }) => {
      await signIn(page, user.email);
    });
  },
});

export { expect };
