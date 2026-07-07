import {
  CELEBRATION_PROJECTILE_RADIUS,
  CELEBRATION_DURATION_MS,
  GRENADE_BLAST_RADIUS,
  GRENADE_EXPLOSION_DELAY_MS,
  GRENADE_EXPLOSION_VISUAL_MS,
  GRENADE_FIRE_INTERVAL_MULTIPLIER,
  GRENADE_THROW_RANGE,
  HEAVY_PROJECTILE_RADIUS,
  LASER_ACTIVATION_DELAY_MS,
  LASER_FIRE_INTERVAL_MULTIPLIER,
  LASER_RADIUS,
  LASER_VISUAL_DURATION_MS,
  MAX_PROJECTILES_PER_ROOM,
  MAX_ACTIVE_PICKUPS_PER_ROOM,
  PLAYER_MOVE_SPEED,
  PLAYER_SPEED_BOOST_MULTIPLIER,
  PLAYER_MAX_HEALTH,
  PLAYER_RADIUS,
  PICKUP_SPAWN_INTERVAL_MS,
  PROJECTILE_FIRE_INTERVAL_MS,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED,
  RAPID_FIRE_INTERVAL_MULTIPLIER,
  RESPAWN_DELAY_MS,
  RESPAWN_INVULNERABLE_MS,
  RICOCHET_BOUNCES
} from "../../shared/constants";
import { getMapSpawnPoints, getMapWalls } from "../../shared/map";
import { normalize } from "../../shared/math";
import { getPlayerClass } from "../../shared/playerClass";
import type {
  BombSnapshot,
  LaserSnapshot,
  PlayerAbility,
  PlayerClass,
  PlayerSnapshot,
  ProjectileEffect,
  ProjectileSnapshot,
  Vec2,
  Wall
} from "../../shared/types";
import {
  type ProjectileWallCollision,
  findRayWallCollision,
  getProjectileWallCollision,
  isNavigablePoint,
  projectileHitsPlayer,
  projectileHitsWall,
  projectilePathHitsWall,
  resolvePlayerMovement,
  segmentHitsPlayer
} from "./collision";
import { createRandomPickup, playerCollectsPickup } from "./pickups";
import {
  createDefaultInputState,
  resetPlayerForRound,
  type RoomState
} from "./state";
import { chooseSpawnPoint } from "./spawn";

interface WallCollisionCandidate {
  wall: Wall;
  collision: ProjectileWallCollision | null;
  overlapping: boolean;
}

interface AttackSpawnResult {
  consumedCooldown: boolean;
}

const LASER_BOUNCE_SEPARATION = 0.5;

export function createEngine() {
  return {
    tickLobby(room: RoomState, now: number) {
      void room;
      void now;
    },
    tickRoom(room: RoomState, now: number) {
      const deltaMs = Math.max(0, Math.min(now - room.lastTickAt, 100));
      const deltaSeconds = deltaMs / 1_000;

      this.movePlayers(room, deltaSeconds);
      this.collectPickups(room);
      this.spawnProjectiles(room, now);
      this.advanceProjectiles(room, deltaSeconds, now, false);
      this.resolveLasers(room, now);
      this.resolveBombs(room, now);
      this.respawnDuePlayers(room, now);
      this.spawnPickupIfDue(room, now);
      room.lastTickAt = now;
    },
    tickCelebration(room: RoomState, now: number) {
      const deltaMs = Math.max(0, Math.min(now - room.lastTickAt, 100));
      const deltaSeconds = deltaMs / 1_000;

      this.movePlayers(room, deltaSeconds);
      this.spawnCelebrationProjectiles(room, now);
      this.advanceProjectiles(room, deltaSeconds, now, true);
      room.lastTickAt = now;
    },
    applyProjectileHit(room: RoomState, attackerId: string, victimId: string, now = Date.now()) {
      const attacker = room.players[attackerId];
      const victim = room.players[victimId];

      if (!attacker || !victim || !victim.alive || victim.invulnerableUntil > now) {
        return;
      }

      victim.health -= 1;

      if (victim.health > 0) {
        return;
      }

      victim.alive = false;
      victim.health = 0;
      victim.respawnAt = now + RESPAWN_DELAY_MS;
      victim.ability = null;
      this.clearAbilityEnhancedAttacks(room, victimId);
      attacker.kills += 1;

      if (attacker.kills >= room.matchTarget) {
        room.phase = "celebration";
        room.winnerId = attackerId;
        room.celebrationEndsAt = now + CELEBRATION_DURATION_MS;
        this.clearAllAttacks(room);
        room.activePickups = {};
        room.nextPickupSpawnAt = now + PICKUP_SPAWN_INTERVAL_MS;
        room.pickupSpawnCount = 0;

        for (const player of Object.values(room.players)) {
          player.ability = null;
        }
      }
    },
    respawnDuePlayers(room: RoomState, now: number) {
      for (const player of Object.values(room.players)) {
        if (!player.alive && player.respawnAt !== null && player.respawnAt <= now && room.phase === "playing") {
          const spawn = chooseSpawnPoint(
            Object.values(room.players).filter((other) => other.id !== player.id),
            getMapSpawnPoints(room.mapId)
          );

          player.x = spawn.x;
          player.y = spawn.y;
          player.alive = true;
          player.health = PLAYER_MAX_HEALTH;
          player.respawnAt = null;
          player.invulnerableUntil = now + RESPAWN_INVULNERABLE_MS;
          player.ability = null;
        }
      }
    },
    resetAfterCelebration(room: RoomState, now: number) {
      if (room.phase === "celebration" && room.celebrationEndsAt !== null && room.celebrationEndsAt <= now) {
        const spawnPoints = getMapSpawnPoints(room.mapId);

        room.phase = "lobby";
        room.winnerId = null;
        room.celebrationEndsAt = null;
        this.clearAllAttacks(room);
        room.activePickups = {};
        room.nextPickupSpawnAt = now + PICKUP_SPAWN_INTERVAL_MS;
        room.pickupSpawnCount = 0;
        room.walls = getMapWalls(room.mapId);
        room.lastTickAt = now;

        let spawnIndex = 0;
        for (const player of Object.values(room.players)) {
          const spawn = spawnPoints[spawnIndex % spawnPoints.length]!;
          spawnIndex += 1;

          resetPlayerForRound(player, spawn);
          room.playerInputs[player.id] = createDefaultInputState(player);
        }
      }
    },
    clearAllAttacks(room: RoomState) {
      room.activeProjectiles = {};
      room.activeLasers = {};
      room.activeBombs = {};
    },
    clearAbilityEnhancedAttacks(room: RoomState, ownerId: string) {
      room.activeProjectiles = Object.fromEntries(
        Object.entries(room.activeProjectiles).filter(
          ([, projectile]) => projectile.ownerId !== ownerId || projectile.effect === null
        )
      );
      room.activeLasers = Object.fromEntries(
        Object.entries(room.activeLasers).filter(
          ([, laser]) => laser.ownerId !== ownerId || laser.effect === null
        )
      );
      room.activeBombs = Object.fromEntries(
        Object.entries(room.activeBombs).filter(
          ([, bomb]) => bomb.ownerId !== ownerId || bomb.effect === null
        )
      );
    },
    createProjectile(
      ownerId: string,
      x: number,
      y: number,
      vx: number,
      vy: number,
      options: {
        radius?: number;
        effect?: ProjectileEffect | null;
        ricochetsRemaining?: number;
      } = {}
    ): ProjectileSnapshot {
      return {
        id: `${ownerId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ownerId,
        x,
        y,
        vx,
        vy,
        radius: options.radius ?? PROJECTILE_RADIUS,
        celebrationOnly: false,
        effect: options.effect ?? null,
        ricochetsRemaining: options.ricochetsRemaining ?? 0
      };
    },
    createLaser(
      ownerId: string,
      path: Vec2[],
      radius: number,
      effect: ProjectileEffect | null,
      now: number
    ): LaserSnapshot {
      return {
        id: `${ownerId}-laser-${now}-${Math.random().toString(36).slice(2, 7)}`,
        ownerId,
        path,
        radius,
        createdAt: now,
        activatesAt: now + LASER_ACTIVATION_DELAY_MS,
        expiresAt: now + LASER_VISUAL_DURATION_MS,
        effect,
        damageApplied: false
      };
    },
    createBomb(
      ownerId: string,
      origin: Vec2,
      target: Vec2,
      blastRadius: number,
      effect: ProjectileEffect | null,
      now: number
    ): BombSnapshot {
      return {
        id: `${ownerId}-bomb-${now}-${Math.random().toString(36).slice(2, 7)}`,
        ownerId,
        origin,
        target,
        blastRadius,
        createdAt: now,
        explodeAt: now + GRENADE_EXPLOSION_DELAY_MS,
        state: "arming",
        explosionEndsAt: null,
        effect
      };
    },
    spawnPickupIfDue(room: RoomState, now: number) {
      if (room.phase !== "playing" || now < room.nextPickupSpawnAt) {
        return;
      }

      const pickup = createRandomPickup(room.mapId, now, Math.random, room.pickupSpawnCount);
      room.activePickups = {};

      if (pickup && MAX_ACTIVE_PICKUPS_PER_ROOM > 0) {
        room.activePickups[pickup.id] = pickup;
      }

      room.pickupSpawnCount += 1;
      room.nextPickupSpawnAt = now + PICKUP_SPAWN_INTERVAL_MS;
    },
    collectPickups(room: RoomState) {
      const pickups = Object.values(room.activePickups);
      if (pickups.length === 0) {
        return;
      }

      for (const player of Object.values(room.players)) {
        if (!player.alive || player.waitingForNextRound) {
          continue;
        }

        const pickup = pickups.find((candidate) => playerCollectsPickup(player, candidate));
        if (!pickup) {
          continue;
        }

        player.ability = pickup.type;
        delete room.activePickups[pickup.id];
        break;
      }
    },
    movePlayers(room: RoomState, deltaSeconds: number) {
      for (const player of Object.values(room.players)) {
        if (!player.alive || player.waitingForNextRound) {
          continue;
        }

        const input = room.playerInputs[player.id];
        if (!input) {
          continue;
        }

        const direction = normalize(
          {
            x: input.moveX,
            y: input.moveY
          },
          { x: 0, y: 0 }
        );

        const nextPosition = resolvePlayerMovement(
          player.x,
          player.y,
          direction.x * this.getMoveSpeed(player.ability) * deltaSeconds,
          direction.y * this.getMoveSpeed(player.ability) * deltaSeconds,
          room.walls
        );
        player.x = nextPosition.x;
        player.y = nextPosition.y;

        player.aim = normalize(
          {
            x: input.aimX - player.x,
            y: input.aimY - player.y
          },
          player.aim
        );
      }
    },
    spawnProjectiles(room: RoomState, now: number) {
      if (this.getActiveAttackCount(room) >= MAX_PROJECTILES_PER_ROOM) {
        return;
      }

      for (const player of Object.values(room.players)) {
        const input = room.playerInputs[player.id];

        if (!player.alive || player.waitingForNextRound) {
          if (input) {
            input.fireQueued = false;
          }
          continue;
        }

        if (
          !input ||
          (!input.firing && !input.fireQueued) ||
          now - input.lastFiredAt < this.getAttackFireInterval(getPlayerClass(player), player.ability)
        ) {
          continue;
        }

        const aim = normalize(
          {
            x: input.aimX - player.x,
            y: input.aimY - player.y
          },
          player.aim
        );
        const result = this.spawnAttackForPlayer(room, player, aim, input, now);

        input.fireQueued = false;
        if (result.consumedCooldown) {
          input.lastFiredAt = now;
        }

        if (this.getActiveAttackCount(room) >= MAX_PROJECTILES_PER_ROOM) {
          return;
        }
      }
    },
    spawnAttackForPlayer(
      room: RoomState,
      player: PlayerSnapshot,
      aim: Vec2,
      input: RoomState["playerInputs"][string],
      now: number
    ): AttackSpawnResult {
      const classType = getPlayerClass(player);

      if (classType === "laser-gunner") {
        return this.spawnLaserAttack(room, player, aim, now);
      }

      if (classType === "grenadier") {
        return this.spawnGrenadeAttack(room, player, input, now);
      }

      return this.spawnBulletAttack(room, player, aim);
    },
    spawnBulletAttack(room: RoomState, player: PlayerSnapshot, aim: Vec2): AttackSpawnResult {
      const projectileOptions = this.getProjectileOptions(player.ability);
      const projectile = this.createProjectile(
        player.id,
        player.x + aim.x * (PLAYER_RADIUS + projectileOptions.radius + 2),
        player.y + aim.y * (PLAYER_RADIUS + projectileOptions.radius + 2),
        aim.x * PROJECTILE_SPEED,
        aim.y * PROJECTILE_SPEED,
        projectileOptions
      );

      if (room.walls.some((wall) => projectileHitsWall(projectile, wall))) {
        return { consumedCooldown: true };
      }

      room.activeProjectiles[projectile.id] = projectile;
      return { consumedCooldown: true };
    },
    spawnLaserAttack(room: RoomState, player: PlayerSnapshot, aim: Vec2, now: number): AttackSpawnResult {
      const radius = this.getLaserRadius(player.ability);
      const origin = {
        x: player.x + aim.x * (PLAYER_RADIUS + radius + 2),
        y: player.y + aim.y * (PLAYER_RADIUS + radius + 2)
      };
      const path = this.buildLaserPath(room, origin, aim, radius, player.ability === "ricochet");
      const laser = this.createLaser(player.id, path, radius, this.getModifierEffect(player.ability), now);

      room.activeLasers[laser.id] = laser;
      return { consumedCooldown: true };
    },
    spawnGrenadeAttack(
      room: RoomState,
      player: PlayerSnapshot,
      input: RoomState["playerInputs"][string],
      now: number
    ): AttackSpawnResult {
      const target = { x: input.aimX, y: input.aimY };
      const throwRange = this.getGrenadeThrowRange(player.ability);

      if (
        Math.hypot(target.x - player.x, target.y - player.y) > throwRange ||
        !isNavigablePoint(target.x, target.y, room.walls, PLAYER_RADIUS)
      ) {
        return { consumedCooldown: false };
      }

      const bomb = this.createBomb(
        player.id,
        { x: player.x, y: player.y },
        target,
        this.getGrenadeBlastRadius(player.ability),
        this.getModifierEffect(player.ability),
        now
      );
      room.activeBombs[bomb.id] = bomb;
      return { consumedCooldown: true };
    },
    buildLaserPath(
      room: RoomState,
      origin: Vec2,
      direction: Vec2,
      radius: number,
      canBounce: boolean
    ) {
      const firstHit = findRayWallCollision(origin, direction, radius, room.walls);
      if (!firstHit) {
        return [origin, { x: origin.x + direction.x * 2_000, y: origin.y + direction.y * 2_000 }];
      }

      const firstPoint = {
        x: origin.x + direction.x * firstHit.collision.distance,
        y: origin.y + direction.y * firstHit.collision.distance
      };

      if (!canBounce) {
        return [origin, firstPoint];
      }

      const reflected = this.reflectDirection(direction, firstHit.collision.normalX, firstHit.collision.normalY);
      const bounceOrigin = {
        x: firstPoint.x + firstHit.collision.normalX * LASER_BOUNCE_SEPARATION,
        y: firstPoint.y + firstHit.collision.normalY * LASER_BOUNCE_SEPARATION
      };
      const secondHit = findRayWallCollision(bounceOrigin, reflected, radius, room.walls);

      if (!secondHit) {
        return [origin, firstPoint, { x: bounceOrigin.x + reflected.x * 2_000, y: bounceOrigin.y + reflected.y * 2_000 }];
      }

      return [
        origin,
        firstPoint,
        {
          x: bounceOrigin.x + reflected.x * secondHit.collision.distance,
          y: bounceOrigin.y + reflected.y * secondHit.collision.distance
        }
      ];
    },
    reflectDirection(direction: Vec2, normalX: number, normalY: number) {
      const dot = direction.x * normalX + direction.y * normalY;
      return normalize({
        x: direction.x - 2 * dot * normalX,
        y: direction.y - 2 * dot * normalY
      });
    },
    resolveLasers(room: RoomState, now: number) {
      for (const laser of Object.values(room.activeLasers)) {
        if (!laser.damageApplied && now >= laser.activatesAt) {
          this.applyLaserDamage(room, laser, now);
          laser.damageApplied = true;
        }

        if (laser.expiresAt <= now) {
          delete room.activeLasers[laser.id];
        }

        if (room.phase === "celebration") {
          return;
        }
      }
    },
    applyLaserDamage(room: RoomState, laser: LaserSnapshot, now: number) {
      const hits = new Set<string>();

      for (let index = 1; index < laser.path.length; index += 1) {
        const start = laser.path[index - 1]!;
        const end = laser.path[index]!;

        for (const player of Object.values(room.players)) {
          if (
            player.id === laser.ownerId ||
            !player.alive ||
            player.waitingForNextRound ||
            hits.has(player.id)
          ) {
            continue;
          }

          if (segmentHitsPlayer(start, end, laser.radius, player)) {
            hits.add(player.id);
          }
        }
      }

      for (const victimId of hits) {
        this.applyProjectileHit(room, laser.ownerId, victimId, now);
        if (room.phase === "celebration") {
          return;
        }
      }
    },
    resolveBombs(room: RoomState, now: number) {
      for (const bomb of Object.values(room.activeBombs)) {
        if (bomb.state === "arming" && now >= bomb.explodeAt) {
          const victims = Object.values(room.players)
            .filter((player) => {
              return (
                player.id !== bomb.ownerId &&
                player.alive &&
                !player.waitingForNextRound &&
                Math.hypot(player.x - bomb.target.x, player.y - bomb.target.y) <= PLAYER_RADIUS + bomb.blastRadius
              );
            })
            .map((player) => player.id);

          for (const victimId of victims) {
            this.applyProjectileHit(room, bomb.ownerId, victimId, now);
            if (room.phase === "celebration") {
              return;
            }
          }

          bomb.state = "exploding";
          bomb.explosionEndsAt = now + GRENADE_EXPLOSION_VISUAL_MS;
        }

        if (bomb.state === "exploding" && bomb.explosionEndsAt !== null && bomb.explosionEndsAt <= now) {
          delete room.activeBombs[bomb.id];
        }
      }
    },
    spawnCelebrationProjectiles(room: RoomState, now: number) {
      const winner = room.winnerId ? room.players[room.winnerId] : null;
      if (!winner || !winner.alive || winner.waitingForNextRound) {
        return;
      }

      const input = room.playerInputs[winner.id];
      if (
        !input ||
        (!input.firing && !input.fireQueued) ||
        now - input.lastFiredAt < this.getBulletFireInterval(winner.ability)
      ) {
        return;
      }

      const aim = normalize(
        {
          x: input.aimX - winner.x,
          y: input.aimY - winner.y
        },
        winner.aim
      );

      const projectile = {
        ...this.createProjectile(
          winner.id,
          winner.x + aim.x * (PLAYER_RADIUS + CELEBRATION_PROJECTILE_RADIUS + 6),
          winner.y + aim.y * (PLAYER_RADIUS + CELEBRATION_PROJECTILE_RADIUS + 6),
          aim.x * PROJECTILE_SPEED,
          aim.y * PROJECTILE_SPEED
        ),
        radius: CELEBRATION_PROJECTILE_RADIUS,
        celebrationOnly: true,
        effect: null,
        ricochetsRemaining: 0
      };

      room.activeProjectiles[projectile.id] = projectile;
      input.lastFiredAt = now;
      input.fireQueued = false;
    },
    advanceProjectiles(room: RoomState, deltaSeconds: number, now: number, celebrationMode: boolean) {
      for (const projectile of Object.values(room.activeProjectiles)) {
        const previousX = projectile.x;
        const previousY = projectile.y;
        projectile.x += projectile.vx * deltaSeconds;
        projectile.y += projectile.vy * deltaSeconds;

        const hitWall = this.findEarliestWallCollision(room.walls, projectile, previousX, previousY);
        if (hitWall) {
          if (celebrationMode && projectile.celebrationOnly && hitWall.wall.destructible) {
            room.walls = room.walls.filter((wall) => wall.id !== hitWall.wall.id);
            delete room.activeProjectiles[projectile.id];
            continue;
          }

          if (
            !celebrationMode &&
            this.tryBounceProjectile(room, projectile, previousX, previousY, deltaSeconds, hitWall)
          ) {
            if (!room.activeProjectiles[projectile.id]) {
              continue;
            }
          } else {
            delete room.activeProjectiles[projectile.id];
            continue;
          }
        }

        if (celebrationMode) {
          continue;
        }

        const hitPlayer = Object.values(room.players).find((player) => {
          return (
            player.id !== projectile.ownerId &&
            player.alive &&
            !player.waitingForNextRound &&
            projectileHitsPlayer(projectile, player)
          );
        });

        if (hitPlayer) {
          this.applyProjectileHit(room, projectile.ownerId, hitPlayer.id, now);
          delete room.activeProjectiles[projectile.id];
        }
      }
    },
    findEarliestWallCollision(
      roomWalls: Wall[],
      projectile: ProjectileSnapshot,
      previousX: number,
      previousY: number
    ): WallCollisionCandidate | undefined {
      return roomWalls
        .map((wall) => ({
          wall,
          collision: getProjectileWallCollision(projectile, previousX, previousY, wall),
          overlapping: projectileHitsWall(projectile, wall) || projectilePathHitsWall(projectile, previousX, previousY, wall)
        }))
        .filter((candidate) => candidate.overlapping)
        .sort((left, right) => {
          const leftTime = left.collision?.time ?? 0;
          const rightTime = right.collision?.time ?? 0;
          return leftTime - rightTime;
        })[0];
    },
    tryBounceProjectile(
      room: RoomState,
      projectile: ProjectileSnapshot,
      previousX: number,
      previousY: number,
      deltaSeconds: number,
      hitWall: WallCollisionCandidate
    ) {
      if (projectile.effect !== "ricochet" || projectile.ricochetsRemaining <= 0 || !hitWall.collision) {
        return false;
      }

      const totalDeltaX = projectile.x - previousX;
      const totalDeltaY = projectile.y - previousY;
      const collisionX = previousX + totalDeltaX * hitWall.collision.time;
      const collisionY = previousY + totalDeltaY * hitWall.collision.time;
      const remainingSeconds = deltaSeconds * (1 - hitWall.collision.time);
      const separation = 0.5;

      if (hitWall.collision.normalX !== 0) {
        projectile.vx *= -1;
      }

      if (hitWall.collision.normalY !== 0) {
        projectile.vy *= -1;
      }

      projectile.ricochetsRemaining -= 1;

      const bounceStartX = collisionX + hitWall.collision.normalX * separation;
      const bounceStartY = collisionY + hitWall.collision.normalY * separation;

      projectile.x = bounceStartX + projectile.vx * remainingSeconds;
      projectile.y = bounceStartY + projectile.vy * remainingSeconds;

      const secondWall = this.findEarliestWallCollision(room.walls, projectile, bounceStartX, bounceStartY);
      if (secondWall) {
        delete room.activeProjectiles[projectile.id];
        return true;
      }

      return true;
    },
    getActiveAttackCount(room: RoomState) {
      return (
        Object.keys(room.activeProjectiles).length +
        Object.keys(room.activeLasers).length +
        Object.keys(room.activeBombs).length
      );
    },
    getMoveSpeed(ability: PlayerAbility | null) {
      return ability === "speed" ? PLAYER_MOVE_SPEED * PLAYER_SPEED_BOOST_MULTIPLIER : PLAYER_MOVE_SPEED;
    },
    getBulletFireInterval(ability: PlayerAbility | null) {
      return ability === "rapid-fire"
        ? PROJECTILE_FIRE_INTERVAL_MS * RAPID_FIRE_INTERVAL_MULTIPLIER
        : PROJECTILE_FIRE_INTERVAL_MS;
    },
    getAttackFireInterval(classType: PlayerClass, ability: PlayerAbility | null) {
      const rapidMultiplier = ability === "rapid-fire" ? RAPID_FIRE_INTERVAL_MULTIPLIER : 1;

      if (classType === "laser-gunner") {
        return PROJECTILE_FIRE_INTERVAL_MS * LASER_FIRE_INTERVAL_MULTIPLIER * rapidMultiplier;
      }

      if (classType === "grenadier") {
        return PROJECTILE_FIRE_INTERVAL_MS * GRENADE_FIRE_INTERVAL_MULTIPLIER * rapidMultiplier;
      }

      return PROJECTILE_FIRE_INTERVAL_MS * rapidMultiplier;
    },
    getProjectileOptions(ability: PlayerAbility | null) {
      if (ability === "heavy-shot") {
        return {
          radius: HEAVY_PROJECTILE_RADIUS,
          effect: "heavy-shot" as const,
          ricochetsRemaining: 0
        };
      }

      if (ability === "ricochet") {
        return {
          radius: PROJECTILE_RADIUS,
          effect: "ricochet" as const,
          ricochetsRemaining: RICOCHET_BOUNCES
        };
      }

      return {
        radius: PROJECTILE_RADIUS,
        effect: null,
        ricochetsRemaining: 0
      };
    },
    getLaserRadius(ability: PlayerAbility | null) {
      return ability === "heavy-shot" ? LASER_RADIUS * 2 : LASER_RADIUS;
    },
    getGrenadeBlastRadius(ability: PlayerAbility | null) {
      return ability === "heavy-shot" ? GRENADE_BLAST_RADIUS * 2 : GRENADE_BLAST_RADIUS;
    },
    getGrenadeThrowRange(ability: PlayerAbility | null) {
      return ability === "ricochet" ? GRENADE_THROW_RANGE * 2 : GRENADE_THROW_RANGE;
    },
    getModifierEffect(ability: PlayerAbility | null): ProjectileEffect | null {
      if (ability === "heavy-shot" || ability === "ricochet") {
        return ability;
      }

      return null;
    }
  };
}
