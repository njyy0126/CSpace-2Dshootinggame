import { describe, expect, it } from "vitest";
import { chooseSpawnPoint } from "../../src/server/game/spawn";

describe("chooseSpawnPoint", () => {
  it("prefers the point farthest from living enemies", () => {
    const spawn = chooseSpawnPoint([
      { x: 100, y: 100, alive: true },
      { x: 200, y: 100, alive: true }
    ]);

    expect(spawn.id).toBe("crossroads-s2");
  });
});
