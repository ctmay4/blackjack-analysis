import { expect, it } from "vitest";
import { IDBCursor, IDBFactory } from "fake-indexeddb";
import { IndexedDbSessionStore } from "./session-store";
import { SessionController } from "./session-controller";
import { csvCell, historyCsv } from "./data-export";

function setup() {
  let id = 0;
  const store = new IndexedDbSessionStore(new IDBFactory());
  return {
    store,
    controller: new SessionController(store, {
      seed: () => 10,
      id: () => `test-${++id}`,
    }),
  };
}

it("round trips active RNG, delayed feedback, archives and future play, invalidating stale tabs", async () => {
  const { store, controller } = setup();
  await controller.end(
    await controller.choose(await controller.start({}), "stand"),
  );
  const state = await controller.choose(
    await controller.start({ feedback_mode: "delayed" }),
    "hit",
  );
  const before = await store.read();
  const history = await controller.history();
  const backup = await controller.backup();
  const future = await controller.choose(state, "stand");
  await controller.restoreBackup(backup);
  const restored = await controller.load();
  expect(restored).toMatchObject({
    ...state,
    session_id: restored!.session_id,
    revision: 0,
  });
  expect(restored!.session_id).not.toBe(state.session_id);
  expect(await store.read()).toMatchObject({
    trainer: (before as { trainer: unknown }).trainer,
  });
  expect(await controller.history()).toEqual(history);
  expect((await store.readHistory()).archives).toHaveLength(1);
  await expect(controller.choose(state, "stand")).rejects.toMatchObject({
    code: "stale",
  });
  const replay = await controller.choose(restored!, "stand");
  expect(replay).toEqual({
    ...future,
    session_id: replay.session_id,
    revision: replay.revision,
  });
});

it("supports empty backups and archives added after a restore without duplicates", async () => {
  const { controller } = setup();
  const empty = await controller.backup();
  await controller.end(await controller.start({}));
  const backup = await controller.backup();
  await controller.restoreBackup(backup);
  await controller.end(await controller.start({}));
  expect((await controller.history()).sessions).toHaveLength(2);
  await controller.restoreBackup(empty);
  expect(await controller.load()).toBeNull();
  expect((await controller.history()).sessions).toHaveLength(0);
});

it("rejects malformed, future, mismatched, duplicate, and oversized backups without changing storage", async () => {
  const { store, controller } = setup();
  await controller.end(await controller.start({}));
  await controller.start({});
  const raw = await controller.backup();
  const before = await store.read();
  const history = await store.readHistory();
  const mutations = [
    (b: any) => {
      b.version = 99;
    },
    (b: any) => {
      b.active.trainer = {};
    },
    (b: any) => {
      b.history.active.id = "wrong";
    },
    (b: any) => {
      b.history.sessions.push(b.history.sessions[0]);
    },
    (b: any) => {
      b.history = null;
    },
  ];
  for (const mutate of mutations) {
    const backup = JSON.parse(raw);
    mutate(backup);
    await expect(
      controller.restoreBackup(JSON.stringify(backup)),
    ).rejects.toThrow();
  }
  await expect(controller.restoreBackup("not json")).rejects.toThrow();
  await expect(
    controller.restoreBackup(" ".repeat(25 * 1024 * 1024 + 1)),
  ).rejects.toThrow("25 MiB");
  expect(await store.read()).toEqual(before);
  expect(await store.readHistory()).toEqual(history);
});

it("rolls back the entire restore if archive deletion aborts", async () => {
  const { store, controller } = setup();
  const backup = await controller.backup();
  await controller.end(await controller.start({}));
  await controller.start({});
  const before = await store.read();
  const history = await store.readHistory();
  const original = IDBCursor.prototype.delete;
  IDBCursor.prototype.delete = function () {
    const request = original.call(this);
    request.addEventListener("success", () =>
      (this.source as IDBObjectStore).transaction.abort(),
    );
    return request;
  };
  try {
    await expect(controller.restoreBackup(backup)).rejects.toMatchObject({
      code: "storage",
    });
  } finally {
    IDBCursor.prototype.delete = original;
  }
  expect(await store.read()).toEqual(before);
  expect(await store.readHistory()).toEqual(history);
});

it("exports exact summary values and safely quotes spreadsheet cells", async () => {
  expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  expect(csvCell("  +cmd")).toBe('"\'  +cmd"');
  expect(csvCell(-10)).toBe('"-10"');
  expect(csvCell("a,b\nc")).toBe('"a,b\nc"');
  const { controller } = setup();
  await controller.end(
    await controller.choose(await controller.start({}), "stand"),
  );
  const csv = historyCsv(await controller.history());
  expect(csv).toContain('"settled_profit"');
  expect(csv.split("\r\n")).toHaveLength(3);
  expect(csv).toContain('"1","1","1","1"');
});
