import {
  estimate,
  simulateBlock,
  simulationModes,
  validateSimulation,
} from "./advanced-practice";
import type {
  SimulationMessage,
  SimulationMode,
  SimulationRequest,
} from "./advanced-practice";
const send = (message: SimulationMessage) => postMessage(message);
self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  try {
    const input = event.data;
    validateSimulation(input);
    const samples: Record<SimulationMode, number[]> = {
      "basic-flat": [],
      "basic-ramp": [],
      "stand-flat": [],
    };
    for (let block = 0; block < input.blocks; block++) {
      // Separate reproducible pseudo-random stream per independent block.
      const seed = (input.seed + Math.imul(block, 0x9e3779b9)) >>> 0;
      for (const mode of simulationModes)
        samples[mode].push(simulateBlock(mode, seed, input.ramp, input.rules));
      send({ type: "progress", completed: block + 1, total: input.blocks });
    }
    send({
      type: "result",
      estimates: {
        "basic-flat": estimate(samples["basic-flat"]),
        "basic-ramp": estimate(samples["basic-ramp"]),
        "stand-flat": estimate(samples["stand-flat"]),
      },
      rounds: input.blocks * 50,
    });
  } catch (error) {
    send({
      type: "error",
      message: error instanceof Error ? error.message : "Simulation failed.",
    });
  }
};
