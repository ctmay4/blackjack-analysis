import { expect, it } from "vitest";
import { IDBFactory, IDBObjectStore as FakeObjectStore } from "fake-indexeddb";
import { IndexedDbSessionStore, StorageFailure } from "./session-store";
import type { SessionStore } from "./session-store";
import { SessionController } from "./session-controller";
import type { SavedSession } from "./session-controller";

let serial = 0;
const entropy = { seed: () => 10, id: () => `test-session-${++serial}` };
function setup() {
  const factory = new IDBFactory();
  const store = new IndexedDbSessionStore(factory);
  const otherStore = new IndexedDbSessionStore(factory);
  return {
    store,
    controller: new SessionController(store, entropy),
    other: new SessionController(otherStore, entropy),
  };
}

it("saves, restores after reload, and only exposes masked presentation snapshots", async () => {
  const { controller, other } = setup();
  expect(await controller.load()).toBeNull();
  const initial = await controller.start({});
  expect(initial.dealer_cards[1]).toBeNull();
  expect(initial.feedback_detail.recommendation).toBeNull();
  expect(initial).not.toHaveProperty("shoe");
  expect(await other.load()).toEqual(initial);
  const completed = await controller.choose(initial, "stand");
  expect(await other.load()).toEqual(completed);
  expect(completed.revision).toBe(1);
  expect(completed.stats.decisions).toBe(1);
  const next = await other.choose(completed, "next");
  expect(next.round_number).toBe(2);
  expect(await controller.load()).toEqual(next);
});

it("serializes concurrent tabs atomically and rejects duplicate choices", async () => {
  const { controller, other } = setup();
  const initial = await controller.start({});
  const results = await Promise.allSettled([
    controller.choose(initial, "stand"),
    other.choose(initial, "stand"),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const failed = results.find(
    (result) => result.status === "rejected",
  ) as PromiseRejectedResult;
  expect(failed.reason.code).toBe("stale");
  expect((await controller.load())?.stats.decisions).toBe(1);
});

it("guards reset/end and rejects old session IDs even when revisions match", async () => {
  const { controller, other } = setup();
  const first = await controller.start({});
  const reset = await controller.reset(first, { bankroll: 2500, bet: 50 });
  expect(reset.session_id).not.toBe(first.session_id);
  expect(reset.revision).toBe(1);
  expect(reset.bankroll).toBe(2500);
  await expect(other.end(first)).rejects.toMatchObject({ code: "stale" });
  await controller.end(reset);
  expect(await other.load()).toBeNull();
  const second = await controller.start({});
  expect(second.revision).toBe(first.revision);
  expect(second.session_id).not.toBe(first.session_id);
  await expect(other.choose(first, "stand")).rejects.toMatchObject({
    code: "stale",
  });
  expect((await controller.load())?.stats.decisions).toBe(0);
});

it("does not overwrite an existing session or apply invalid operations", async () => {
  const { controller } = setup();
  const initial = await controller.start({});
  await expect(controller.start({})).rejects.toMatchObject({ code: "stale" });
  await expect(controller.choose(initial, "next")).rejects.toMatchObject({
    code: "invalid",
  });
  await expect(controller.reset(initial, { bet: 0 })).rejects.toMatchObject({
    code: "invalid",
  });
  expect(await controller.load()).toEqual(initial);
  const illegal = await controller.choose(initial, "split");
  expect(illegal.feedback_detail.illegal).toBe(true);
  expect(illegal.stats.decisions).toBe(0);
});

it("keeps old state on save failures, never committing partially scored choices", async () => {
  const { controller, store } = setup();
  const initial = await controller.start({});
  const failedStore: SessionStore = {
    read: () => store.read(),
    change: (operation) =>
      store.change((value) => {
        operation(value);
        throw new StorageFailure();
      }),
  };
  const broken = new SessionController(failedStore, entropy);
  await expect(broken.choose(initial, "stand")).rejects.toMatchObject({
    code: "storage",
  });
  expect(await controller.load()).toEqual(initial);
});

it("does not resolve a write that aborts after its request succeeded", async () => {
  const { controller } = setup();
  const initial = await controller.start({});
  const original = FakeObjectStore.prototype.put;
  FakeObjectStore.prototype.put = function (value, key) {
    const request = original.call(this, value, key);
    request.addEventListener("success", () => this.transaction.abort());
    return request;
  };
  try {
    await expect(controller.choose(initial, "stand")).rejects.toMatchObject({
      code: "storage",
    });
  } finally {
    FakeObjectStore.prototype.put = original;
  }
  expect(await controller.load()).toEqual(initial);
});

it.each(["future", "corrupt"])(
  "preserves %s data until explicitly discarded",
  async (type) => {
    const { controller, store } = setup();
    await controller.start({});
    const data = (await store.read()) as SavedSession;
    if (type === "future") data.version = 99 as 1;
    else data.trainer.stats.correctDecisions = 999;
    await store.change(() => ({ value: data, result: null }));
    const code = type === "future" ? "unsupported" : "corrupt";
    await expect(controller.load()).rejects.toMatchObject({ code });
    await expect(controller.start({})).rejects.toMatchObject({ code });
    expect(await store.read()).toEqual(data);
    await controller.discardSavedSession();
    expect(await controller.load()).toBeNull();
    expect((await controller.start({})).stats.decisions).toBe(0);
  },
);

it("reports unavailable storage instead of claiming unsaved progress was saved", async () => {
  const controller = new SessionController(
    new IndexedDbSessionStore(undefined),
    entropy,
  );
  await expect(controller.load()).rejects.toMatchObject({ code: "storage" });
  await expect(controller.start({})).rejects.toMatchObject({ code: "storage" });
});

it("rejects a truncated envelope instead of creating an unrelated new game", async () => {
  const { controller, store } = setup();
  const value = { version: 1, id: "truncated", revision: 0 };
  await store.change(() => ({ value, result: null }));
  await expect(controller.load()).rejects.toMatchObject({ code: "corrupt" });
  expect(await store.read()).toEqual(value);
});

it("allows ending a session even when its revision cannot be incremented", async () => {
  const { controller, store } = setup();
  await controller.start({});
  const value = (await store.read()) as SavedSession;
  value.revision = Number.MAX_SAFE_INTEGER;
  await store.change(() => ({ value, result: null }));
  const current = (await controller.load())!;
  await expect(controller.choose(current, "stand")).rejects.toMatchObject({
    code: "invalid",
  });
  await controller.end(current);
  expect(await controller.load()).toBeNull();
});

it("builds charts locally without changing the persisted session", async () => {
  const { controller } = setup();
  await expect(controller.chart()).rejects.toMatchObject({ code: "missing" });
  const initial = await controller.start({});
  const before = await controller.chart(initial);
  expect(before.map((section) => section.name)).toEqual([
    "Hard",
    "Soft",
    "Pairs",
  ]);
  expect(await controller.load()).toEqual(initial);
  const changed = await controller.reset(initial, {
    rules: { dealer_hits_soft_17: true },
  });
  await expect(controller.chart(initial)).rejects.toMatchObject({
    code: "stale",
  });
  expect(await controller.chart(changed)).not.toEqual(before);
});
