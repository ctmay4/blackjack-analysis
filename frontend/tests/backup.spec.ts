import { readFile } from "node:fs/promises";
import { test, expect, readSaved, startPractice } from "./helpers";

test("downloads backup and history exports, cancels restore, then restores exact practice", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start practice" }).click();
  await page.getByRole("button", { name: "Open saved history" }).click();
  const before = await readSaved(page);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download backup", exact: true })
    .click();
  const download = await downloadPromise;
  const buffer = await readFile((await download.path())!);
  const backup = JSON.parse(buffer.toString());
  expect(backup.active.trainer).toEqual(before!.trainer);
  for (const kind of ["JSON", "CSV"]) {
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: `Export history ${kind}` }).click();
    const file = await event;
    expect(file.suggestedFilename()).toMatch(
      kind === "CSV" ? /\.csv$/ : /\.json$/,
    );
  }
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByLabel("Backup file").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer,
  });
  await expect(
    page.getByRole("button", { name: "Restore backup", exact: true }),
  ).toBeEnabled();
  expect(await readSaved(page)).toEqual(before);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Backup file").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer,
  });
  await expect(
    page.getByRole("region", { name: "Backup and export" }).getByRole("status"),
  ).toContainText("Backup restored");
  const restored = await readSaved(page);
  expect(restored!.trainer).toEqual(before!.trainer);
  expect(restored!.id).not.toBe(before!.id);
  await page.keyboard.press("Escape");
  await page.reload();
  expect((await readSaved(page))!.trainer).toEqual(before!.trainer);
});

test("invalid import reports an error without erasing practice", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start practice" }).click();
  await page.getByRole("button", { name: "Open saved history" }).click();
  const before = await readSaved(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Backup file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("not json"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await readSaved(page)).toEqual(before);
});

test("backup transfers history and deterministic future play to an isolated profile", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await startPractice(page);
  await page.getByRole("button", { name: "Stand S", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
  await page.getByRole("button", { name: "View session summary ↗" }).click();
  await page.getByRole("button", { name: "End session", exact: false }).click();
  await page.getByRole("button", { name: "Start practice" }).click();
  await page.getByRole("button", { name: "Open saved history" }).click();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download backup", exact: true })
    .click();
  const buffer = await readFile((await (await event).path())!);
  const backup = JSON.parse(buffer.toString());
  expect(backup.history.sessions).toHaveLength(1);

  // Independent storage and entropy emulate profile transfer, not real devices.
  const destination = await browser.newContext();
  try {
    const restoredPage = await destination.newPage();
    await restoredPage.goto(page.url());
    await expect(
      restoredPage.getByRole("button", { name: "Start practice" }),
    ).toBeEnabled();
    expect(await readSaved(restoredPage)).toBeNull();
    await restoredPage
      .getByRole("button", { name: "Open saved history" })
      .click();
    restoredPage.once("dialog", (dialog) => dialog.accept());
    await restoredPage.getByLabel("Backup file").setInputFiles({
      name: "transfer.json",
      mimeType: "application/json",
      buffer,
    });
    await expect(
      restoredPage
        .getByRole("region", { name: "Backup and export" })
        .getByRole("status"),
    ).toContainText("Backup restored");
    expect((await readSaved(restoredPage))!.trainer).toEqual(
      backup.active.trainer,
    );
    await restoredPage.reload();
    await restoredPage
      .getByRole("button", { name: "Open saved history" })
      .click();
    await expect(
      restoredPage.getByLabel("Cumulative statistics"),
    ).toContainText("1 ended sessions");
    const exported = restoredPage.waitForEvent("download");
    await restoredPage
      .getByRole("button", { name: "Download backup", exact: true })
      .click();
    const transferred = JSON.parse(
      (await readFile((await (await exported).path())!)).toString(),
    );
    expect(transferred.history.sessions).toEqual(backup.history.sessions);
    expect(transferred.history.archives).toEqual(backup.history.archives);
    for (const target of [page, restoredPage]) {
      await target.keyboard.press("Escape");
      await target
        .getByRole("button", { name: "Stand S", exact: true })
        .click();
      await expect(
        target.getByRole("button", { name: "Next hand" }),
      ).toBeVisible();
      await target.getByRole("button", { name: "Next hand" }).click();
      await expect(
        target.getByRole("region", { name: "Blackjack practice table" }),
      ).toContainText("Round 2");
    }
    expect((await readSaved(restoredPage))!.trainer).toEqual(
      (await readSaved(page))!.trainer,
    );
  } finally {
    await destination.close();
  }
});
