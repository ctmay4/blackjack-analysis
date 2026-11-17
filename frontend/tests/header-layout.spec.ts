import { test, expect, startPractice } from "./helpers";

for (const width of [320, 1280, 1440]) {
  test(`timer stays inside the table header without moving content at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await startPractice(page);
    await page.clock.install();
    const header = page.locator(".app-header");
    const modes = page.getByRole("group", { name: "Studio mode" });
    const tools = page.getByRole("navigation", { name: "Tools" });
    await expect(modes).toBeVisible();
    await expect(tools).toBeVisible();
    await expect(
      header.getByRole("button", { name: "Mastery exercises" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your focus", exact: true }),
    ).toHaveCount(0);
    await expect(
      header.getByRole("region", { name: "Timed practice" }),
    ).toHaveCount(0);
    const timer = page
      .locator(".table-toolbar")
      .getByRole("region", { name: "Timed practice", exact: true });
    const surface = page.locator(".play-surface");
    await page.evaluate(() => window.scrollTo(0, 0));
    const initial = {
      header: (await header.boundingBox())!,
      surface: (await surface.boundingBox())!,
      timer: (await timer.boundingBox())!,
    };
    const stable = async () => {
      await page.evaluate(() => window.scrollTo(0, 0));
      const nowHeader = (await header.boundingBox())!;
      const nowSurface = (await surface.boundingBox())!;
      expect(nowHeader.height).toBe(initial.header.height);
      expect(nowSurface.y).toBe(initial.surface.y);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    };
    if (width >= 1280) {
      const toolbar = (await page.locator(".table-toolbar").boundingBox())!;
      expect(
        Math.abs(
          initial.timer.x +
            initial.timer.width / 2 -
            toolbar.x -
            toolbar.width / 2,
        ),
      ).toBeLessThan(2);
      const modeBox = (await modes.boundingBox())!;
      const toolBox = (await tools.boundingBox())!;
      expect(
        Math.abs(
          modeBox.y + modeBox.height / 2 - toolBox.y - toolBox.height / 2,
        ),
      ).toBeLessThan(2);
    }
    await timer
      .getByRole("button", { name: "Start timed practice", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Start timed practice", exact: true })
      .click();
    await stable();
    await page.screenshot({
      path: test.info().outputPath(`table-timer-running-${width}.png`),
    });
    await timer
      .getByRole("button", { name: "Pause timer", exact: true })
      .click();
    await stable();
    await timer
      .getByRole("button", { name: "Resume timer", exact: true })
      .click();
    await stable();
    await timer
      .getByRole("button", { name: "Finish timed practice", exact: true })
      .click();
    await stable();
    await expect(
      timer.getByRole("button", { name: "New timed challenge" }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`table-timer-finished-${width}.png`),
    });
  });
}
