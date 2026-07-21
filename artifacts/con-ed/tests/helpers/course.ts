import type { Page } from "@playwright/test";

export async function fillRequiredCourseDetails(
  page: Page,
  options: {
    provider?: string;
    startDate?: string;
    endDate?: string;
    deliveryMethod?: "In person" | "Virtual" | "Hybrid";
    location?: string;
  } = {},
) {
  const deliveryMethod = options.deliveryMethod ?? "Virtual";

  await page.getByLabel("Course provider *").fill(options.provider ?? "E2E Course Provider");
  await page.getByLabel("Start date *").fill(options.startDate ?? "2026-09-15");
  await page.getByLabel("End date *").fill(options.endDate ?? "2026-09-16");
  await page.getByLabel("Delivery method *").click();
  await page.getByRole("option", { name: deliveryMethod, exact: true }).click();

  if (deliveryMethod !== "Virtual") {
    await page.getByLabel("Course location *").fill(options.location ?? "Seattle, WA");
  }
}
