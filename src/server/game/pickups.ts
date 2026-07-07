import {
  ARENA_MAP,
  PICKUP_RADIUS,
  PLAYER_RADIUS,
  SPECIAL_ABILITY_TYPES
} from "../../shared/constants";
import { getMapDefinition } from "../../shared/map";
import { distance } from "../../shared/math";
import type { MapId, PickupSnapshot, PlayerAbility, PlayerSnapshot, Vec2, Wall } from "../../shared/types";
import { playerHitsWallAt } from "./collision";

const PICKUP_GRID_STEP = 32;
const pickupSpawnCache = new Map<MapId, Vec2[]>();
const scriptedPickupTypes = (process.env.PICKUP_TEST_SEQUENCE ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value): value is PlayerAbility => SPECIAL_ABILITY_TYPES.includes(value as PlayerAbility));
const scriptedPickupPositions = (process.env.PICKUP_TEST_POSITIONS ?? "")
  .split("|")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => {
    const [rawX, rawY] = value.split(":");
    const x = Number(rawX);
    const y = Number(rawY);

    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  })
  .filter((value): value is Vec2 => value !== null);

function isNavigablePickupPoint(x: number, y: number, walls: Wall[]) {
  return (
    x >= PLAYER_RADIUS &&
    x <= ARENA_MAP.width - PLAYER_RADIUS &&
    y >= PLAYER_RADIUS &&
    y <= ARENA_MAP.height - PLAYER_RADIUS &&
    !walls.some((wall) => playerHitsWallAt(x, y, wall))
  );
}

function buildPickupSpawnPoints(mapId: MapId) {
  const map = getMapDefinition(mapId);
  const points: Vec2[] = [];
  const seen = new Set<string>();

  const rememberPoint = (x: number, y: number) => {
    const key = `${Math.round(x)}:${Math.round(y)}`;
    if (seen.has(key) || !isNavigablePickupPoint(x, y, map.walls)) {
      return;
    }

    seen.add(key);
    points.push({ x, y });
  };

  for (const spawn of map.spawnPoints) {
    rememberPoint(spawn.x, spawn.y);
  }

  for (let y = PLAYER_RADIUS; y <= ARENA_MAP.height - PLAYER_RADIUS; y += PICKUP_GRID_STEP) {
    for (let x = PLAYER_RADIUS; x <= ARENA_MAP.width - PLAYER_RADIUS; x += PICKUP_GRID_STEP) {
      rememberPoint(x, y);
    }
  }

  return points;
}

export function getPickupSpawnPoints(mapId: MapId) {
  const cached = pickupSpawnCache.get(mapId);
  if (cached) {
    return cached;
  }

  const nextPoints = buildPickupSpawnPoints(mapId);
  pickupSpawnCache.set(mapId, nextPoints);
  return nextPoints;
}

export function getRandomPickupType(random = Math.random): PlayerAbility {
  const index = Math.min(
    SPECIAL_ABILITY_TYPES.length - 1,
    Math.floor(random() * SPECIAL_ABILITY_TYPES.length)
  );
  return SPECIAL_ABILITY_TYPES[index]!;
}

export function createPickup(type: PlayerAbility, position: Vec2, now: number): PickupSnapshot {
  return {
    id: `pickup-${now}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    x: position.x,
    y: position.y,
    radius: PICKUP_RADIUS,
    spawnedAt: now
  };
}

export function createRandomPickup(
  mapId: MapId,
  now: number,
  random = Math.random,
  sequenceIndex = 0
): PickupSnapshot | null {
  if (scriptedPickupTypes.length > 0 || scriptedPickupPositions.length > 0) {
    const fallbackPosition = getPickupSpawnPoints(mapId)[0];
    const scriptedPosition =
      scriptedPickupPositions[sequenceIndex % Math.max(1, scriptedPickupPositions.length)] ?? fallbackPosition;
    const scriptedType =
      scriptedPickupTypes[sequenceIndex % Math.max(1, scriptedPickupTypes.length)] ?? getRandomPickupType(random);

    return scriptedPosition ? createPickup(scriptedType, scriptedPosition, now) : null;
  }

  const spawnPoints = getPickupSpawnPoints(mapId);
  if (spawnPoints.length === 0) {
    return null;
  }

  const positionIndex = Math.min(spawnPoints.length - 1, Math.floor(random() * spawnPoints.length));
  const position = spawnPoints[positionIndex]!;
  return createPickup(getRandomPickupType(random), position, now);
}

export function playerCollectsPickup(player: Pick<PlayerSnapshot, "x" | "y">, pickup: PickupSnapshot) {
  return distance(player, pickup) <= PLAYER_RADIUS + pickup.radius;
}

export function getPickupRadius() {
  return PICKUP_RADIUS;
}
