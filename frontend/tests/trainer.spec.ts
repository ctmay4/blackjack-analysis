import { test, expect, readSaved } from "./helpers";
import type { Page } from "@playwright/test";

async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(
    page.getByRole("region", { name: "Blackjack practice table" }),
  ).toBeVisible();
}

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
  await expect(page.getByRole("status")).toContainText("On strategy");
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
  await expect(page.getByRole("status")).toContainText("Let’s try that again");
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
  await page.getByRole("button", { name: "Start practice" }).click();
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
  await expect(page.getByRole("status")).toContainText(
    "Feedback after the round",
  );
  await expect(page.locator(".metric-note")).toContainText("0 of 0");
  const pending = await readSaved(page);
  await page.reload();
  await expect(page.getByRole("status")).toContainText(
    "Feedback after the round",
  );
  expect(await readSaved(page)).toEqual(pending);
  await expect(page.locator(".metric-note")).toContainText("0 of 0");
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Round complete");
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
