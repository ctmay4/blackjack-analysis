import { readFile } from "node:fs/promises";
import { test, expect, readSaved } from "./helpers";

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
