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

test("counting drills reveal, score once, retain separate progress, and reset on close", async ({
  page,
}) => {
  await page.goto("/");
  await startPractice(page);
  const saved = await readSaved(page);
  await page.getByRole("button", { name: "Open advanced practice" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Running count", exact: true })
    .click();
  const exercise = dialog.getByRole("region", {
    name: "Running count exercise",
  });
  await expect(
    exercise.getByLabel("Your running count", { exact: true }),
  ).toBeDisabled();
  await expect(exercise.getByRole("table")).toHaveCount(0);
  let count = 0;
  for (let i = 1; i <= 10; i++) {
    await exercise.getByRole("button", { name: "Reveal next card" }).click();
    const card = await exercise.getByLabel("Current counting card").innerText();
    expect(card).toContain(`Card ${i} of 10:`);
    const rank = card.split(": ")[1].slice(0, -1);
    count += ["10", "J", "Q", "K", "A"].includes(rank)
      ? -1
      : Number(rank) <= 6
        ? 1
        : 0;
  }
  await expect(
    exercise.getByRole("button", { name: "Reveal next card" }),
  ).toBeDisabled();
  await exercise
    .getByLabel("Your running count", { exact: true })
    .fill(String(count));
  await exercise
    .getByRole("button", { name: "Check running count" })
    .press("Enter");
  await expect(
    exercise.getByText("1 correct / 1 scored", { exact: true }),
  ).toBeVisible();
  await expect(
    exercise.getByRole("button", { name: "Check running count" }),
  ).toBeDisabled();
  await expect(exercise.getByRole("table").getByRole("row")).toHaveCount(11);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const reviewScan = await new AxeBuilder({ page })
    .include("dialog")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(reviewScan.violations).toEqual([]);
  expect(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);

  await dialog.getByRole("button", { name: "True count", exact: true }).click();
  const conversion = dialog.getByRole("region", {
    name: "True count exercise",
  });
  const values = await conversion.locator("strong").allTextContents();
  const expected = Math.floor(Number(values[0]) / Number(values[1]));
  await conversion
    .getByLabel("Your floored true count")
    .fill(String(expected + 1));
  await conversion.getByRole("button", { name: "Check true count" }).click();
  await expect(conversion.getByRole("status")).toContainText("Not quite.");
  await expect(conversion.getByRole("status")).toContainText(`→ ${expected}.`);
  await expect(
    conversion.getByText("0 correct / 1 scored", { exact: true }),
  ).toBeVisible();
  await expect(
    conversion.getByRole("button", { name: "Check true count" }),
  ).toBeDisabled();
  await conversion.getByRole("button", { name: "Next conversion" }).click();
  await expect(conversion.getByLabel("Your floored true count")).toHaveValue(
    "",
  );
  await expect(
    conversion.getByRole("button", { name: "Check true count" }),
  ).toBeEnabled();
  // Blank answers cannot score, and a correct conversion gets its own point.
  await conversion.getByRole("button", { name: "Check true count" }).click();
  await expect(
    conversion.getByText("0 correct / 1 scored", { exact: true }),
  ).toBeVisible();
  const nextValues = await conversion.locator("strong").allTextContents();
  await conversion
    .getByLabel("Your floored true count")
    .fill(String(Math.floor(Number(nextValues[0]) / Number(nextValues[1]))));
  await conversion.getByRole("button", { name: "Check true count" }).click();
  await expect(
    conversion.getByText("1 correct / 2 scored", { exact: true }),
  ).toBeVisible();

  await dialog
    .getByRole("button", { name: "Running count", exact: true })
    .click();
  await expect(
    exercise.getByText("1 correct / 1 scored", { exact: true }),
  ).toBeVisible();
  await exercise.getByRole("button", { name: "Next sequence" }).click();
  await expect(exercise.getByLabel("Current counting card")).toHaveText(
    "No cards revealed",
  );
  await expect(exercise.getByRole("table")).toHaveCount(0);
  await expect(readSaved(page)).resolves.toEqual(saved);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open advanced practice" }).click();
  await dialog
    .getByRole("button", { name: "Running count", exact: true })
    .click();
  await expect(
    exercise.getByText("0 correct / 0 scored", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "True count", exact: true }).click();
  await expect(
    conversion.getByText("0 correct / 0 scored", { exact: true }),
  ).toBeVisible();
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
  for (const name of [
    "Bet sizing",
    "Deviations",
    "Running count",
    "True count",
  ]) {
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
