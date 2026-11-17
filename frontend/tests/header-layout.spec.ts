import { test, expect, startPractice } from "./helpers";

for (const width of [320, 1440]) {
  test(`compact header keeps modes and tools usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await startPractice(page);
    const modes = page.getByRole("group", { name: "Studio mode" });
    const tools = page.getByRole("navigation", { name: "Tools" });
    await expect(modes).toBeVisible();
    await expect(tools).toBeVisible();
    const modeBox = (await modes.boundingBox())!;
    const toolBox = (await tools.boundingBox())!;
    if (width === 1440) {
      expect(
        Math.abs(
          modeBox.y + modeBox.height / 2 - toolBox.y - toolBox.height / 2,
        ),
      ).toBeLessThan(2);
      expect(toolBox.x).toBeGreaterThan(modeBox.x + modeBox.width);
      expect(toolBox.x + toolBox.width).toBeGreaterThan(width - 60);
      const start = page.getByRole("button", {
        name: "Start timed practice",
        exact: true,
      });
      const startBox = (await start.boundingBox())!;
      expect(
        Math.abs(
          startBox.y + startBox.height / 2 - modeBox.y - modeBox.height / 2,
        ),
      ).toBeLessThan(2);
      expect(startBox.x).toBeGreaterThan(modeBox.x + modeBox.width);
      await expect(
        page
          .locator(".sidebar")
          .getByRole("region", { name: "Timed practice" }),
      ).toHaveCount(0);
      await expect(
        page.getByText("Optional timer;", { exact: false }),
      ).not.toBeVisible();
      expect(
        (await page.locator(".page-heading").boundingBox())!.y,
      ).toBeLessThan(150);
    }
    expect(
      await page
        .locator(".app-header")
        .evaluate((el) => getComputedStyle(el).borderBottomWidth),
    ).toBe("0px");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`header-${width}.png`),
    });
  });
}
