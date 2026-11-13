import { test, expect, readSaved } from "./helpers";

test("frequently missed practice uses saved mistakes with fresh scores after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Feedback mode").selectOption("correction");
  await page.getByRole("button", { name: "Start practice" }).click();
  await page.getByRole("button", { name: "Hit H", exact: true }).click();
  await expect(page.locator(".feedback.mistake")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open saved history" }),
  ).toBeEnabled();
  const prior = (await readSaved(page))!;
  const key = prior.trainer.stats.openingMisses[0][0];
  await page.keyboard.press("q");
  await page.getByRole("button", { name: "End session" }).click();
  await expect(
    page.getByRole("heading", { name: "Set up your practice" }),
  ).toBeVisible();
  await page.reload();
  await page.getByLabel("Practice focus").selectOption("missed");
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(
    page.getByText("Opening misses from saved and current sessions"),
  ).toBeVisible();
  const saved = (await readSaved(page))!;
  expect(saved.trainer.drillSituations).toEqual([key]);
  expect(saved.trainer.stats.decisions).toBe(0);
  const values = saved.trainer.round.hands[0].cards.map((card) => card.value);
  let total = values.reduce((sum, value) => sum + value, 0);
  let aces = values.filter((value) => value === 11).length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  const kind = values[0] === values[1] ? "pair" : aces ? "soft" : "hard";
  const dealer = saved.trainer.round.dealerCards[0].value;
  expect(`${kind} ${total} vs ${dealer === 11 ? "A" : dealer}`).toBe(key);
  await page.reload();
  await expect(
    page.getByText("Opening misses from saved and current sessions"),
  ).toBeVisible();
  expect(await readSaved(page)).toEqual(saved);
});
