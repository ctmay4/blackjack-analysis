import { test, expect } from "./helpers";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`gameplay animations respect ${reducedMotion} without blocking actions`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/");
    await page.getByRole("button", { name: "Start practice" }).click();
    const dealer = page.locator(".dealer-zone .card");
    await expect(dealer).toHaveCount(2);
    expect(
      await dealer
        .first()
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe(reducedMotion === "reduce" ? "none" : "card-arrive");
    await expect(
      page.getByRole("img", { name: "Face-down card" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Stand S", exact: true }).click();
    await expect(page.getByRole("img", { name: "Face-down card" })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Next hand" }).click();
    // The seeded second round is a natural: it settles without a choice.
    await expect(page.locator(".round-caption")).toContainText("Round 2");
    await expect(page.getByRole("button", { name: "Next hand" })).toBeEnabled();
  });
}

test("charts show real weighted history across sessions and survive refresh on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page.getByLabel("Feedback mode").selectOption("correction");
  await page.getByRole("button", { name: "Start practice" }).click();
  await page.getByRole("button", { name: "Hit H", exact: true }).click();
  await expect(page.locator(".feedback.mistake")).toBeVisible();
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open saved history" }),
  ).toBeEnabled();
  await page.keyboard.press("q");
  await page.getByRole("button", { name: "End session" }).click();
  await expect(
    page.getByRole("heading", { name: "Set up your practice" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start practice" }).click();
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open saved history" }),
  ).toBeEnabled();
  await page.keyboard.press("q");
  await page.getByRole("button", { name: "End session" }).click();
  await expect(
    page.getByRole("heading", { name: "Set up your practice" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open saved history" }).click();
  await expect(
    page.getByRole("img", { name: "Cumulative accuracy", exact: true }),
  ).toBeVisible();
  await page.getByText("View progress data", { exact: true }).click();
  const rows = page.locator(".progress-data tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("1 / 2");
  await expect(rows.nth(0)).toContainText("50.0%");
  await expect(rows.nth(1)).toContainText("2 / 3");
  await expect(rows.nth(1)).toContainText("66.7%");
  expect(
    await page
      .getByRole("dialog")
      .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/historical-charts-mobile.png" });
});
