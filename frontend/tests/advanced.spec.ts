import AxeBuilder from "@axe-core/playwright";
import { test, expect, startPractice, readSaved } from "./helpers";

test("advanced drills score once, explain answers, and leave active practice untouched", async ({
  page,
}) => {
  await page.goto("/");
  await startPractice(page);
  const saved = await readSaved(page);
  await page.getByRole("button", { name: "Open advanced practice" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Advanced practice", exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("Your bet in units").fill("100");
  await dialog.getByRole("button", { name: "Check bet" }).click();
  await expect(
    dialog.getByText("0 correct / 1 scored", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Check bet" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Next bet", exact: true }).click();
  await expect(dialog.getByLabel("Your bet in units")).toBeEnabled();
  await dialog.getByRole("button", { name: "Deviations", exact: true }).click();
  await dialog.getByRole("button", { name: "Hit", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Stand", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByRole("status")).toContainText("stand at TC");
  await dialog.getByRole("button", { name: "Next deviation" }).click();
  await expect(
    dialog.getByRole("button", { name: "Stand", exact: true }),
  ).toBeEnabled();
  await expect(readSaved(page)).resolves.toEqual(saved);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open advanced practice" }),
  ).toBeFocused();
});

test("worker estimates, cancellation, and accessible narrow layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await startPractice(page);
  await page.getByRole("button", { name: "Open advanced practice" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Expected value", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Run simulation" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "Simulation complete",
    { timeout: 60000 },
  );
  await expect(dialog.getByRole("table")).toContainText(
    "Basic strategy / configured ramp",
  );
  await expect(dialog.getByRole("table")).toContainText(
    "Always stand / flat 1 unit",
  );
  const first = await dialog.getByRole("table").innerText();
  // The terminated worker must be loaded again from the production precache.
  await page.context().setOffline(true);
  await dialog.getByRole("button", { name: "Run simulation" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "Simulation complete",
    { timeout: 60000 },
  );
  await expect(dialog.getByRole("table")).toHaveText(first, {
    useInnerText: true,
  });
  await page.context().setOffline(false);
  const scan = await new AxeBuilder({ page })
    .include("dialog")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  expect(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await dialog.getByLabel("Independent blocks (50 rounds each)").fill("200");
  await dialog.getByRole("button", { name: "Run simulation" }).click();
  await dialog.getByRole("button", { name: "Cancel simulation" }).click();
  await expect(
    dialog.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await expect(dialog.getByRole("table")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Run simulation" }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("advanced practice works before setup and validates custom ramps at large text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await page.getByRole("button", { name: "Open advanced practice" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("TC ≥4", { exact: true }).fill("3");
  await dialog.getByLabel("Your bet in units").fill("1");
  await dialog.getByRole("button", { name: "Check bet" }).click();
  await expect(dialog.getByRole("status")).toContainText("nondecreasing");
  await expect(
    dialog.getByText("0 correct / 0 scored", { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("TC ≥4", { exact: true }).fill("8");
  for (const name of ["Bet sizing", "Deviations"]) {
    await dialog.getByRole("button", { name, exact: true }).click();
    const scan = await new AxeBuilder({ page })
      .include("dialog")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
  }
  await expect(readSaved(page)).resolves.toBeNull();
  await page.keyboard.press("Escape");
});
