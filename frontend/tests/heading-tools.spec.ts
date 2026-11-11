import { test, expect } from "./helpers";

for (const width of [320, 390, 1280, 1440]) {
  test(`summary and chart stay in the heading without a page footer at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator(".page-footer")).toHaveCount(0);
    await page.getByRole("button", { name: "Start practice" }).click();
    const heading = page.locator(".page-heading");
    const summary = heading.getByRole("button", {
      name: "View session summary",
    });
    const chart = heading.getByRole("button", { name: "Open strategy chart" });
    await expect(summary).toBeVisible();
    await expect(chart).toBeVisible();
    await expect(page.locator(".session-footer, .page-footer")).toHaveCount(0);
    await expect(
      page.getByText("BUILT FOR BETTER DECISIONS", { exact: true }),
    ).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const summaryBounds = (await summary.boundingBox())!;
    const chartBounds = (await chart.boundingBox())!;
    expect(summaryBounds.y).toBeLessThan(300);
    expect(Math.abs(summaryBounds.y - chartBounds.y)).toBeLessThan(10);
    expect(summaryBounds.x + summaryBounds.width).toBeLessThanOrEqual(
      chartBounds.x,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 1440) {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight,
        ),
      ).toBe(true);
    }
    await summary.click();
    await expect(
      page.getByRole("heading", { name: "Session summary", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(summary).toBeFocused();
    await chart.click();
    await expect(page.getByRole("table")).toHaveCount(3);
    await page.keyboard.press("Escape");
    await expect(chart).toBeFocused();
    await page.screenshot({
      path: `test-results/heading-tools-${width}.png`,
      fullPage: true,
    });
  });
}
