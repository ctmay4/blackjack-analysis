import { test, expect, readSaved, writeSaved } from "./helpers";
import type { CardData, CardRank } from "../src/engine/types";
import type { Page } from "@playwright/test";

async function expectVisibleGameplay(page: Page) {
  const bounds = await page.evaluate(() => {
    const rect = (selector: string) => {
      const { top, bottom, left, right } = document
        .querySelector(selector)!
        .getBoundingClientRect();
      return { top, bottom, left, right };
    };
    return {
      dealer: rect(".dealer-zone"),
      player: rect(".player-zone"),
      feedback: rect(".feedback"),
      actions: rect(".actions"),
      width: innerWidth,
      height: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(Math.abs(bounds.dealer.top - bounds.player.top)).toBeLessThan(2);
  expect(bounds.dealer.right).toBeLessThan(bounds.player.left);
  for (const rect of [
    bounds.dealer,
    bounds.player,
    bounds.feedback,
    bounds.actions,
  ]) {
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.bottom).toBeLessThanOrEqual(bounds.height);
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(bounds.width);
  }
  expect(bounds.overflow).toBe(false);
}

for (const size of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 800 },
]) {
  test(`compact gameplay stays visible at ${size.width}×${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await page.getByRole("button", { name: "Start practice" }).click();
    await expect(page.locator(".player-hand")).toBeVisible();
    await expectVisibleGameplay(page);
    await page.getByRole("button", { name: "Stand S", exact: true }).click();
    await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
    await expectVisibleGameplay(page);
    if (size.width === 1440)
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight),
      ).toBeLessThanOrEqual(size.height);
    if (size.width === 1440)
      await page.screenshot({
        path: "test-results/compact-desktop.png",
        fullPage: true,
      });
  });
}

test("two split hands, feedback, and actions fit at 1440×900", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByLabel("Practice focus").selectOption("pair");
  await page.getByRole("button", { name: "Start practice" }).click();
  await page.getByRole("button", { name: "Split P", exact: true }).click();
  await expect(page.locator(".player-hand")).toHaveCount(2);
  await expectVisibleGameplay(page);
  await page.screenshot({
    path: "test-results/compact-split.png",
    fullPage: true,
  });
});

test("secondary panels scroll independently and accept keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Start practice" }).click();
  const sidebar = page.getByRole("complementary", { name: "Session overview" });
  await expect(sidebar).toBeVisible();
  // A late web-font swap can change layout independently of sidebar scrolling.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await sidebar.focus();
  const before = await page.locator(".actions").boundingBox();
  await page.keyboard.press("End");
  await expect
    .poll(() => sidebar.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  const after = await page.locator(".actions").boundingBox();
  expect(after!.y).toBe(before!.y);
  await expectVisibleGameplay(page);
});

test("five-card hands keep full-size cards and readable rank corners", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Start practice" }).click();
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
  // A validated storage fixture for layout only; the UI still derives its own
  // masked snapshot. No production fixture endpoint or window hook is needed.
  const saved = await readSaved(page);
  if (!saved || saved.trainer.round.status !== "complete")
    throw new Error("Expected a completed checkpoint");
  const round = saved.trainer.round,
    oldCount = round.dealerCards.length + round.hands[0].cards.length;
  const card = (value: number): CardData => ({
    rank: String(value) as CardRank,
    suit: "♠",
    value,
  });
  round.dealerCards = [2, 2, 3, 4, 10].map(card);
  round.result.dealerCards = structuredClone(round.dealerCards);
  round.result.dealerBust = false;
  round.result.dealerBlackjack = false;
  round.hands[0].cards = [2, 2, 3, 4, 5].map(card);
  round.result.hands[0].cards = structuredClone(round.hands[0].cards);
  round.result.hands[0].outcome = "loss";
  round.result.hands[0].profit = -round.hands[0].bet;
  round.result.profit = -round.hands[0].bet;
  saved.trainer.bankroll = saved.trainer.config.bankroll + round.result.profit;
  Object.assign(saved.trainer.stats, {
    wins: 0,
    losses: 1,
    pushes: 0,
    surrenders: 0,
    playerBlackjacks: 0,
    dealerBlackjacks: 0,
    playerBusts: 0,
  });
  saved.trainer.shoe.splice(0, 10 - oldCount);
  await writeSaved(page, saved);
  await page.reload();
  await expect(page.locator(".player-hand .card")).toHaveCount(5);
  await expectVisibleGameplay(page);
  const readable = await page
    .locator(".play-surface .cards")
    .evaluateAll((hands) =>
      hands.every((hand) => {
        const cards = [...hand.querySelectorAll(".card")];
        return cards.every((card, index) => {
          const bounds = card.getBoundingClientRect();
          const corner = card
            .querySelector(".card-corner")!
            .getBoundingClientRect();
          const next = cards[index + 1]?.getBoundingClientRect();
          return (
            bounds.width >= 104 &&
            bounds.height >= 148 &&
            (!next || corner.right <= next.left) &&
            bounds.right <= hand.getBoundingClientRect().right + 1
          );
        });
      }),
    );
  expect(readable).toBe(true);
  await page.screenshot({
    path: "test-results/compact-long-hands.png",
    fullPage: true,
  });
});

test("tall desktop and mobile retain stacked hands", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.goto("/");
  await page.getByRole("button", { name: "Start practice" }).click();
  for (const size of [
    { width: 1440, height: 1400 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    const dealer = await page.locator(".dealer-zone").boundingBox();
    const player = await page.locator(".player-zone").boundingBox();
    expect(player!.y).toBeGreaterThan(dealer!.y + dealer!.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
});
