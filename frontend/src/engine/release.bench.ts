import { bench, describe } from "vitest";
import { seededRandom } from "./cards";
import { TrainerSession } from "./trainer";

// Fixed workloads, advisory timings: do not gate CI on shared-runner speed.
const session = new TrainerSession({}, { random: seededRandom(42) });
const saved = session.checkpoint();

describe("release engine baseline", () => {
  bench("validate and restore checkpoint", () => {
    TrainerSession.restore(saved);
  });
  bench("render masked snapshot", () => {
    session.snapshot();
  });
  bench("100 rounds with recommendations and checkpoint round trips", () => {
    const trainer = new TrainerSession({}, { random: seededRandom(42) });
    for (let round = 0; round < 100; round++) {
      while (trainer.round.status !== "complete") {
        trainer.choose(trainer.recommendation!.action);
      }
      TrainerSession.restore(trainer.checkpoint());
      trainer.nextRound();
    }
  });
});
