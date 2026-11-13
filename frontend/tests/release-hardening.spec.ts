import AxeBuilder from "@axe-core/playwright";
import { test, expect, readSaved, startPractice } from "./helpers";
import type { Page } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

async function accessible(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("WCAG checks cover setup, gameplay, and every overlay", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Start practice" }),
  ).toBeEnabled();
  await accessible(page);
  await startPractice(page);
  await expect(page.locator(".player-hand")).toBeVisible();
  await accessible(page);
  for (const name of [
    "Open strategy chart",
    "Open session settings",
    "Open saved history",
    "Keyboard shortcuts ↗",
    "Explore your progress ↗",
    "View session summary ↗",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    if (name === "Open strategy chart")
      await expect(page.getByRole("table")).toHaveCount(3);
    await accessible(page);
    await page.getByRole("button", { name: "Close overlay" }).click();
  }
});

test("modal traps keyboard focus, ignores game shortcuts, and restores focus", async ({
  page,
}) => {
  await page.goto("/");
  await startPractice(page);
  const opener = page.getByRole("button", { name: "Open session settings" });
  await opener.click();
  const before = await readSaved(page);
  await page.getByLabel("Practice focus").focus();
  await page.keyboard.press("s");
  expect(await readSaved(page)).toEqual(before);
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press(key);
      expect(
        await page.evaluate(() => !!document.activeElement?.closest("dialog")),
      ).toBe(true);
    }
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("320px reflow and enlarged text keep setup, play, and history usable", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  // Audit narrow-screen styles too: desktop overrides can hide mobile contrast
  // failures, including the action-footer text.
  await startPractice(page);
  await accessible(page);
  // Text-only enlargement complements narrow viewport coverage (not browser zoom).
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect(page.locator(".player-hand")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("narrow-large-text.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open saved history" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("populated history, charts, and review are accessible with release screenshots", async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName === "firefox",
    "Playwright Firefox 159 crashes during axe scans of populated SVG history; functional history coverage runs separately.",
  );
  await page.goto("/");
  await startPractice(page);
  await expect(page.locator(".player-hand")).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const path = testInfo.outputPath(`practice-${width}.png`);
    await page.screenshot({ path, fullPage: true });
    await testInfo.attach(`practice-${width}`, {
      path,
      contentType: "image/png",
    });
  }
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
  await page.getByRole("button", { name: "View session summary ↗" }).click();
  await page.getByRole("button", { name: "End session", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Set up your practice" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open saved history" }).click();
  await expect(page.getByLabel("Cumulative statistics")).toContainText(
    "1 ended sessions",
  );
  await accessible(page);
  await page.getByText("View progress data", { exact: true }).click();
  await accessible(page);
  await page.getByRole("button", { name: /Review session 1/ }).click();
  await expect(
    page.getByRole("heading", { name: "Session review", exact: true }),
  ).toBeVisible();
  await accessible(page);
});

test("double activation cannot score or advance twice", async ({ page }) => {
  await page.goto("/");
  await startPractice(page);
  const before = await readSaved(page);
  await page
    .getByRole("button", { name: "Stand S", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
  const after = await readSaved(page);
  expect(after!.revision).toBe(before!.revision + 1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
  expect(await readSaved(page)).toEqual(after);
});
