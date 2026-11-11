import { test, expect } from "./helpers";

for (const confirmWith of ["keyboard", "button"] as const) {
  test(`end session using ${confirmWith}, cancel safely, and start fresh`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start practice" }).click();
    await expect(
      page.getByRole("region", { name: "Blackjack practice table" }),
    ).toBeVisible();
    await page.keyboard.press("q");
    await expect(page.getByRole("dialog")).toContainText("saved to history");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Blackjack practice table" }),
    ).toBeVisible();
    await page.keyboard.press("q");
    if (confirmWith === "keyboard") await page.keyboard.press("Q");
    else await page.getByRole("button", { name: "End session" }).click();
    await expect(
      page.getByRole("heading", { name: "Set up your practice" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Set up your practice" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Start practice" }).click();
    await expect(page.locator(".metric-note")).toContainText("0 of 0");
  });
}
