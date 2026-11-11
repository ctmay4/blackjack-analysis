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
