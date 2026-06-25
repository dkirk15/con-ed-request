import { test, expect } from "./fixtures";
import { getUserByEmail, setRole, query } from "./helpers/db";
import { nanoid } from "nanoid";

/**
 * Admin clinic management: an admin can add a new clinic to the clinic list via
 * the UI (POST /api/clinics, admin-gated). Duplicate names are rejected
 * case-insensitively with a 409 surfaced as an error toast.
 *
 * Admins are onboarded the real-world way: a brand-new Clerk account is
 * auto-provisioned as `employee` on first authenticated request, then promoted
 * to `admin` in the database.
 */
test("admin adds a new clinic via the UI and cannot add a duplicate", async ({
  page,
  signUpUser,
  signInAs,
}) => {
  const clinicName = `E2E Clinic ${nanoid(6)}`;

  const adminCandidate = await signUpUser();
  await signInAs(adminCandidate);

  // First authenticated request auto-provisions the account as an employee.
  await page.goto("/dashboard");
  await expect
    .poll(async () => (await getUserByEmail(adminCandidate.email))?.role, {
      timeout: 15_000,
    })
    .toBe("employee");

  // Promote to admin (DB), as an existing admin would.
  await setRole(adminCandidate.email, { role: "admin" });

  try {
    // Admin opens the Clinics page.
    await page.goto("/clinics");
    await expect(
      page.getByRole("heading", { name: "Clinics", exact: true }),
    ).toBeVisible();

    // Add a new clinic via the dialog.
    await page.getByRole("button", { name: "Add Clinic" }).click();
    await page.getByLabel("Clinic name").fill(clinicName);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Add Clinic" })
      .click();

    // The new clinic appears in the directory table.
    await expect(
      page.getByRole("row").filter({ hasText: clinicName }),
    ).toBeVisible();

    // And it is persisted in the database (exactly one row).
    await expect
      .poll(async () =>
        (await query("SELECT id FROM clinics WHERE name = $1", [clinicName]))
          .length,
      )
      .toBe(1);

    // Adding the same name again (different case) is rejected with a 409 toast.
    await page.getByRole("button", { name: "Add Clinic" }).click();
    await page.getByLabel("Clinic name").fill(clinicName.toUpperCase());
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Add Clinic" })
      .click();

    await expect(
      page.getByText("A clinic with this name already exists.", { exact: true }),
    ).toBeVisible();

    // No duplicate row was created.
    const count = (
      await query("SELECT id FROM clinics WHERE lower(name) = lower($1)", [
        clinicName,
      ])
    ).length;
    expect(count).toBe(1);
  } finally {
    // Cleanup any clinic row(s) created by this test.
    await query("DELETE FROM clinics WHERE lower(name) = lower($1)", [
      clinicName,
    ]);
  }
});

/**
 * Authorization boundary: clinic creation is admin-only. A non-admin
 * (manager) calling POST /api/clinics from an authenticated browser session
 * with their active Clerk token is rejected with 403, and no row is created.
 */
test("non-admin cannot create a clinic via the API", async ({
  page,
  provisionUser,
  signInAs,
}) => {
  const name = `E2E Clinic Forbidden ${nanoid(6)}`;

  const manager = await provisionUser({ role: "manager" });
  await signInAs(manager);
  await page.goto("/dashboard");

  // After navigation Clerk re-initialises; wait until the session (and thus a
  // usable token) is available before exercising the authenticated endpoint.
  await page.waitForFunction(() =>
    Boolean(
      (window as Window & { Clerk?: { session?: unknown } }).Clerk?.session,
    ),
  );

  const status = await page.evaluate(async (clinicName) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = await (window as any).Clerk?.session?.getToken();
    const res = await fetch("/api/clinics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: clinicName }),
    });
    return res.status;
  }, name);

  expect(status).toBe(403);

  // Ensure nothing was inserted.
  const count = (await query("SELECT id FROM clinics WHERE name = $1", [name]))
    .length;
  expect(count).toBe(0);
});
