export const MAX_PLAYERS = 6;
export const MATCH_TARGETS = [10, 20, 30] as const;
export const PLAYER_MAX_HEALTH = 4;
export const RESPAWN_DELAY_MS = 2_000;
export const RESPAWN_INVULNERABLE_MS = 2_000;
export const CELEBRATION_DURATION_MS = 5_000;
export const SERVER_TICK_MS = 50;
export const PROJECTILE_SPEED = 620;
export const PROJECTILE_FIRE_INTERVAL_MS = 140;
export const RAPID_FIRE_INTERVAL_MULTIPLIER = 0.5;
export const PROJECTILE_RADIUS = 4;
export const HEAVY_PROJECTILE_RADIUS = PROJECTILE_RADIUS * 2;
export const RICOCHET_BOUNCES = 1;
export const PLAYER_CLASS_TYPES = ["machine-gunner", "laser-gunner", "grenadier"] as const;
export const LASER_FIRE_INTERVAL_MULTIPLIER = 4;
export const LASER_ACTIVATION_DELAY_MS = 100;
export const LASER_VISUAL_DURATION_MS = 400;
export const GRENADE_FIRE_INTERVAL_MULTIPLIER = 3;
export const GRENADE_EXPLOSION_DELAY_MS = 500;
export const GRENADE_EXPLOSION_VISUAL_MS = 180;
export const CELEBRATION_PROJECTILE_RADIUS = 26;
export const PLAYER_RADIUS = 14;
export const LASER_RADIUS = PLAYER_RADIUS / 4;
export const GRENADE_BLAST_RADIUS = PLAYER_RADIUS * 2;
export const PLAYER_MOVE_SPEED = 220;
export const PLAYER_SPEED_BOOST_MULTIPLIER = 1.45;
export const MAX_PROJECTILES_PER_ROOM = 96;
export const PICKUP_SPAWN_INTERVAL_MS = 5_000;
export const MAX_ACTIVE_PICKUPS_PER_ROOM = 1;
export const PICKUP_RADIUS = 12;
export const SPECIAL_ABILITY_TYPES = ["ricochet", "speed", "heavy-shot", "rapid-fire"] as const;
export const ARENA_MAP = {
  width: 960,
  height: 640
} as const;
export const GRENADE_THROW_RANGE = ARENA_MAP.width / 4;
