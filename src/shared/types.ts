import type { MATCH_TARGETS, PLAYER_CLASS_TYPES, SPECIAL_ABILITY_TYPES } from "./constants";

export type MatchTarget = (typeof MATCH_TARGETS)[number];
export type MapId = "crossroads" | "switchback" | "citadel";
export type RoomPhase = "lobby" | "countdown" | "playing" | "celebration";
export type WallKind = "boundary" | "cover";
export type PlayerAbility = (typeof SPECIAL_ABILITY_TYPES)[number];
export type PlayerClass = (typeof PLAYER_CLASS_TYPES)[number];
export type ProjectileEffect = Exclude<PlayerAbility, "speed" | "rapid-fire">;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  kind: WallKind;
  destructible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpawnPoint extends Vec2 {
  id: string;
}

export interface ArenaMapDefinition {
  id: MapId;
  name: string;
  summary: string;
  spawnPoints: SpawnPoint[];
  walls: Wall[];
}

export interface PlayerSnapshot {
  id: string;
  nickname: string;
  color: string;
  classType?: PlayerClass;
  x: number;
  y: number;
  aim: Vec2;
  health: number;
  kills: number;
  alive: boolean;
  invulnerableUntil: number;
  respawnAt: number | null;
  waitingForNextRound: boolean;
  ability: PlayerAbility | null;
}

export interface ProjectileSnapshot {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  celebrationOnly: boolean;
  effect: ProjectileEffect | null;
  ricochetsRemaining: number;
}

export interface LaserSnapshot {
  id: string;
  ownerId: string;
  path: Vec2[];
  radius: number;
  createdAt: number;
  activatesAt: number;
  expiresAt: number;
  effect: ProjectileEffect | null;
  damageApplied: boolean;
}

export interface BombSnapshot {
  id: string;
  ownerId: string;
  origin: Vec2;
  target: Vec2;
  blastRadius: number;
  createdAt: number;
  explodeAt: number;
  state: "arming" | "exploding";
  explosionEndsAt: number | null;
  effect: ProjectileEffect | null;
}

export interface PickupSnapshot {
  id: string;
  type: PlayerAbility;
  x: number;
  y: number;
  radius: number;
  spawnedAt: number;
}

export interface RoomSnapshot {
  code: string;
  hostId: string;
  phase: RoomPhase;
  matchTarget: MatchTarget;
  mapId: MapId;
  players: Record<string, PlayerSnapshot>;
  activeProjectiles: Record<string, ProjectileSnapshot>;
  activeLasers?: Record<string, LaserSnapshot>;
  activeBombs?: Record<string, BombSnapshot>;
  activePickups: Record<string, PickupSnapshot>;
  walls: Wall[];
  winnerId: string | null;
  celebrationEndsAt: number | null;
}

export interface RoomSummary {
  code: string;
  hostNickname: string;
  playerCount: number;
  phase: RoomPhase;
  mapId: MapId;
}

export interface ClientInput {
  roomCode: string;
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  firing: boolean;
}
