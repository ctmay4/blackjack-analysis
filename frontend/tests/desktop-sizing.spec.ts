import { test, expect } from "./helpers";

for (const width of [1024, 1440, 1920, 2560]) {
  test(`readable desktop cards and type at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto("/");
    await page.getByRole("button", { name: "Start practice" }).click();
    await expect(page.locator(".player-hand")).toBeVisible();
    const sizes = await page.evaluate(() => {
      const fontSize = (selector: string) =>
        parseFloat(
          getComputedStyle(document.querySelector(selector)!).fontSize,
        );
      // Measure layout, not the animated/transformed visual rectangle, whose
      // floating-point edges can subtract to slightly less than 148px.
      const card = document.querySelector<HTMLElement>(".player-hand .card")!;
      return {
        cardWidth: card.offsetWidth,
        cardHeight: card.offsetHeight,
        feedback: fontSize(".feedback p"),
        action: fontSize(".action-button"),
        metric: fontSize(".metric-label"),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(sizes.cardWidth).toBeGreaterThanOrEqual(104);
    expect(sizes.cardHeight).toBeGreaterThanOrEqual(148);
    expect(sizes.feedback).toBeGreaterThanOrEqual(14);
    expect(sizes.action).toBeGreaterThanOrEqual(16);
    expect(sizes.metric).toBeGreaterThanOrEqual(14);
    expect(sizes.overflow).toBe(false);
    await page.getByRole("button", { name: "Open strategy chart" }).click();
    await expect(page.getByRole("table")).toHaveCount(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.keyboard.press("Escape");
    if (width === 1920) {
      // Large cards must not push the primary controls below a 1080p viewport.
      const actions = await page.locator(".actions").boundingBox();
      expect(actions!.y + actions!.height).toBeLessThanOrEqual(1080);
      await page.screenshot({
        path: "test-results/large-desktop.png",
        fullPage: true,
      });
    }
  });
}
