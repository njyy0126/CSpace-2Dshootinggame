import { describe, expect, it } from "vitest";
import { ARENA_MAP, MATCH_TARGETS, MAX_PLAYERS, PLAYER_RADIUS } from "../../src/shared/constants";
import { DEFAULT_MAP_ID, MAPS, SPAWN_POINTS, WALLS, getMapDefinition } from "../../src/shared/map";

function spawnCollidesWithWall(
  spawn: { x: number; y: number },
  wall: { x: number; y: number; width: number; height: number }
) {
  const nearestX = Math.max(wall.x, Math.min(spawn.x, wall.x + wall.width));
  const nearestY = Math.max(wall.y, Math.min(spawn.y, wall.y + wall.height));

  return Math.hypot(spawn.x - nearestX, spawn.y - nearestY) < PLAYER_RADIUS;
}

describe("shared map definition", () => {
  it("exposes exactly six or fewer supported spawn points", () => {
    expect(ARENA_MAP.width).toBeGreaterThan(0);
    expect(ARENA_MAP.height).toBeGreaterThan(0);
    expect(SPAWN_POINTS.length).toBeGreaterThanOrEqual(6);
    expect(MAX_PLAYERS).toBe(6);
  });

  it("supports the agreed match targets", () => {
    expect(MATCH_TARGETS).toEqual([10, 20, 30]);
  });

  it("marks boundary walls as indestructible", () => {
    expect(WALLS.some((wall) => wall.kind === "boundary" && wall.destructible)).toBe(false);
  });

  it("offers three selectable arena layouts", () => {
    expect(DEFAULT_MAP_ID).toBe(getMapDefinition(DEFAULT_MAP_ID).id);
    expect(MAPS).toHaveLength(3);
    expect(new Set(MAPS.map((map) => map.id)).size).toBe(3);
  });

  it("keeps every map spawn point inside the arena bounds and outside all walls", () => {
    for (const map of MAPS) {
      for (const spawn of map.spawnPoints) {
        expect(spawn.x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
        expect(spawn.y).toBeGreaterThanOrEqual(PLAYER_RADIUS);
        expect(spawn.x).toBeLessThanOrEqual(ARENA_MAP.width - PLAYER_RADIUS);
        expect(spawn.y).toBeLessThanOrEqual(ARENA_MAP.height - PLAYER_RADIUS);
        expect(map.walls.some((wall) => spawnCollidesWithWall(spawn, wall))).toBe(false);
      }
    }
  });

  it("keeps tuned cover walls inside arena bounds after shrinking traversal blockers", () => {
    for (const map of MAPS) {
      for (const wall of map.walls.filter((wall) => wall.kind === "cover")) {
        expect(wall.x).toBeGreaterThan(0);
        expect(wall.y).toBeGreaterThan(0);
        expect(wall.x + wall.width).toBeLessThan(ARENA_MAP.width);
        expect(wall.y + wall.height).toBeLessThan(ARENA_MAP.height);
      }
    }
  });

  it("uses smaller obstacle footprints on the known tight traversal blockers", () => {
    const crossroadsCenterNorthWest = MAPS[0]!.walls.find((wall) => wall.id === "crossroads-center-nw");
    const switchbackLeftTopPillar = MAPS[1]!.walls.find((wall) => wall.id === "switchback-left-top-pillar");
    const citadelKeep = MAPS[2]!.walls.find((wall) => wall.id === "citadel-keep");

    expect(crossroadsCenterNorthWest).toMatchObject({
      width: 104,
      height: 64
    });
    expect(switchbackLeftTopPillar).toMatchObject({
      width: 36
    });
    expect(citadelKeep).toMatchObject({
      width: 164,
      height: 184
    });
  });
});
