import { test, expect, readSaved } from "./helpers";
import type { Page } from "@playwright/test";

async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Start practice" }).click();
}
async function end(page: Page) {
  // Pointer clicks return before the IndexedDB mutation necessarily commits.
  await expect(
    page.getByRole("button", { name: "Open saved history" }),
  ).toBeEnabled();
  await page.keyboard.press("q");
  await page.getByRole("button", { name: "End session" }).click();
  await expect(
    page.getByRole("heading", { name: "Set up your practice" }),
  ).toBeVisible();
}
async function openHistory(page: Page) {
  await page.getByRole("button", { name: "Open saved history" }).click();
  await expect(
    page.getByRole("heading", { name: "Saved history", exact: true }),
  ).toBeVisible();
}

test("ended sessions survive reload and show cumulative progress and hand review", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await end(page);
  await page.reload();
  await openHistory(page);
  await expect(page.getByLabel("Cumulative statistics")).toContainText(
    "1 ended sessions · 1 of 1 decisions correct · 100% accuracy",
  );
  await expect(
    page.getByRole("img", { name: "Cumulative accuracy", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Cumulative settled profit", exact: true }),
  ).toBeVisible();
  await page.getByText("View progress data", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Progress data", exact: true }),
  ).toContainText("100.0%");
  await page.getByRole("button", { name: /Review session 1/ }).click();
  await expect(
    page.getByRole("heading", { name: "Session review", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".history-round")).toContainText(
    "Round 1 · Complete",
  );
  await expect(page.locator(".history-decisions")).toContainText(
    "Chose stand · Recommended stand",
  );
  await expect(page.locator(".history-round")).not.toContainText("[hidden]");
  await page.screenshot({ path: "test-results/history-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open saved history" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Start practice" }).click();
  await openHistory(page);
  await expect(page.getByLabel("Cumulative statistics")).toContainText(
    "1 ended sessions",
  );
});

test("replaced sessions retain correction attempts and support mistakes-only review", async ({
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
  await page.reload();
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await page.getByRole("button", { name: "Open session settings" }).click();
  await page
    .getByRole("button", { name: "Start new session", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm new session" }).click();
  const before = await readSaved(page);
  await openHistory(page);
  await expect(page.getByLabel("Cumulative statistics")).toContainText(
    "1 of 2 decisions correct · 50% accuracy",
  );
  await page.getByRole("button", { name: /Review session 1/ }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Replaced by a new session",
  );
  await expect(page.locator(".history-decisions li")).toHaveCount(2);
  await page.getByLabel("Mistakes only").check();
  await expect(page.locator(".history-decisions li")).toHaveCount(1);
  await expect(page.locator(".history-decisions")).toContainText(
    "Chose hit · Recommended stand",
  );
  await page.keyboard.press("h");
  expect(await readSaved(page)).toEqual(before);
});

test("history deletion requires confirmation and preserves active practice", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await end(page);
  await page.getByRole("button", { name: "Start practice" }).click();
  const before = await readSaved(page);
  await openHistory(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete saved history" }).click();
  await expect(
    page.getByRole("button", { name: /Review session 1/ }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete saved history" }).click();
  await expect(page.getByRole("dialog")).toContainText("No saved sessions yet");
  await expect(
    page.getByRole("region", { name: "Historical charts", exact: true }),
  ).toHaveCount(0);
  expect(await readSaved(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await end(page);
  await openHistory(page);
  await expect(page.getByLabel("Cumulative statistics")).toContainText(
    "1 ended sessions · 0 of 0 decisions correct",
  );
});

test("an archive write failure leaves the active session intact and can be retried safely", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  const before = await readSaved(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      if (typeof key === "string" && key.startsWith("history:")) {
        IDBObjectStore.prototype.add = original;
        throw new DOMException("Full", "QuotaExceededError");
      }
      return original.call(this, value, key);
    };
  });
  await page.keyboard.press("q");
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByRole("alert").first()).toContainText(
    "storage is unavailable or full",
  );
  expect(await readSaved(page)).toEqual(before);
  await page.getByRole("button", { name: "End session" }).click();
  await expect(
    page.getByRole("heading", { name: "Set up your practice" }),
  ).toBeVisible();
  await openHistory(page);
  await expect(page.getByLabel("Cumulative statistics")).toContainText(
    "1 ended sessions · 1 of 1 decisions correct",
  );
});

test("two tabs cannot archive or count the same session twice", async ({
  page,
  context,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByRole("button", { name: "Next hand" })).toBeVisible();
  await Promise.all([page.keyboard.press("q"), other.keyboard.press("q")]);
  await Promise.all([
    page.getByRole("button", { name: "End session" }).click(),
    other.getByRole("button", { name: "End session" }).click(),
  ]);
  await openHistory(page);
  await expect(page.getByLabel("Cumulative statistics")).toContainText(
    "1 ended sessions · 1 of 1 decisions correct",
  );
  await expect(
    page.getByRole("button", { name: /Review session/ }),
  ).toHaveCount(1);
});

test("unsupported history is recovered explicitly without discarding active practice", async ({
  page,
}) => {
  await start(page);
  const before = await readSaved(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("blackjack-studio", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("sessions", "readwrite");
          transaction.objectStore("sessions").put({ version: 99 }, "history");
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onabort = () => {
            db.close();
            reject(transaction.error);
          };
        };
      }),
  );
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(page.locator(".error-banner")).toContainText(
    "unsupported version",
  );
  await expect(
    page.getByRole("button", { name: "Discard saved session" }),
  ).toHaveCount(0);
  expect(await readSaved(page)).toEqual(before);
  await openHistory(page);
  await expect(page.locator(".history-panel [role=alert]")).toContainText(
    "unsupported version",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete saved history" }).click();
  await expect(page.getByRole("dialog")).toContainText("No saved sessions yet");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await readSaved(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await end(page);
  await openHistory(page);
  await expect(page.getByLabel("Cumulative statistics")).toContainText(
    "1 ended sessions · 1 of 1 decisions correct",
  );
});

for (const width of [320, 390]) {
  test(`saved history and mistake review fit a ${width}px mobile viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page.getByLabel("Feedback mode").selectOption("correction");
    await page.getByRole("button", { name: "Start practice" }).click();
    await page.getByRole("button", { name: "Hit H", exact: true }).click();
    await end(page);
    await openHistory(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: /Review session 1/ }).click();
    await page.getByLabel("Mistakes only").check();
    await expect(page.locator(".history-decisions li")).toHaveCount(1);
    expect(
      await page
        .getByRole("dialog")
        .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `test-results/history-mobile-${width}.png` });
  });
}
