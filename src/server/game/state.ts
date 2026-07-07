import { MATCH_TARGETS, PICKUP_SPAWN_INTERVAL_MS, PLAYER_MAX_HEALTH } from "../../shared/constants";
import { DEFAULT_MAP_ID, getMapSpawnPoints, getMapWalls } from "../../shared/map";
import type {
  BombSnapshot,
  LaserSnapshot,
  MatchTarget,
  PlayerSnapshot,
  PickupSnapshot,
  SpawnPoint,
  ProjectileSnapshot,
  RoomSnapshot
} from "../../shared/types";

const PLAYER_COLORS = ["#7dd3fc", "#fca5a5", "#86efac", "#fcd34d", "#c4b5fd", "#f9a8d4"];

export interface RoomState extends RoomSnapshot {}
export interface PlayerInputState {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  firing: boolean;
  fireQueued: boolean;
  lastUpdatedAt: number;
  lastFiredAt: number;
}

export interface RoomState extends RoomSnapshot {
  playerInputs: Record<string, PlayerInputState>;
  activeLasers: Record<string, LaserSnapshot>;
  activeBombs: Record<string, BombSnapshot>;
  lastTickAt: number;
  nextPickupSpawnAt: number;
  pickupSpawnCount: number;
}

export function createDefaultInputState(player?: Pick<PlayerSnapshot, "x" | "y" | "aim">): PlayerInputState {
  const aim = player?.aim ?? { x: 1, y: 0 };
  const x = player?.x ?? 0;
  const y = player?.y ?? 0;

  return {
    moveX: 0,
    moveY: 0,
    aimX: x + aim.x * 120,
    aimY: y + aim.y * 120,
    firing: false,
    fireQueued: false,
    lastUpdatedAt: 0,
    lastFiredAt: 0
  };
}

export function createPlayer(
  id: string,
  nickname: string,
  color: string,
  spawn = getMapSpawnPoints(DEFAULT_MAP_ID)[0]
): PlayerSnapshot {
  return {
    id,
    nickname,
    color,
    classType: "machine-gunner",
    x: spawn.x,
    y: spawn.y,
    aim: { x: 1, y: 0 },
    health: PLAYER_MAX_HEALTH,
    kills: 0,
    alive: true,
    invulnerableUntil: 0,
    respawnAt: null,
    waitingForNextRound: false,
    ability: null
  };
}

export function getPlayerColor(index: number) {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

function getDefaultMatchTarget() {
  const fromEnv = Number(process.env.E2E_MATCH_TARGET ?? MATCH_TARGETS[0]);
  return (Number.isFinite(fromEnv) ? fromEnv : MATCH_TARGETS[0]) as MatchTarget;
}

export function resetPlayerForRound(player: PlayerSnapshot, spawn: SpawnPoint) {
  const classType = player.classType ?? "machine-gunner";
  player.x = spawn.x;
  player.y = spawn.y;
  player.aim = { x: 1, y: 0 };
  player.kills = 0;
  player.health = PLAYER_MAX_HEALTH;
  player.alive = true;
  player.respawnAt = null;
  player.invulnerableUntil = 0;
  player.waitingForNextRound = false;
  player.ability = null;
  player.classType = classType;
}

export function createRoomState(code: string, hostId: string, hostNickname: string): RoomState {
  const hostPlayer = createPlayer(hostId, hostNickname, getPlayerColor(0), getMapSpawnPoints(DEFAULT_MAP_ID)[0]);

  return {
    code,
    hostId,
    phase: "lobby",
    matchTarget: getDefaultMatchTarget(),
    mapId: DEFAULT_MAP_ID,
    players: {
      [hostId]: hostPlayer
    },
    activeProjectiles: {} as Record<string, ProjectileSnapshot>,
    activeLasers: {} as Record<string, LaserSnapshot>,
    activeBombs: {} as Record<string, BombSnapshot>,
    activePickups: {} as Record<string, PickupSnapshot>,
    walls: getMapWalls(DEFAULT_MAP_ID),
    winnerId: null,
    celebrationEndsAt: null,
    playerInputs: {
      [hostId]: createDefaultInputState(hostPlayer)
    },
    lastTickAt: Date.now(),
    nextPickupSpawnAt: Date.now() + PICKUP_SPAWN_INTERVAL_MS,
    pickupSpawnCount: 0
  };
}
