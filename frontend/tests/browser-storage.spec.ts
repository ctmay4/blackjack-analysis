import { test, expect, readSaved, writeSaved } from "./helpers";
import type { Page } from "@playwright/test";

async function expectFavicon(page: Page, expectedPath: string) {
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "type",
    "image/svg+xml",
  );
  const icon = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')!;
    const response = await fetch(link.href);
    return {
      path: new URL(link.href).pathname,
      status: response.status,
      type: response.headers.get("content-type"),
      body: await response.text(),
    };
  });
  expect(icon.path).toBe(expectedPath);
  expect(icon.status).toBe(200);
  expect(icon.type).toContain("image/svg+xml");
  expect(icon.body).toContain("<svg");
}

test("favicon is explicitly linked and served at the site root", async ({
  page,
}) => {
  await page.goto("/");
  await expectFavicon(page, "/favicon.svg");
});

for (const damaged of ["future", "corrupt"] as const) {
  test(`${damaged} saved data is preserved until explicit recovery`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start practice" }).click();
    const saved = (await readSaved(page))!;
    const value = structuredClone(saved);
    if (damaged === "future") value.version = 99 as 1;
    else value.trainer.stats.correctDecisions = 999;
    await writeSaved(page, value);
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("has not been changed");
    expect(await readSaved(page)).toEqual(value);
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Discard saved session" }).click();
    expect(await readSaved(page)).toEqual(value);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Discard saved session" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(await readSaved(page)).toBeNull();
    await page.getByRole("button", { name: "Start practice" }).click();
    await expect(page.locator(".metric-note")).toContainText("0 of 0");
  });
}

test("unavailable browser storage is reported without creating an unsaved session", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", { value: undefined }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("storage is unavailable");
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.getByRole("alert")).toContainText("storage is unavailable");
  await expect(
    page.getByRole("region", { name: "Blackjack practice table" }),
  ).toHaveCount(0);
});

test("a denied IndexedDB getter does not crash startup", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      get: () => {
        throw new DOMException("Denied", "SecurityError");
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("storage is unavailable");
  await expect(
    page.getByRole("heading", { name: "Set up your practice" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("static build runs at a repository subpath and keeps home navigation there", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  // Mirror a Pages repository mount with a static reverse mapping. No API exists.
  await page.route("**/blackjack-analysis/**", async (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(/^\/blackjack-analysis\//, "/");
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });
  await page.goto("/blackjack-analysis/");
  await expectFavicon(page, "/blackjack-analysis/favicon.svg");
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.locator(".player-hand")).toBeVisible();
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
  await page.getByRole("link", { name: "Blackjack Studio home" }).click();
  await expect(page).toHaveURL(/\/blackjack-analysis\/$/);
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
  expect(
    requests.some((url) => url.includes("/blackjack-analysis/assets/")),
  ).toBe(true);
  expect(requests.some((url) => url.includes("/api/"))).toBe(false);
});
