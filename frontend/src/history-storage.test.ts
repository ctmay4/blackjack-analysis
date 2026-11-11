import { expect, it } from "vitest";
import { IDBCursor, IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { ARCHIVE_PREFIX, IndexedDbSessionStore } from "./session-store";
import { SessionController } from "./session-controller";
import type { SavedSession } from "./session-controller";
import { TrainerSession } from "./engine/trainer";

let id = 0;
function setup() {
  const store = new IndexedDbSessionStore(new IDBFactory());
  const controller = new SessionController(store, {
    seed: () => 10,
    id: () => `archive-${++id}`,
  });
  return { store, controller };
}

it("does not rewrite or load ended-session archives on ordinary choices", async () => {
  const { store, controller } = setup();
  let state = await controller.choose(await controller.start({}), "stand");
  await controller.end(state);
  const archive = (await store.readHistory()).archives[0];
  state = await controller.start({});
  const writes: IDBValidKey[] = [],
    reads: IDBValidKey[] = [];
  const put = IDBObjectStore.prototype.put;
  const get = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.put = function (value, key) {
    if (key !== undefined) writes.push(key);
    return put.call(this, value, key);
  };
  IDBObjectStore.prototype.get = function (key) {
    if (typeof key === "string") reads.push(key);
    return get.call(this, key);
  };
  try {
    await controller.choose(state, "stand");
  } finally {
    IDBObjectStore.prototype.put = put;
    IDBObjectStore.prototype.get = get;
  }
  expect(
    reads.every(
      (key) => typeof key !== "string" || !key.startsWith(ARCHIVE_PREFIX),
    ),
  ).toBe(true);
  expect(
    writes.every(
      (key) => typeof key !== "string" || !key.startsWith(ARCHIVE_PREFIX),
    ),
  ).toBe(true);
  expect((await store.readHistory()).archives).toEqual([archive]);
});

it.each(["future", "corrupt"])(
  "preserves an unreadable %s archive until explicit history deletion",
  async (type) => {
    const { store, controller } = setup();
    const initial = await controller.start({});
    const damaged =
      type === "future"
        ? { version: 99 }
        : { version: 1, session: { id: "truncated" } };
    await store.change((value) => ({
      value,
      result: null,
      archive: { id: "damaged", value: damaged },
    }));
    await expect(controller.history()).rejects.toMatchObject({
      code: "history",
    });
    expect(await controller.load()).toEqual(initial);
    expect((await store.readHistory()).archives).toEqual([damaged]);
    // Independent archives are not rewritten by gameplay.
    const played = await controller.choose(initial, "stand");
    expect((await store.readHistory()).archives).toEqual([damaged]);
    await controller.clearHistory();
    expect(await controller.load()).toEqual(played);
    expect((await controller.history()).sessions).toEqual([]);
  },
);

it("rolls back deletion when an archive delete request aborts after success", async () => {
  const { store, controller } = setup();
  await controller.end(
    await controller.choose(await controller.start({}), "stand"),
  );
  const state = await controller.start({});
  const before = await store.readHistory();
  const original = IDBCursor.prototype.delete;
  IDBCursor.prototype.delete = function () {
    const request = original.call(this);
    const transaction = (this.source as IDBObjectStore).transaction;
    request.addEventListener("success", () => transaction.abort());
    return request;
  };
  try {
    await expect(controller.clearHistory()).rejects.toMatchObject({
      code: "storage",
    });
  } finally {
    IDBCursor.prototype.delete = original;
  }
  expect(await controller.load()).toEqual(state);
  expect(await store.readHistory()).toEqual(before);
});

it("labels review gaps caused by a still-open older app without losing its scores", async () => {
  const { store, controller } = setup();
  await controller.start({});
  // The pre-history controller only writes the unchanged version-1 active save.
  const old = (await store.read()) as SavedSession;
  const trainer = TrainerSession.restore(old.trainer);
  trainer.choose("stand");
  old.trainer = trainer.checkpoint();
  old.revision++;
  await store.change(() => ({ value: old, result: null }));
  const state = (await controller.load())!;
  await controller.end(state);
  const session = (await controller.history()).sessions[0];
  expect(session.partial).toBe(true);
  expect(session.stats.decisions).toBe(1);
  expect(session.rounds[0].decisions).toEqual([]);
  expect(session.rounds[0].complete).toBe(true);
});

it("rejects inconsistent saved counters and review data rather than showing false cumulative scores", async () => {
  const { store, controller } = setup();
  await controller.end(
    await controller.choose(await controller.start({}), "stand"),
  );
  const { archives } = await store.readHistory();
  const archive = archives[0] as {
    version: 1;
    session: { id: string; stats: { correctDecisions: number } };
  };
  archive.session.stats.correctDecisions = 999;
  // Write the damaged row directly, as disk corruption/import could do.
  await controller.clearHistory();
  await store.change((value) => ({
    value,
    result: null,
    archive: { id: archive.session.id, value: archive },
  }));
  await expect(controller.history()).rejects.toMatchObject({ code: "history" });
  expect((await store.readHistory()).archives).toEqual([archive]);
});
