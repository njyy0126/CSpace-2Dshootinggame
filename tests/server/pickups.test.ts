import { describe, expect, it } from "vitest";
import { ARENA_MAP, PLAYER_RADIUS } from "../../src/shared/constants";
import { playerHitsWallAt } from "../../src/server/game/collision";
import { createEngine } from "../../src/server/game/engine";
import { createRoomState } from "../../src/server/game/state";

function createTestPickup(
  id: string,
  type: "ricochet" | "speed" | "heavy-shot" | "rapid-fire",
  x: number,
  y: number
) {
  return {
    id,
    type,
    x,
    y,
    radius: 12,
    spawnedAt: 0
  };
}

describe("pickup gameplay", () => {
  it("spawns pickups on the five-second cadence and keeps them in navigable arena space", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    room.phase = "playing";
    room.lastTickAt = 10_000;
    (room as any).nextPickupSpawnAt = 10_000;
    (room as any).activePickups = {};

    const engine = createEngine();

    engine.tickRoom(room, 10_000);
    const firstPickup = Object.values((room as any).activePickups ?? {})[0] as any;

    expect(firstPickup).toBeDefined();
    expect(firstPickup.x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(firstPickup.y).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(firstPickup.x).toBeLessThanOrEqual(ARENA_MAP.width - PLAYER_RADIUS);
    expect(firstPickup.y).toBeLessThanOrEqual(ARENA_MAP.height - PLAYER_RADIUS);
    expect(room.walls.some((wall) => playerHitsWallAt(firstPickup.x, firstPickup.y, wall))).toBe(false);

    engine.tickRoom(room, 14_999);
    expect(Object.values((room as any).activePickups ?? {})).toHaveLength(1);
    expect(Object.values((room as any).activePickups ?? {})[0]).toEqual(firstPickup);

    engine.tickRoom(room, 15_000);
    const refreshedPickup = Object.values((room as any).activePickups ?? {})[0] as any;

    expect(refreshedPickup).toBeDefined();
    expect(refreshedPickup.id).not.toBe(firstPickup.id);
    expect(room.walls.some((wall) => playerHitsWallAt(refreshedPickup.x, refreshedPickup.y, wall))).toBe(false);
  });

  it("grants the picked-up ability, overwrites an old one, and removes the drop from the map", () => {
    const room = createRoomState("ABCDE", "host", "Host");
    room.phase = "playing";
    room.lastTickAt = 20_000;
    (room as any).activePickups = {
      green: createTestPickup("green", "ricochet", room.players.host.x, room.players.host.y)
    };

    const engine = createEngine();

    engine.tickRoom(room, 20_000);

    expect((room.players.host as any).ability).toBe("ricochet");
    expect((room as any).activePickups).toEqual({});

    (room.players.host as any).ability = "ricochet";
    (room as any).activePickups = {
      red: createTestPickup("red", "speed", room.players.host.x, room.players.host.y)
    };

    engine.tickRoom(room, 20_050);

    expect((room.players.host as any).ability).toBe("speed");
    expect((room as any).activePickups).toEqual({});

    (room.players.host as any).ability = "speed";
    (room as any).activePickups = {
      purple: createTestPickup("purple", "rapid-fire", room.players.host.x, room.players.host.y)
    };

    engine.tickRoom(room, 20_100);

    expect((room.players.host as any).ability).toBe("rapid-fire");
    expect((room as any).activePickups).toEqual({});
  });
});
