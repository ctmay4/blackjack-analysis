import { test, expect, readSaved, startPractice } from "./helpers";
import type { Page } from "@playwright/test";
import { rulePresets } from "../src/rule-presets";

async function start(page: Page) {
  await page.goto("/");
  await startPractice(page);
  await expect(
    page.getByRole("region", { name: "Blackjack practice table" }),
  ).toBeVisible();
}

test("rule presets replace all rules, preserve training settings, and resume", async ({
  page,
}) => {
  await page.goto("/");
  const preset = page.getByLabel("Rule preset", { exact: true });
  await expect(preset).toHaveValue("six-deck-s17");
  await page.getByLabel("Practice focus").selectOption("surrender");
  await page.getByLabel("Feedback mode").selectOption("delayed");
  await page.getByLabel("Starting bankroll").fill("2500");
  await page.getByLabel("Wager", { exact: true }).fill("50");
  await page
    .getByRole("combobox", { name: "Decks", exact: true })
    .selectOption("8");
  await page.getByLabel("Maximum splits").selectOption("1");
  await page.getByLabel("Shoe fraction remaining before shuffle").fill("0.5");
  await page.getByLabel("Double after split", { exact: true }).uncheck();
  await page.getByLabel("Re-split aces", { exact: true }).uncheck();
  await page.getByLabel("One card on split aces", { exact: true }).uncheck();
  await expect(preset).toHaveValue("custom");
  await expect(
    page.getByRole("button", { name: "Start practice" }),
  ).toBeDisabled();
  for (const item of rulePresets) {
    await preset.selectOption(item.id);
    await expect(
      page.getByRole("combobox", { name: "Decks", exact: true }),
    ).toHaveValue("6");
    await expect(page.getByLabel("Maximum splits")).toHaveValue("3");
    await expect(
      page.getByLabel("Shoe fraction remaining before shuffle"),
    ).toHaveValue("0.25");
    await expect(
      page.getByLabel("Double after split", { exact: true }),
    ).toBeChecked();
    await expect(
      page.getByLabel("Re-split aces", { exact: true }),
    ).toBeChecked();
    await expect(
      page.getByLabel("One card on split aces", { exact: true }),
    ).toBeChecked();
    await expect(page.getByLabel("Dealer behavior")).toHaveValue(
      String(item.rules.dealer_hits_soft_17),
    );
    await expect(
      page.getByLabel("Late surrender", { exact: true }),
    ).toBeChecked({ checked: item.rules.allow_surrender });
    await expect(
      page.getByRole("button", { name: "Start practice" }),
    ).toBeEnabled({ enabled: item.rules.allow_surrender });
  }
  await startPractice(page);
  const saved = await readSaved(page);
  expect(saved!.trainer.config).toMatchObject({
    rules: rulePresets[3].rules,
    practice: "surrender",
    feedback_mode: "delayed",
    bankroll: 2500,
    bet: 50,
  });
  await page.reload();
  await page.getByRole("button", { name: "Open session settings" }).click();
  await expect(preset).toHaveValue("six-deck-h17-surrender");
  await page
    .getByRole("combobox", { name: "Decks", exact: true })
    .selectOption("8");
  await expect(preset).toHaveValue("custom");
  await page
    .getByRole("button", { name: "Start new session", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm new session" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Open session settings" }).click();
  await expect(preset).toHaveValue("custom");
});

test("preset edits stay local until confirmed and changing presets resets confirmation", async ({
  page,
}) => {
  await start(page);
  const before = await readSaved(page);
  await page.getByRole("button", { name: "Open session settings" }).click();
  await page
    .getByLabel("Rule preset", { exact: true })
    .selectOption("six-deck-h17");
  await page.keyboard.press("Escape");
  expect(await readSaved(page)).toEqual(before);
  await page.getByRole("button", { name: "Open session settings" }).click();
  await expect(page.getByLabel("Rule preset", { exact: true })).toHaveValue(
    "six-deck-s17",
  );
  await page
    .getByLabel("Rule preset", { exact: true })
    .selectOption("six-deck-h17");
  await page
    .getByRole("button", { name: "Start new session", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm new session" }),
  ).toBeVisible();
  await page
    .getByLabel("Rule preset", { exact: true })
    .selectOption("six-deck-s17-surrender");
  await expect(
    page.getByRole("button", { name: "Confirm new session" }),
  ).toHaveCount(0);
  expect(await readSaved(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Start new session", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm new session" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await readSaved(page))!.trainer.config.rules).toEqual(
    rulePresets[2].rules,
  );
});

test("chart drills confirm replacement, repeat the target, resume, and return to normal practice", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Feedback mode").selectOption("delayed");
  await page.getByLabel("Wager", { exact: true }).fill("50");
  await startPractice(page);
  const before = await readSaved(page);
  await page.getByRole("button", { name: "Open strategy chart" }).click();
  const cell = page.getByRole("button", {
    name: "Practice Hard 16 (10, 6) vs 10: hit",
    exact: true,
  });
  await cell.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Confirm chart drill" }),
  ).toBeFocused();
  expect(await readSaved(page)).toEqual(before);
  await page.getByRole("button", { name: "Back to chart" }).click();
  await expect(cell).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("button", {
      name: "Practice Hard 16 (10, 6) vs 9: hit",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(cell).toBeFocused();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("button", {
      name: "Practice Hard 16 (10, 6) vs 2: stand",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("button", {
      name: "Practice Hard 16 (10, 6) vs A: hit",
      exact: true,
    }),
  ).toBeFocused();
  await cell.click();
  await page.keyboard.press("Escape");
  expect(await readSaved(page)).toEqual(before);
  await page.getByRole("button", { name: "Open strategy chart" }).click();
  await cell.click();
  await page.getByRole("button", { name: "Confirm chart drill" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await readSaved(page);
  expect(saved!.trainer.config).toMatchObject({
    rules: before!.trainer.config.rules,
    bet: 50,
    feedback_mode: "delayed",
    practice: "targeted",
    target: { kind: "hard", player: 16, dealer: 10 },
  });
  expect(saved!.id).not.toBe(before!.id);
  await expect(page.locator(".drill-target")).toHaveText(
    "Chart drill: Hard 16 (10, 6) vs 10",
  );
  for (let i = 0; i < 3; i++) {
    const snapshot = (await readSaved(page))!.trainer;
    expect(
      snapshot.round.hands[0].cards
        .map((card) => card.value)
        .sort((a, b) => a - b),
    ).toEqual([6, 10]);
    expect(snapshot.round.dealerCards[0].value).toBe(10);
    await page.getByRole("button", { name: "Stand S", exact: true }).click();
    await page.getByRole("button", { name: "Next hand" }).click();
  }
  await page.reload();
  await expect(page.locator(".drill-target")).toContainText(
    "Hard 16 (10, 6) vs 10",
  );
  const resumed = await readSaved(page);
  expect(resumed!.trainer.stats.decisions).toBe(3);
  await page.getByRole("button", { name: "Open saved history" }).click();
  await expect(page.getByRole("dialog")).toContainText("1 ended session");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open session settings" }).click();
  await expect(page.getByRole("dialog")).toContainText("Drill target: Hard 16");
  await page.getByLabel("Practice focus").selectOption("all");
  await page
    .getByRole("button", { name: "Start new session", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm new session" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".drill-target")).toHaveCount(0);
  expect((await readSaved(page))!.trainer.config).not.toHaveProperty("target");
});

test("soft and pair chart targets remain selectable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  for (const [name, target] of [
    [
      "Practice Soft 18 (A, 7) vs 2: stand",
      { kind: "soft", player: 7, dealer: 2 },
    ],
    [
      "Practice Pair (A, A) vs A: split",
      { kind: "pair", player: 11, dealer: 11 },
    ],
  ] as const) {
    await page.getByRole("button", { name: "Open strategy chart" }).click();
    await page.getByRole("button", { name, exact: true }).click();
    await page.getByRole("button", { name: "Confirm chart drill" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await readSaved(page))!.trainer.config.target).toEqual(target);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("real hand, settlement, next round, and refresh resume", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  await expect(page.getByRole("img", { name: "Face-down card" })).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Face-down card" })).toHaveCount(
    0,
  );
  await expect(page.locator('.feedback[role="status"]')).toContainText(
    "On strategy",
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
  await page.getByRole("button", { name: "Next hand" }).click();
  await expect(page.locator(".round-caption")).toContainText("Round 2");
  expect(errors).toEqual([]);
});

test("chart, progress, keyboard shortcuts, and focus restoration", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Open strategy chart" }).click();
  await expect(page.getByRole("dialog")).toContainText("Pairs — player hand");
  await expect(page.getByRole("table")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open strategy chart" }),
  ).toBeFocused();
  await page.keyboard.press("v");
  await expect(page.getByRole("dialog")).toContainText(
    "No missed situations yet",
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("s");
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".round-caption")).toContainText("Round 2");
});

test("settings require confirmation and correction mode retries without playing", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Open session settings" }).click();
  await page.getByLabel("Feedback mode").selectOption("correction");
  await page
    .getByRole("button", { name: "Start new session", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("saved to history");
  await page.getByRole("button", { name: "Confirm new session" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const before = await page
    .getByRole("region", { name: "Your hands" })
    .getByRole("img")
    .count();
  await page.getByRole("button", { name: "Hit H", exact: true }).click();
  await expect(page.locator('.feedback[role="status"]')).toContainText(
    "Let’s try that again",
  );
  await expect(
    page.getByRole("region", { name: "Your hands" }).getByRole("img"),
  ).toHaveCount(before);
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
});

test("mobile pair practice and splits fit without horizontal page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Practice focus").selectOption("pair");
  await startPractice(page);
  await page.getByRole("button", { name: "Split P", exact: true }).click();
  await expect(page.locator(".player-hand")).toHaveCount(2);
  await expect(page.locator(".split-active")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open strategy chart" }).click();
  await expect(page.getByRole("table")).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-chart.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "test-results/mobile-split.png",
    fullPage: true,
  });
});

test("stale tabs reconcile without replaying an action", async ({
  page,
  context,
}) => {
  await start(page);
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(other.getByRole("button", { name: "Next hand" })).toBeVisible();
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("changed in another tab");
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
  await expect(page.locator(".metric-note")).toContainText("1 of 1");
  await other.close();
});

test("a stale chart reloads the latest session rules instead of showing mismatched guidance", async ({
  page,
  context,
}) => {
  await start(page);
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Open session settings" }).click();
  await other.getByText("Table rules", { exact: true }).click();
  await other.getByLabel("Dealer behavior").selectOption("true");
  await other
    .getByRole("button", { name: "Start new session", exact: true })
    .click();
  await other.getByRole("button", { name: "Confirm new session" }).click();
  await expect(other.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Open strategy chart" }).click();
  await expect(page.getByRole("alert")).toContainText("changed in another tab");
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.getByRole("button", { name: "Reload latest session" }).click();
  await expect(page.getByRole("table")).toHaveCount(3);
  await expect(page.locator(".rules-summary")).toContainText("Hit soft 17");
  await other.close();
});

test("failed saves leave the previous hand and score intact", async ({
  page,
}) => {
  await start(page);
  const before = await readSaved(page);
  await page.evaluate(() => {
    Object.defineProperty(IDBObjectStore.prototype, "put", {
      value: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
    });
  });
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("storage");
  await expect(page.locator(".metric-note")).toContainText("0 of 0");
  await expect(
    page.getByRole("button", { name: "Stand S", exact: true }),
  ).toBeVisible();
  expect(await readSaved(page)).toEqual(before);
});

test("gameplay and charts work offline without API requests", async ({
  page,
  context,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) apiRequests.push(request.url());
  });
  await start(page);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
  await page.getByRole("button", { name: "Open strategy chart" }).click();
  await expect(page.getByRole("table")).toHaveCount(3);
  expect(apiRequests).toEqual([]);
});

test("delayed feedback, surrender practice, and desktop layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByLabel("Feedback mode").selectOption("delayed");
  await page.getByLabel("Practice focus").selectOption("soft");
  await page.getByRole("button", { name: "Start practice" }).click();
  await page.getByRole("button", { name: "Hit H", exact: true }).click();
  await expect(page.locator('.feedback[role="status"]')).toContainText(
    "Feedback after the round",
  );
  await expect(page.locator(".metric-note")).toContainText("0 of 0");
  const pending = await readSaved(page);
  await page.reload();
  await expect(page.locator('.feedback[role="status"]')).toContainText(
    "Feedback after the round",
  );
  expect(await readSaved(page)).toEqual(pending);
  await expect(page.locator(".metric-note")).toContainText("0 of 0");
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(page.locator('.feedback[role="status"]')).toContainText(
    "Round complete",
  );
  await page.getByRole("button", { name: "Open session settings" }).click();
  await page.getByLabel("Practice focus").selectOption("surrender");
  await expect(
    page.getByRole("button", { name: "Start new session", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Late surrender", { exact: true }).check();
  await page
    .getByRole("button", { name: "Start new session", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm new session" }).click();
  await page.getByRole("button", { name: "Surrender R", exact: true }).click();
  await expect(page.locator(".round-caption")).toContainText("-$12.50");
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
});
