import AxeBuilder from "@axe-core/playwright";
import { test, expect, readSaved, startPractice } from "./helpers";

test("timed challenge scores choices, pauses, expires, and leaves practice intact", async ({
  page,
}) => {
  await page.goto("/");
  await startPractice(page);
  const original = (await readSaved(page))!;
  await page.clock.install();
  const timer = page.getByRole("region", {
    name: "Timed practice",
    exact: true,
  });
  await timer
    .getByRole("button", { name: "Start timed practice", exact: true })
    .click();
  const setup = page.getByRole("dialog", {
    name: "Timed practice",
    exact: true,
  });
  await expect(setup.getByLabel("Challenge length")).toHaveValue("60");
  await expect(setup).toContainText(
    "Optional timer; practice continues when it ends.",
  );
  await page.keyboard.press("Escape");
  await expect(setup).toHaveCount(0);
  expect(await readSaved(page)).toEqual(original);
  await expect(
    timer.getByRole("button", { name: "Start timed practice", exact: true }),
  ).toBeFocused();
  await timer
    .getByRole("button", { name: "Start timed practice", exact: true })
    .click();
  await setup
    .getByRole("button", { name: "Start timed practice", exact: true })
    .click();
  await expect(setup).toHaveCount(0);
  expect(await readSaved(page)).toEqual(original);
  if (original.trainer.round.status === "complete")
    await page.keyboard.press("Enter");
  const before = (await readSaved(page))!;
  await page.keyboard.press("s");
  await expect
    .poll(async () => (await readSaved(page))!.revision)
    .toBeGreaterThan(before.revision);
  await expect(timer).toContainText("1 scored decisions");
  const saved = (await readSaved(page))!;
  const accuracy =
    100 *
    (saved.trainer.stats.correctDecisions -
      before.trainer.stats.correctDecisions);
  await expect(timer).toContainText(`${accuracy}% accuracy`);
  await page.clock.fastForward(10000);
  await timer.getByRole("button", { name: "Pause timer", exact: true }).click();
  const remaining = await timer.getByRole("timer").textContent();
  await page.clock.fastForward(120000);
  await expect(timer.getByRole("timer")).toHaveText(remaining!);
  await timer
    .getByRole("button", { name: "Resume timer", exact: true })
    .click();
  await page.getByRole("button", { name: "Mastery exercises" }).click();
  await page.clock.fastForward(120000);
  await page.keyboard.press("Escape");
  await expect(timer.getByRole("status")).toHaveText("Timed practice paused");
  await timer
    .getByRole("button", { name: "Resume timer", exact: true })
    .click();
  await page.clock.fastForward(60000);
  await expect(timer.getByRole("status")).toHaveText("Timed practice complete");
  await expect(timer.getByRole("timer")).toHaveText("0 seconds remaining");
  expect(await readSaved(page)).toEqual(saved);
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await readSaved(page))!.revision)
    .toBeGreaterThan(saved.revision);
  await expect(timer).toContainText("1 scored decisions");
  await page.reload();
  await expect(
    timer.getByRole("button", { name: "Start timed practice", exact: true }),
  ).toBeVisible();
});

test("timed controls reflow, are accessible, and can finish early", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await startPractice(page);
  const timer = page.getByRole("region", {
    name: "Timed practice",
    exact: true,
  });
  await timer
    .getByRole("button", { name: "Start timed practice", exact: true })
    .click();
  const setup = page.getByRole("dialog", {
    name: "Timed practice",
    exact: true,
  });
  await setup.getByLabel("Challenge length").selectOption("180");
  // Audit the settled dialog, not partially transparent animation frames.
  // WebKit can snapshot native controls during the entrance fade.
  await setup.evaluate(async (dialog) => {
    await Promise.all(
      dialog
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    );
  });
  expect(
    (
      await new AxeBuilder({ page })
        .include("dialog")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await setup
    .getByRole("button", { name: "Start timed practice", exact: true })
    .click();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(timer.getByRole("timer")).toContainText(
    /1[78]\d seconds remaining/,
  );
  await timer
    .getByRole("button", { name: "Finish timed practice", exact: true })
    .click();
  await expect(timer.getByRole("status")).toHaveText("Timed practice complete");
  await expect(timer).toContainText("No accuracy yet");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await timer.getByRole("button", { name: "New timed challenge" }).click();
  await expect(setup.getByLabel("Challenge length")).toHaveValue("180");
  await page.keyboard.press("Escape");
  await expect(setup).toHaveCount(0);
  await expect(
    timer.getByRole("button", { name: "New timed challenge", exact: true }),
  ).toBeFocused();
});

test("paused choices do not count and session replacement clears the challenge", async ({
  page,
}) => {
  await page.goto("/");
  await startPractice(page);
  const timer = page.getByRole("region", {
    name: "Timed practice",
    exact: true,
  });
  await timer
    .getByRole("button", { name: "Start timed practice", exact: true })
    .click();
  const setup = page.getByRole("dialog", {
    name: "Timed practice",
    exact: true,
  });
  await setup.getByLabel("Challenge length").selectOption("300");
  await setup
    .getByRole("button", { name: "Start timed practice", exact: true })
    .click();
  await timer.getByRole("button", { name: "Pause timer", exact: true }).click();
  if ((await readSaved(page))!.trainer.round.status === "complete")
    await page.keyboard.press("Enter");
  const before = (await readSaved(page))!;
  await page.keyboard.press("s");
  await expect
    .poll(async () => (await readSaved(page))!.revision)
    .toBeGreaterThan(before.revision);
  await expect(timer).toContainText("0 scored decisions");
  await page.getByRole("button", { name: "Mastery exercises" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Pairs", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start exercise", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    timer.getByRole("button", { name: "Start timed practice", exact: true }),
  ).toBeVisible();
  expect((await readSaved(page))!.id).not.toBe(before.id);
});
