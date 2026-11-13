import { expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDbSessionStore } from "./session-store";
import { SessionController } from "./session-controller";
import type { SavedSession } from "./session-controller";
import { TrainerSession } from "./engine/trainer";

function setup() {
  const store = new IndexedDbSessionStore(new IDBFactory());
  let id = 0;
  const controller = new SessionController(store, {
    seed: () => 10,
    id: () => `drill-${++id}`,
  });
  const trainer = async () =>
    TrainerSession.restore(((await store.read()) as SavedSession).trainer);
  return { store, controller, trainer };
}
function situation(session: TrainerSession) {
  const r = session.recommendation!;
  return `${r.handKind} ${r.playerTotal} vs ${r.dealerCard === 11 ? "A" : r.dealerCard}`;
}

it("drills archived opening mistakes without importing scores, and resumes deterministically", async () => {
  const { store, controller, trainer } = setup();
  const initial = await controller.start({});
  const original = await trainer();
  const key = situation(original);
  const wrong = original.availableActions.find(
    (action) => action !== original.recommendation!.action,
  )!;
  await controller.end(await controller.choose(initial, wrong));
  let state = await controller.start({ practice: "missed" });
  expect(situation(await trainer())).toBe(key);
  expect(state.stats.decisions).toBe(0);
  expect(state.stats.missed_situations).toEqual([]);
  expect((await trainer()).checkpoint().drillSituations).toEqual([key]);
  const reloaded = new SessionController(store);
  expect(await reloaded.load()).toEqual(state);
  for (let round = 0; round < 4; round++) {
    expect(situation(await trainer())).toBe(key);
    while (state.status !== "complete") {
      state = await controller.choose(
        state,
        (await trainer()).recommendation!.action,
      );
    }
    const expected = await trainer();
    expected.nextRound();
    state = await reloaded.choose(state, "next");
    expect((await trainer()).checkpoint()).toEqual(expected.checkpoint());
  }
  expect(state.stats.accuracy).toBe(1);
  // Deleting history does not rewrite the active drill's saved selection.
  await controller.clearHistory();
  expect((await trainer()).checkpoint().drillSituations).toEqual([key]);
  await controller.discardSavedSession();
  await controller.start({ practice: "missed" });
  expect((await trainer()).checkpoint().drillSituations).toBeUndefined();
});

it("includes the replaced session's scored opening mistakes immediately", async () => {
  const { controller, trainer } = setup();
  const initial = await controller.start({ feedback_mode: "correction" });
  const original = await trainer();
  const key = situation(original);
  const wrong = original.availableActions.find(
    (action) => action !== original.recommendation!.action,
  )!;
  const attempted = await controller.choose(initial, wrong);
  const reset = await controller.reset(attempted, { practice: "missed" });
  expect(situation(await trainer())).toBe(key);
  expect(reset.stats.decisions).toBe(0);
  expect((await controller.history()).sessions[0].stats.openingMisses).toEqual([
    [key, 1],
  ]);
});

it("does not train on unscored delayed choices or copy inherited drill targets into scores", async () => {
  const { controller, trainer } = setup();
  const initial = await controller.start({ feedback_mode: "delayed" });
  const original = await trainer();
  // Seed 10 has a non-terminal opening hit; abandon it before delayed scoring.
  const pending = await controller.choose(initial, "hit");
  expect(pending.status).toBe("player_turn");
  expect(pending.stats.decisions).toBe(0);
  expect(original.recommendation!.action).not.toBe("hit");
  await controller.end(pending);
  await controller.start({ practice: "missed" });
  expect((await trainer()).checkpoint().drillSituations).toBeUndefined();
});

it("ignores archived situations unreachable under the selected rules", () => {
  const session = new TrainerSession(
    { practice: "missed", rules: { max_splits: 0 } },
    {
      drillSituations: ["pair 16 vs 6"],
    },
  );
  expect(session.checkpoint().drillSituations).toBeUndefined();
});
