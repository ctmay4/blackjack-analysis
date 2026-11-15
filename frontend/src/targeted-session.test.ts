import { expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDbSessionStore } from "./session-store";
import { SessionController } from "./session-controller";

it("archives targeted practice and restores its exact future through a backup", async () => {
  let serial = 0;
  const store = new IndexedDbSessionStore(new IDBFactory());
  const controller = new SessionController(store, {
    seed: () => 42,
    id: () => `target-session-${++serial}`,
  });
  const initial = await controller.start({});
  const target = { kind: "hard", player: 16, dealer: 10 } as const;
  const drill = await controller.reset(initial, {
    ...initial.config,
    practice: "targeted",
    target,
    feedback_mode: "delayed",
  });
  expect((await controller.history()).sessions).toHaveLength(1);
  await expect(controller.choose(initial, "stand")).rejects.toMatchObject({
    code: "stale",
  });
  const completed = await controller.choose(drill, "stand");
  expect(completed.stats.decisions).toBe(1);
  const saved = await controller.backup();
  const next = await controller.choose(completed, "next");
  await controller.restoreBackup(saved);
  const restored = (await controller.load())!;
  expect(restored.config.target).toEqual(target);
  const future = await controller.choose(restored, "next");
  expect(future).toEqual({
    ...next,
    session_id: future.session_id,
    revision: future.revision,
  });
  await controller.end(future);
  const history = await controller.history();
  expect(history.sessions).toHaveLength(2);
  expect(
    history.sessions.find((item) => item.config.practice === "targeted")!.config
      .target,
  ).toEqual(target);
});
