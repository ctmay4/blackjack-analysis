import { test, expect } from "./helpers";

for (const viewport of [
  { width: 1920, height: 1800 },
  { width: 390, height: 844 },
]) {
  test(`background covers the viewport on setup and during practice at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const expectFullBackground = async () => {
      const background = await page.evaluate(() => ({
        height: document.body.getBoundingClientRect().height,
        viewportHeight: innerHeight,
        repeat: getComputedStyle(document.body).backgroundRepeat,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      }));
      expect(background.height).toBeGreaterThanOrEqual(
        background.viewportHeight,
      );
      for (const repeat of background.repeat.split(",")) {
        expect(repeat.trim()).toBe("no-repeat");
      }
      expect(background.horizontalOverflow).toBe(false);
    };
    await expect(
      page.getByRole("button", { name: "Start practice" }),
    ).toBeVisible();
    await expectFullBackground();
    await page.getByRole("button", { name: "Start practice" }).click();
    await expect(page.locator(".player-hand")).toBeVisible();
    await expectFullBackground();
    await page.getByRole("button", { name: "Stand S", exact: true }).click();
    await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
    await expectFullBackground();
    await page.screenshot({
      path: `test-results/page-background-${viewport.width}.png`,
      fullPage: true,
    });
  });
}
