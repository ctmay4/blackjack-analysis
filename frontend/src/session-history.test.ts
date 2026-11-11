import { expect, it } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { IndexedDbSessionStore, SESSION_HISTORY } from "./session-store";
import { SessionController } from "./session-controller";
import { TrainerSession } from "./engine/trainer";
import { seededRandom, Shoe } from "./engine/cards";
import {
  archiveJournal,
  beginJournal,
  emptyHistory,
  historySummary,
  parseHistory,
  recordReview,
  REVIEW_ROUND_LIMIT,
} from "./session-history";

let serial = 0;
function setup() {
  const factory = new IDBFactory();
  const entropy = { seed: () => 10, id: () => `history-${++serial}` };
  const store = new IndexedDbSessionStore(factory);
  const controller = new SessionController(store, entropy, () => 1700000000000);
  const other = new SessionController(
    new IndexedDbSessionStore(factory),
    entropy,
    () => 1700000000100,
  );
  return { store, controller, other };
}
async function legacy(shoe: number[], config: unknown = {}) {
  const value = setup();
  const session = new TrainerSession(config, {
    shoe: new Shoe(shoe.slice().reverse()),
    random: seededRandom(1),
  });
  await value.store.change(() => ({
    value: {
      version: 1,
      id: `legacy-${++serial}`,
      revision: 0,
      trainer: session.checkpoint(),
    },
    result: null,
  }));
  return { ...value, initial: (await value.controller.load())! };
}

it("archives once on end, survives reload, and excludes active scores from cumulative totals", async () => {
  const { controller, other } = setup();
  const initial = await controller.start({});
  const played = await controller.choose(initial, "stand");
  expect((await controller.history()).totals.stats.decisions).toBe(0);
  expect((await controller.history()).sessions).toEqual([]);
  await controller.end(played);
  const history = await other.history();
  expect(history.sessions).toHaveLength(1);
  const session = history.sessions[0];
  expect(session.id).toBe(initial.session_id);
  expect(session.startedAt).toBe(1700000000000);
  expect(session.reason).toBe("ended");
  expect(session.stats.decisions).toBe(1);
  expect(history.totals.stats).toEqual({ ...played.stats, current_streak: 0 });
  expect(history.totals.profit).toBe(played.bankroll - played.config.bankroll);
  expect(session.rounds[0].complete).toBe(true);
  expect(session.rounds[0].dealer.every(Boolean)).toBe(true);
  expect(session.rounds[0].decisions[0]).toMatchObject({
    chosen: "stand",
    recommended: "stand",
    correct: true,
    scored: true,
  });
  await expect(other.end(played)).rejects.toMatchObject({ code: "missing" });
  await controller.start({});
  expect(await other.history()).toEqual(history);
  expect(JSON.stringify(history)).not.toMatch(/randomState|shoe|attempts/);
});

it("archives replaced sessions and computes decision-weighted accuracy and best streak", async () => {
  const { controller } = setup();
  let state = await controller.start({ feedback_mode: "correction" });
  state = await controller.choose(state, "hit");
  state = await controller.choose(state, "stand");
  state = await controller.reset(state, {});
  const first = (await controller.history()).sessions[0];
  expect(first.reason).toBe("replaced");
  expect(first.stats.decisions).toBe(2);
  expect(first.rounds[0].decisions.map((item) => item.correct)).toEqual([
    false,
    true,
  ]);
  state = await controller.choose(state, "stand");
  await controller.end(state);
  const history = await controller.history();
  expect(history.sessions).toHaveLength(2);
  expect(history.totals.stats.decisions).toBe(3);
  expect(history.totals.stats.correct).toBe(2);
  expect(history.totals.stats.accuracy).toBe(2 / 3);
  expect(history.totals.stats.best_streak).toBe(1);
  expect(history.totals.stats.missed_situations).toHaveLength(1);
});

it("retains correction retries across refresh without duplicating them", async () => {
  const { controller, other } = setup();
  let state = await controller.start({ feedback_mode: "correction" });
  state = await controller.choose(state, "hit");
  expect((await other.load())?.stats.decisions).toBe(1);
  state = await other.choose(state, "stand");
  await other.end(state);
  const decisions = (await controller.history()).sessions[0].rounds[0]
    .decisions;
  expect(decisions).toHaveLength(2);
  expect(decisions[0].cards).toEqual(decisions[1].cards);
  expect(decisions.map((item) => item.scored)).toEqual([true, true]);
});

it("does not score abandoned delayed choices or reveal an unfinished hole card", async () => {
  const { controller, other, initial } = await legacy([6, 10, 2, 10, 2, 10], {
    feedback_mode: "delayed",
  });
  const state = await controller.choose(initial, "hit");
  expect(state.status).toBe("player_turn");
  expect(state.stats.decisions).toBe(0);
  expect((await other.history()).sessions).toEqual([]);
  await other.end(state);
  const session = (await controller.history()).sessions[0];
  expect(session.stats.decisions).toBe(0);
  expect(session.stats.rounds).toBe(0);
  expect(session.rounds[0].dealer[1]).toBeNull();
  expect(session.rounds[0].profit).toBeNull();
  expect(session.rounds[0].decisions[0]).toMatchObject({
    chosen: "hit",
    recommended: "stand",
    correct: false,
    scored: false,
  });
  expect(session.partial).toBe(true);
  expect(session.startedAt).toBeNull();
});

it("marks all delayed decisions scored only after settlement, including after refresh", async () => {
  const { controller, other, initial } = await legacy([6, 10, 2, 10, 2, 10], {
    feedback_mode: "delayed",
  });
  const hit = await controller.choose(initial, "hit");
  const state = await other.choose((await other.load())!, "stand");
  expect(hit.stats.decisions).toBe(0);
  expect(state.stats.decisions).toBe(2);
  await other.end(state);
  const session = (await controller.history()).sessions[0];
  expect(session.rounds[0].decisions).toHaveLength(2);
  expect(session.rounds[0].decisions.every((item) => item.scored)).toBe(true);
  expect(session.stats.decisions).toBe(2);
});

it("records split-hand indices, outcomes, naturals, and ignores illegal choices", async () => {
  const { controller, initial } = await legacy([6, 8, 8, 10, 2, 3, 5]);
  let state = await controller.choose(initial, "split");
  state = await controller.choose(state, "stand");
  state = await controller.choose(state, "stand");
  await controller.end(state);
  const round = (await controller.history()).sessions[0].rounds[0];
  expect(round.hands).toHaveLength(2);
  expect(round.decisions.map((item) => item.hand)).toEqual([0, 0, 1]);
  expect(round.hands.every((hand) => hand.outcome === "loss")).toBe(true);
  const natural = await legacy([6, 11, 10, 10, 2]);
  expect(natural.initial.status).toBe("complete");
  const illegal = await natural.controller.choose(natural.initial, "hit");
  await natural.controller.end(illegal);
  const session = (await natural.controller.history()).sessions[0];
  expect(session.stats.rounds).toBe(1);
  expect(session.stats.decisions).toBe(0);
  expect(session.rounds[0].decisions).toEqual([]);
});

it("retains recent rounds without truncating lifetime session statistics", () => {
  const trainer = new TrainerSession({}, { random: seededRandom(1) });
  const journal = beginJournal("long-session", trainer, 1700000000000);
  for (let index = 0; index < REVIEW_ROUND_LIMIT + 5; index++) {
    if (trainer.round.status !== "complete") trainer.choose("stand");
    recordReview(journal, trainer);
    if (index < REVIEW_ROUND_LIMIT + 4) trainer.nextRound();
  }
  expect(journal.stats.rounds).toBe(REVIEW_ROUND_LIMIT + 5);
  expect(journal.rounds).toHaveLength(REVIEW_ROUND_LIMIT);
  expect(journal.rounds[0].number).toBe(6);
  const history = emptyHistory();
  const archive = archiveJournal(history, journal, 1700000001000, "ended");
  history.sessions.push(archive.value.session);
  expect(historySummary(parseHistory(history).sessions).stats.rounds).toBe(
    REVIEW_ROUND_LIMIT + 5,
  );
});

it("serializes concurrent end operations without double counting", async () => {
  const { controller, other } = setup();
  const state = await controller.choose(await controller.start({}), "stand");
  const results = await Promise.allSettled([
    controller.end(state),
    other.end(state),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect((await other.history()).sessions).toHaveLength(1);
  expect((await other.history()).totals.stats.decisions).toBe(1);
});

it.each(["end", "reset", "choose"] as const)(
  "rolls back both history and active session when %s saving aborts",
  async (operation) => {
    const { controller, store } = setup();
    const initial = await controller.start({});
    const oldHistory = await store.read(SESSION_HISTORY);
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      const request = original.call(this, value, key);
      if (key === SESSION_HISTORY)
        request.addEventListener("success", () => this.transaction.abort());
      return request;
    };
    try {
      const promise =
        operation === "end"
          ? controller.end(initial)
          : operation === "reset"
            ? controller.reset(initial, {})
            : controller.choose(initial, "stand");
      await expect(promise).rejects.toMatchObject({ code: "storage" });
    } finally {
      IDBObjectStore.prototype.put = original;
    }
    expect(await controller.load()).toEqual(initial);
    expect(await store.read(SESSION_HISTORY)).toEqual(oldHistory);
  },
);

it.each(["future", "corrupt"])(
  "preserves %s history and active state until explicit history recovery",
  async (type) => {
    const { controller, store } = setup();
    const initial = await controller.start({});
    const damaged =
      type === "future" ? { version: 99 } : { version: 1, sessions: "broken" };
    await store.change((value) => ({ value, result: null, history: damaged }));
    await expect(controller.history()).rejects.toMatchObject({
      code: "history",
    });
    await expect(controller.end(initial)).rejects.toMatchObject({
      code: "history",
    });
    await expect(controller.choose(initial, "stand")).rejects.toMatchObject({
      code: "history",
    });
    expect(await controller.load()).toEqual(initial);
    expect(await store.read(SESSION_HISTORY)).toEqual(damaged);
    await controller.clearHistory();
    expect(await controller.load()).toEqual(initial);
    const state = await controller.choose(initial, "stand");
    await controller.end(state);
    expect((await controller.history()).sessions[0].partial).toBe(true);
  },
);

it("deletes archived history without touching active progress or its review journal", async () => {
  const { controller, store } = setup();
  let state = await controller.choose(await controller.start({}), "stand");
  state = await controller.reset(state, {});
  const active = parseHistory(await store.read(SESSION_HISTORY)).active;
  await controller.clearHistory();
  expect((await controller.history()).sessions).toEqual([]);
  expect(await controller.load()).toEqual(state);
  expect(parseHistory(await store.read(SESSION_HISTORY)).active).toEqual(
    active,
  );
  await controller.end(state);
  expect((await controller.history()).sessions).toHaveLength(1);
});

it("keeps independent archive data through corrupt active-session recovery", async () => {
  const { controller, store } = setup();
  let state = await controller.choose(await controller.start({}), "stand");
  state = await controller.reset(state, {});
  const history = await controller.history();
  await store.change(() => ({ value: { version: 99 }, result: null }));
  await controller.discardSavedSession();
  expect(await controller.history()).toEqual(history);
  await controller.start({});
  expect(await controller.history()).toEqual(history);
});
