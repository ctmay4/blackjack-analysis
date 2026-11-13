import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SavedSession } from "../src/session-controller";
import {
  SESSION_DB,
  SESSION_STORE,
  ACTIVE_SESSION,
} from "../src/session-store";

// Seed browser entropy, not application behavior. The production static build
// runs the real engine and storage code without fixture endpoints or globals.
export const test = base.extend<{ seeded: void }>({
  seeded: [
    async ({ context }, use) => {
      await context.addInitScript(() => {
        Object.defineProperty(crypto, "getRandomValues", {
          value: (array: Uint32Array) => {
            array.fill(10);
            return array;
          },
        });
      });
      await use();
    },
    { auto: true },
  ],
});
export { expect };

export async function startPractice(page: Page) {
  // On narrow screens the asynchronous offline-ready notice can appear
  // between pointerdown and pointerup over Start practice, cancelling its click.
  // Wait for and dismiss the real notice, rather than retrying a mutation.
  const availability = page.getByRole("complementary", {
    name: "App availability",
  });
  await expect(availability.getByRole("status")).toHaveText(
    "Ready for offline use on this device.",
  );
  await availability
    .getByRole("button", { name: "Dismiss", exact: true })
    .click();
  await expect(availability).toHaveCount(0);
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(
    page.getByRole("region", { name: "Blackjack practice table" }),
  ).toBeVisible();
}

export async function readSaved(page: Page): Promise<SavedSession | null> {
  return page.evaluate(
    ({ dbName, store, key }) =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction(store, "readonly");
          const read = tx.objectStore(store).get(key);
          let value: unknown = null;
          read.onsuccess = () => {
            value = read.result ?? null;
          };
          tx.oncomplete = () => {
            db.close();
            resolve(value);
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    { dbName: SESSION_DB, store: SESSION_STORE, key: ACTIVE_SESSION },
  ) as Promise<SavedSession | null>;
}
export async function writeSaved(page: Page, value: unknown) {
  await page.evaluate(
    ({ dbName, store, key, value }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction(store, "readwrite");
          if (value === null) tx.objectStore(store).delete(key);
          else tx.objectStore(store).put(value, key);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    { dbName: SESSION_DB, store: SESSION_STORE, key: ACTIVE_SESSION, value },
  );
}
