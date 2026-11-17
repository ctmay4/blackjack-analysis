import AxeBuilder from "@axe-core/playwright";
import { test, expect, startPractice, readSaved } from "./helpers";

test("simulation replaces practice, supports custom rules, and preserves the active hand", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await startPractice(page);
  const saved = await readSaved(page);
  await expect(
    page.getByRole("button", { name: "Hand practice", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Simulation", exact: true }).click();
  const workspace = page.getByRole("region", { name: "Simulation workspace" });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Hit", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("h");
  await page.keyboard.press("Enter");
  await expect(readSaved(page)).resolves.toEqual(saved);
  await workspace
    .getByRole("combobox", { name: "Decks", exact: true })
    .selectOption("2");
  await workspace.getByLabel("Dealer soft 17").selectOption("true");
  await workspace.getByLabel("Late surrender").check();
  await workspace.getByLabel("Double after split").uncheck();
  await workspace.getByLabel("Penetration (%)").fill("90");
  await workspace.getByRole("button", { name: "Run simulation" }).click();
  await expect(workspace.getByRole("status")).toContainText(
    "Simulation complete",
    { timeout: 60000 },
  );
  await expect(workspace.getByRole("table").getByRole("row")).toHaveCount(4);
  const ramp = await workspace.locator(".simulation-ramp").boundingBox();
  const exercise = await workspace
    .getByRole("region", { name: "Expected value exercise" })
    .boundingBox();
  expect(exercise!.x).toBeGreaterThan(ramp!.x + ramp!.width);
  expect(exercise!.width).toBeGreaterThan(600);
  const scan = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Hand practice", exact: true })
    .click();
  await expect(workspace).toHaveCount(0);
  await expect(readSaved(page)).resolves.toEqual(saved);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Hand practice", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
