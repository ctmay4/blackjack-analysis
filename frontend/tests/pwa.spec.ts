import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect, readSaved } from "./helpers";

async function readyOffline(page: Page) {
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

test("offline reload and fresh opening preserve practice", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await readyOffline(page);
  await page.getByRole("button", { name: "Start practice" }).click();
  const saved = await readSaved(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".player-hand")).toBeVisible();
  expect(await readSaved(page)).toEqual(saved);
  const reopened = await context.newPage();
  await reopened.goto("/");
  await expect(reopened.locator(".player-hand")).toBeVisible();
  expect(await readSaved(reopened)).toEqual(saved);
  await reopened.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(
    reopened.getByRole("button", { name: "Next hand" }),
  ).toBeVisible();
  await reopened.getByRole("button", { name: "Open strategy chart" }).click();
  await expect(reopened.getByRole("dialog")).toBeVisible();
});

// Real static repository mount: unlike request interception, service workers
// can fetch and cache resources here exactly as they do on GitHub Pages.
test.describe("repository-scoped PWA", () => {
  let server: Server;
  let origin: string;
  let generation = 1;
  test.beforeAll(async () => {
    const root = resolve("dist");
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".webmanifest": "application/manifest+json",
    };
    server = createServer(async (request, response) => {
      const path = new URL(request.url!, "http://localhost").pathname;
      if (!path.startsWith("/blackjack-analysis/")) {
        response
          .writeHead(200, { "Content-Type": "text/html" })
          .end("<title>Other project</title>");
        return;
      }
      const file = resolve(
        root,
        path.slice("/blackjack-analysis/".length) || "index.html",
      );
      if (!file.startsWith(root + "/")) {
        response.writeHead(403).end();
        return;
      }
      try {
        const data = await readFile(file);
        response.writeHead(200, {
          "Content-Type": types[extname(file)] || "application/octet-stream",
          "Cache-Control": "no-store",
        });
        response.end(
          file.endsWith("/sw.js")
            ? `${data.toString()}\n// build ${generation}`
            : data,
        );
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test server");
    origin = `http://127.0.0.1:${address.port}`;
  });
  test.afterAll(async () => {
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  });

  test("manifest, icons, scoped offline launch, and deferred updates", async ({
    page,
    context,
  }) => {
    const url = `${origin}/blackjack-analysis/`;
    await page.goto(url);
    await readyOffline(page);
    const metadata = await page.evaluate(async () => {
      const link = document.querySelector<HTMLLinkElement>(
        'link[rel="manifest"]',
      )!;
      const manifest = await (await fetch(link.href)).json();
      const registration = await navigator.serviceWorker.ready;
      const icons = await Promise.all(
        manifest.icons.map(async (icon: { src: string }) => {
          const response = await fetch(new URL(icon.src, link.href));
          return {
            status: response.status,
            type: response.headers.get("content-type"),
          };
        }),
      );
      return {
        manifest,
        scope: registration.scope,
        icons,
        manifestURL: link.href,
      };
    });
    expect(metadata.scope).toBe(url);
    expect(
      new URL(metadata.manifest.start_url, metadata.manifestURL).href,
    ).toBe(url);
    expect(new URL(metadata.manifest.scope, metadata.manifestURL).href).toBe(
      url,
    );
    expect(metadata.manifest.display).toBe("standalone");
    expect(metadata.icons).toEqual([
      { status: 200, type: "image/png" },
      { status: 200, type: "image/png" },
    ]);
    await page.getByRole("button", { name: "Start practice" }).click();
    const saved = await readSaved(page);
    generation++;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    });
    await expect(
      page.getByRole("button", { name: "Reload to update" }),
    ).toBeVisible();
    expect(await readSaved(page)).toEqual(saved);
    await page.getByRole("button", { name: "Later", exact: true }).click();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Reload to update" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Reload to update" }).click();
    await expect(
      page.getByRole("button", { name: "Reload to update" }),
    ).toHaveCount(0);
    await expect(page.locator(".player-hand")).toBeVisible();
    expect(await readSaved(page)).toEqual(saved);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".player-hand")).toBeVisible();
    expect(await readSaved(page)).toEqual(saved);
    const reopened = await context.newPage();
    await reopened.goto(url);
    await expect(reopened.locator(".player-hand")).toBeVisible();
    // This service worker must never take control of a sibling Pages site.
    const outside = await context.newPage();
    await context.setOffline(false);
    await outside.goto(`${origin}/other-project/`);
    expect(
      await outside.evaluate(() => navigator.serviceWorker.controller),
    ).toBeNull();
  });
});
