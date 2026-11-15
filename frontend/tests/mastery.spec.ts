import AxeBuilder from "@axe-core/playwright";
import { test, expect, readSaved, startPractice } from "./helpers";

test("mastery goal survives refresh and exercise replacement is explicit", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Practice focus").selectOption("hard");
  await startPractice(page);
  const original = (await readSaved(page))!;
  for (let count = 0; count < 20;) {
    const saved = (await readSaved(page))!;
    if (saved.trainer.round.status === "complete") {
      await page.keyboard.press("Enter");
    } else {
      await page.keyboard.press("s");
      count++;
    }
    await expect
      .poll(async () => (await readSaved(page))!.revision)
      .toBeGreaterThan(saved.revision);
  }
  await page.reload();
  await page.getByRole("button", { name: "Mastery exercises" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("status")).toContainText(
    "Minimum reached. Keep practicing to reach 90% accuracy.",
  );
  await expect(
    dialog.getByText(/correct \/ 20 scored decisions/),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Soft hands (suggested next)" })
    .click();
  await dialog.getByRole("button", { name: "Cancel exercise" }).click();
  expect((await readSaved(page))!.id).toBe(original.id);
  await dialog
    .getByRole("button", { name: "Soft hands (suggested next)" })
    .click();
  await dialog.getByRole("button", { name: "Start exercise" }).click();
  await expect(dialog).toHaveCount(0);
  const next = (await readSaved(page))!;
  expect(next.id).not.toBe(original.id);
  expect(next.trainer.config).toEqual({
    ...original.trainer.config,
    practice: "soft",
  });
  expect(next.trainer.stats.decisions).toBe(0);
  await page.getByRole("button", { name: "Mastery exercises" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "20 more scored decisions",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open saved history" }).click();
  await expect(page.getByRole("dialog")).toContainText("hard · 20 decisions");
});

test("mastery selection is accessible on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await startPractice(page);
  await page.getByRole("button", { name: "Mastery exercises" }).click();
  await page.getByRole("button", { name: "Pairs", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Confirm exercise" }),
  ).toBeVisible();
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
