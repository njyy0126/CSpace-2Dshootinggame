import { PLAYER_CLASS_TYPES } from "./constants";
import type { PlayerClass } from "./types";

export function isPlayerClass(value: string): value is PlayerClass {
  return PLAYER_CLASS_TYPES.includes(value as PlayerClass);
}

export function getPlayerClass(player: { classType?: PlayerClass } | null | undefined): PlayerClass {
  return player?.classType ?? "machine-gunner";
}
