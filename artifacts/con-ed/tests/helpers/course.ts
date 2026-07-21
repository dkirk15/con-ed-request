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

  await page.locator('input[name="courseProvider"]').fill(options.provider ?? "E2E Course Provider");
  await page.locator('input[name="courseStartDate"]').fill(options.startDate ?? "2026-09-15");
  await page.locator('input[name="courseEndDate"]').fill(options.endDate ?? "2026-09-16");

  // Radix UI <SelectTrigger> renders as role="combobox"; target it directly
  // rather than via getByLabel to avoid accidentally hitting the hidden native
  // <select> that some Radix versions inject for form accessibility.
  await page.getByRole("combobox").click();
  const option = page.getByRole("option", { name: deliveryMethod, exact: true });
  await option.waitFor({ state: "visible" });
  await option.click();

  if (deliveryMethod !== "Virtual") {
    await page.locator('input[name="location"]').fill(options.location ?? "Seattle, WA");
  }
}
