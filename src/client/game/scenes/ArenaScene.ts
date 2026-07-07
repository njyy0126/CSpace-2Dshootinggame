import Phaser from "phaser";
import {
  ARENA_MAP,
  GRENADE_BLAST_RADIUS,
  GRENADE_THROW_RANGE,
  PLAYER_RADIUS,
  SERVER_TICK_MS
} from "../../../shared/constants";
import { getPlayerClass } from "../../../shared/playerClass";
import type {
  BombSnapshot,
  LaserSnapshot,
  PickupSnapshot,
  PlayerAbility,
  ProjectileSnapshot,
  RoomSnapshot,
  Wall
} from "../../../shared/types";
import { getClientSocket } from "../../net/clientSocket";
import { getClientState } from "../../state/clientState";

const PLAYER_DISPLAY_SIZE = 33;
const PLAYER_LABEL_OFFSET = 28;
const PLAYER_SHIELD_RADIUS = 18;
const PLAYER_ABILITY_RING_RADIUS = 22;
const PLAYER_AIM_ROTATION_OFFSET = Phaser.Math.DegToRad(-36);
const GRENADE_AIM_ASSIST_DEPTH = 12;
const GRENADE_TARGET_MARKER_RADIUS = 10;

function getAbilityTint(ability: PlayerAbility | null) {
  if (ability === "ricochet") {
    return 0x22c55e;
  }

  if (ability === "speed") {
    return 0xef4444;
  }

  if (ability === "heavy-shot") {
    return 0x38bdf8;
  }

  if (ability === "rapid-fire") {
    return 0xa855f7;
  }

  return 0xf8fafc;
}

function getPickupTint(type: PickupSnapshot["type"]) {
  return getAbilityTint(type);
}

function getProjectileTint(projectile: ProjectileSnapshot) {
  if (projectile.celebrationOnly) {
    return 0xf97316;
  }

  if (projectile.effect) {
    return getAbilityTint(projectile.effect);
  }

  return 0xfacc15;
}

function getLaserTint(laser: LaserSnapshot) {
  if (laser.effect === "ricochet") {
    return 0x22c55e;
  }

  if (laser.effect === "heavy-shot") {
    return 0x38bdf8;
  }

  return 0x67e8f9;
}

function getBombTint(bomb: BombSnapshot) {
  if (bomb.effect === "ricochet") {
    return 0x22c55e;
  }

  if (bomb.effect === "heavy-shot") {
    return 0x38bdf8;
  }

  return 0xf97316;
}

export class ArenaScene extends Phaser.Scene {
  private players = new Map<string, Phaser.GameObjects.Image>();
  private playerLabels = new Map<string, Phaser.GameObjects.Text>();
  private playerShields = new Map<string, Phaser.GameObjects.Arc>();
  private playerAbilityRings = new Map<string, Phaser.GameObjects.Arc>();
  private bullets = new Map<string, Phaser.GameObjects.Image>();
  private lasers = new Map<string, Phaser.GameObjects.Graphics>();
  private bombs = new Map<string, Phaser.GameObjects.Graphics>();
  private pickupGlows = new Map<string, Phaser.GameObjects.Image>();
  private pickupCores = new Map<string, Phaser.GameObjects.Image>();
  private walls = new Map<string, Phaser.GameObjects.Image>();
  private grenadierRangeRing: Phaser.GameObjects.Graphics | null = null;
  private grenadierTargetMarker: Phaser.GameObjects.Graphics | null = null;
  private isPointerFiring = false;
  private fireLatchUntil = 0;
  private lastPointerWorld: { x: number; y: number } | null = null;
  private nativePointerTarget: HTMLElement | null = null;
  private keys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super("arena");
  }

  create() {
    this.cameras.main.setBounds(0, 0, ARENA_MAP.width, ARENA_MAP.height);
    this.cameras.main.setBackgroundColor("#08111f");
    this.keys = this.input.keyboard!.addKeys("W,A,S,D") as typeof this.keys;
    this.bindNativePointerInput();

    this.input.on("pointerdown", () => {
      this.isPointerFiring = true;
      this.fireLatchUntil = Date.now() + SERVER_TICK_MS * 2;
      this.sendCurrentInput(true);
    });

    this.input.on("pointerup", () => {
      this.isPointerFiring = false;
      this.sendCurrentInput(this.shouldSendFiring());
    });

    this.input.on("gameout", () => {
      this.isPointerFiring = false;
      this.sendCurrentInput(this.shouldSendFiring());
    });

    this.time.addEvent({
      delay: SERVER_TICK_MS,
      loop: true,
      callback: () => {
        this.sendCurrentInput(this.shouldSendFiring());
      }
    });
  }

  private handleNativePointerDown = (event: PointerEvent | MouseEvent) => {
    if (event.button !== 0) {
      return;
    }

    this.updateAimFromNativePointer(event);
    this.isPointerFiring = true;
    this.fireLatchUntil = Date.now() + SERVER_TICK_MS * 2;
    this.sendCurrentInput(true);
  };

  private handleNativePointerMove = (event: PointerEvent | MouseEvent) => {
    this.updateAimFromNativePointer(event);
  };

  private handleNativePointerUp = (event: PointerEvent | MouseEvent) => {
    this.updateAimFromNativePointer(event);
    this.isPointerFiring = false;
    this.sendCurrentInput(this.shouldSendFiring());
  };

  update() {
    const room = getClientState().room;
    if (!room || room.phase === "lobby") {
      this.clearSceneObjects();
      return;
    }

    this.syncWalls(room.walls);
    this.syncPlayers(room);
    this.syncPickups(Object.values(room.activePickups));
    this.syncProjectiles(Object.values(room.activeProjectiles));
    this.syncLasers(Object.values(room.activeLasers ?? {}));
    this.syncBombs(Object.values(room.activeBombs ?? {}));
    this.syncGrenadierAimAssist(room);
  }

  private bindNativePointerInput() {
    this.nativePointerTarget = this.game.canvas.closest(".game-root") ?? this.game.canvas.parentElement ?? this.game.canvas;
    this.nativePointerTarget.addEventListener("pointerdown", this.handleNativePointerDown);
    this.nativePointerTarget.addEventListener("pointermove", this.handleNativePointerMove);
    this.nativePointerTarget.addEventListener("pointerup", this.handleNativePointerUp);
    this.nativePointerTarget.addEventListener("pointerleave", this.handleNativePointerUp);
    this.nativePointerTarget.addEventListener("pointercancel", this.handleNativePointerUp);
    this.nativePointerTarget.addEventListener("mousedown", this.handleNativePointerDown);
    this.nativePointerTarget.addEventListener("mousemove", this.handleNativePointerMove);
    this.nativePointerTarget.addEventListener("mouseup", this.handleNativePointerUp);
    this.nativePointerTarget.addEventListener("mouseleave", this.handleNativePointerUp);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.nativePointerTarget?.removeEventListener("pointerdown", this.handleNativePointerDown);
      this.nativePointerTarget?.removeEventListener("pointermove", this.handleNativePointerMove);
      this.nativePointerTarget?.removeEventListener("pointerup", this.handleNativePointerUp);
      this.nativePointerTarget?.removeEventListener("pointerleave", this.handleNativePointerUp);
      this.nativePointerTarget?.removeEventListener("pointercancel", this.handleNativePointerUp);
      this.nativePointerTarget?.removeEventListener("mousedown", this.handleNativePointerDown);
      this.nativePointerTarget?.removeEventListener("mousemove", this.handleNativePointerMove);
      this.nativePointerTarget?.removeEventListener("mouseup", this.handleNativePointerUp);
      this.nativePointerTarget?.removeEventListener("mouseleave", this.handleNativePointerUp);
      this.nativePointerTarget = null;
    });
  }

  private updateAimFromNativePointer(event: PointerEvent | MouseEvent) {
    const rect = this.game.canvas.getBoundingClientRect();
    const x = Phaser.Math.Clamp((event.clientX - rect.left) / rect.width, 0, 1) * ARENA_MAP.width;
    const y = Phaser.Math.Clamp((event.clientY - rect.top) / rect.height, 0, 1) * ARENA_MAP.height;
    this.lastPointerWorld = { x, y };
  }

  private syncWalls(walls: Wall[]) {
    const nextIds = new Set(walls.map((wall) => wall.id));

    for (const wall of walls) {
      let image = this.walls.get(wall.id);
      if (!image) {
        image = this.add.image(wall.x + wall.width / 2, wall.y + wall.height / 2, "wall");
        image.setOrigin(0.5);
        this.walls.set(wall.id, image);
      }

      image
        .setPosition(wall.x + wall.width / 2, wall.y + wall.height / 2)
        .setDisplaySize(wall.width, wall.height)
        .setTint(wall.kind === "boundary" ? 0x334155 : 0x64748b);
    }

    for (const [id, image] of this.walls) {
      if (nextIds.has(id)) {
        continue;
      }

      image.destroy();
      this.walls.delete(id);
    }
  }

  private sendCurrentInput(firing: boolean) {
    const room = getClientState().room;
    const socket = getClientSocket();
    const localPlayerId = getClientState().localPlayerId;
    const localPlayer = room && localPlayerId ? room.players[localPlayerId] : null;
    const debugInputOverride = (window as any).__FPS_DEBUG__?.getInputOverride?.() ?? null;

    if (!room || !socket || !localPlayer) {
      return;
    }

    const pointer = this.input.activePointer;
    const fallbackAimX = localPlayer.x + localPlayer.aim.x * 50;
    const fallbackAimY = localPlayer.y + localPlayer.aim.y * 50;
    socket.sendInput({
      roomCode: room.code,
      moveX: debugInputOverride?.moveX ?? (Number(this.keys.D.isDown) - Number(this.keys.A.isDown)),
      moveY: debugInputOverride?.moveY ?? (Number(this.keys.S.isDown) - Number(this.keys.W.isDown)),
      aimX: debugInputOverride?.aimX ?? (this.lastPointerWorld?.x ?? (pointer.worldX || fallbackAimX)),
      aimY: debugInputOverride?.aimY ?? (this.lastPointerWorld?.y ?? (pointer.worldY || fallbackAimY)),
      firing: debugInputOverride?.firing ?? firing
    });
  }

  private shouldSendFiring() {
    return this.isPointerFiring || Date.now() < this.fireLatchUntil;
  }

  private syncPlayers(room: RoomSnapshot) {
    const nextIds = new Set(Object.keys(room.players));
    const now = Date.now();

    for (const player of Object.values(room.players)) {
      let body = this.players.get(player.id);
      let label = this.playerLabels.get(player.id);
      let shield = this.playerShields.get(player.id);
      let abilityRing = this.playerAbilityRings.get(player.id);

      if (!body) {
        body = this.add.image(player.x, player.y, "player");
        body.setDisplaySize(PLAYER_DISPLAY_SIZE, PLAYER_DISPLAY_SIZE);
        this.players.set(player.id, body);
      }

      if (!label) {
        label = this.add.text(player.x, player.y - PLAYER_LABEL_OFFSET, player.nickname, {
          fontFamily: "Aptos, Segoe UI, sans-serif",
          fontSize: "12px",
          color: "#e2e8f0"
        });
        label.setOrigin(0.5, 1);
        this.playerLabels.set(player.id, label);
      }

      if (!shield) {
        shield = this.add.circle(player.x, player.y, PLAYER_SHIELD_RADIUS);
        shield.setStrokeStyle(2, 0xfacc15, 0.85);
        shield.setFillStyle(0x000000, 0);
        this.playerShields.set(player.id, shield);
      }

      if (!abilityRing) {
        abilityRing = this.add.circle(player.x, player.y, PLAYER_ABILITY_RING_RADIUS);
        abilityRing.setFillStyle(0x000000, 0);
        this.playerAbilityRings.set(player.id, abilityRing);
      }

      body.setTint(Phaser.Display.Color.HexStringToColor(player.color).color);
      body.setAlpha(player.alive ? 1 : 0.3);
      const winnerScale = room.winnerId === player.id ? 1.12 : 1;
      const aimAngle = Math.atan2(player.aim.y, player.aim.x);
      body.setDisplaySize(PLAYER_DISPLAY_SIZE * winnerScale, PLAYER_DISPLAY_SIZE * winnerScale);
      body.setRotation(aimAngle + PLAYER_AIM_ROTATION_OFFSET);
      body.x = Phaser.Math.Linear(body.x, player.x, 0.35);
      body.y = Phaser.Math.Linear(body.y, player.y, 0.35);

      label.setPosition(body.x, body.y - PLAYER_LABEL_OFFSET);
      label.setAlpha(player.alive ? 1 : 0.45);
      label.setColor(room.winnerId === player.id ? "#f97316" : "#e2e8f0");

      shield.setPosition(body.x, body.y);
      shield.setVisible(player.invulnerableUntil > now && player.alive);

      abilityRing.setPosition(body.x, body.y);
      abilityRing.setVisible(Boolean(player.ability) && player.alive);
      if (player.ability) {
        abilityRing.setStrokeStyle(2.5, getAbilityTint(player.ability), 0.92);
      }
    }

    for (const [id, body] of this.players) {
      if (nextIds.has(id)) {
        continue;
      }

      body.destroy();
      this.players.delete(id);
      this.playerLabels.get(id)?.destroy();
      this.playerLabels.delete(id);
      this.playerShields.get(id)?.destroy();
      this.playerShields.delete(id);
      this.playerAbilityRings.get(id)?.destroy();
      this.playerAbilityRings.delete(id);
    }
  }

  private syncPickups(pickups: PickupSnapshot[]) {
    const nextIds = new Set(pickups.map((pickup) => pickup.id));

    for (const pickup of pickups) {
      let glow = this.pickupGlows.get(pickup.id);
      let core = this.pickupCores.get(pickup.id);

      if (!glow) {
        glow = this.add.image(pickup.x, pickup.y, "pickup-glow");
        glow.setBlendMode(Phaser.BlendModes.ADD);
        this.pickupGlows.set(pickup.id, glow);
      }

      if (!core) {
        core = this.add.image(pickup.x, pickup.y, "pickup-core");
        this.pickupCores.set(pickup.id, core);
      }

      const tint = getPickupTint(pickup.type);
      const pulse = 1 + Math.sin(this.time.now / 180) * 0.08;
      glow
        .setPosition(pickup.x, pickup.y)
        .setDisplaySize(pickup.radius * 3, pickup.radius * 3)
        .setScale(pulse)
        .setAlpha(0.9)
        .setTint(tint);
      core
        .setPosition(pickup.x, pickup.y)
        .setDisplaySize(pickup.radius * 1.75, pickup.radius * 1.75)
        .setScale(pulse)
        .setTint(tint);
    }

    for (const [id, glow] of this.pickupGlows) {
      if (nextIds.has(id)) {
        continue;
      }

      glow.destroy();
      this.pickupGlows.delete(id);
      this.pickupCores.get(id)?.destroy();
      this.pickupCores.delete(id);
    }
  }

  private syncProjectiles(projectiles: ProjectileSnapshot[]) {
    const nextIds = new Set(projectiles.map((projectile) => projectile.id));

    for (const projectile of projectiles) {
      let bullet = this.bullets.get(projectile.id);
      if (!bullet) {
        bullet = this.add.image(projectile.x, projectile.y, "bullet");
        this.bullets.set(projectile.id, bullet);
      }

      bullet
        .setDisplaySize(projectile.radius * 2, projectile.radius * 2)
        .setTint(getProjectileTint(projectile))
        .setAlpha(projectile.effect ? 0.96 : 0.9);
      bullet.x = Phaser.Math.Linear(bullet.x, projectile.x, 0.6);
      bullet.y = Phaser.Math.Linear(bullet.y, projectile.y, 0.6);
    }

    for (const [id, bullet] of this.bullets) {
      if (nextIds.has(id)) {
        continue;
      }

      bullet.destroy();
      this.bullets.delete(id);
    }
  }

  private syncLasers(lasers: LaserSnapshot[]) {
    const nextIds = new Set(lasers.map((laser) => laser.id));
    const now = Date.now();

    for (const laser of lasers) {
      let graphic = this.lasers.get(laser.id);
      if (!graphic) {
        graphic = this.add.graphics();
        graphic.setBlendMode(Phaser.BlendModes.ADD);
        this.lasers.set(laser.id, graphic);
      }

      const tint = getLaserTint(laser);
      const isActive = now >= laser.activatesAt;
      const laserTelegraphAlpha = isActive ? 0.36 : 0.58;
      const outerWidth = laser.radius * (isActive ? 6.4 : 8.4);
      const coreWidth = laser.radius * (isActive ? 3.2 : 2.2);
      const startPoint = laser.path[0]!;
      const endPoint = laser.path[laser.path.length - 1]!;

      graphic.clear();
      graphic.lineStyle(outerWidth, tint, laserTelegraphAlpha);
      this.strokeLaserPath(graphic, laser.path);
      graphic.lineStyle(laser.radius * (isActive ? 4.2 : 3.4), 0xb6f5ff, isActive ? 0.72 : 0.32);
      this.strokeLaserPath(graphic, laser.path);
      graphic.lineStyle(coreWidth, 0xf8fafc, isActive ? 1 : 0.82);
      this.strokeLaserPath(graphic, laser.path);
      graphic.fillStyle(tint, isActive ? 0.4 : 0.24);
      graphic.fillCircle(startPoint.x, startPoint.y, outerWidth * 0.28);
      graphic.fillCircle(endPoint.x, endPoint.y, outerWidth * 0.2);
      graphic.fillStyle(0xf8fafc, isActive ? 0.84 : 0.56);
      graphic.fillCircle(startPoint.x, startPoint.y, coreWidth * 0.46);
      graphic.fillCircle(endPoint.x, endPoint.y, coreWidth * 0.36);
    }

    for (const [id, graphic] of this.lasers) {
      if (nextIds.has(id)) {
        continue;
      }

      graphic.destroy();
      this.lasers.delete(id);
    }
  }

  private syncBombs(bombs: BombSnapshot[]) {
    const nextIds = new Set(bombs.map((bomb) => bomb.id));

    for (const bomb of bombs) {
      let graphic = this.bombs.get(bomb.id);
      if (!graphic) {
        graphic = this.add.graphics();
        this.bombs.set(bomb.id, graphic);
      }

      const tint = getBombTint(bomb);
      const pulse = 1 + Math.sin(this.time.now / 130) * 0.08;
      graphic.clear();

      if (bomb.state === "exploding") {
        graphic.fillStyle(tint, 0.16);
        graphic.fillCircle(bomb.target.x, bomb.target.y, bomb.blastRadius);
        graphic.lineStyle(3, tint, 0.92);
        graphic.strokeCircle(bomb.target.x, bomb.target.y, bomb.blastRadius);
        continue;
      }

      graphic.fillStyle(tint, 0.88);
      graphic.fillCircle(bomb.target.x, bomb.target.y, 8 * pulse);
      graphic.lineStyle(2.5, tint, 0.5);
      graphic.strokeCircle(bomb.target.x, bomb.target.y, bomb.blastRadius);
    }

    for (const [id, graphic] of this.bombs) {
      if (nextIds.has(id)) {
        continue;
      }

      graphic.destroy();
      this.bombs.delete(id);
    }
  }

  private strokeLaserPath(graphic: Phaser.GameObjects.Graphics, path: LaserSnapshot["path"]) {
    for (let index = 1; index < path.length; index += 1) {
      const start = path[index - 1]!;
      const end = path[index]!;
      graphic.lineBetween(start.x, start.y, end.x, end.y);
    }
  }

  private syncGrenadierAimAssist(room: RoomSnapshot) {
    const localPlayerId = getClientState().localPlayerId;
    const localPlayer = localPlayerId ? room.players[localPlayerId] : null;

    if (
      !localPlayer ||
      !localPlayer.alive ||
      localPlayer.waitingForNextRound ||
      room.phase !== "playing" ||
      getPlayerClass(localPlayer) !== "grenadier"
    ) {
      this.hideGrenadierAimAssist();
      return;
    }

    const throwRange = this.getGrenadeThrowRange(localPlayer.ability);
    const blastRadius = this.getGrenadePreviewBlastRadius(localPlayer.ability);
    const target = this.lastPointerWorld ?? {
      x: localPlayer.x + localPlayer.aim.x * throwRange,
      y: localPlayer.y + localPlayer.aim.y * throwRange
    };
    const targetIsLegal = this.isGrenadeTargetLegal(localPlayer, target, room.walls);
    const rangeTint = localPlayer.ability === "ricochet" ? 0x22c55e : 0xf97316;
    const markerTint = targetIsLegal ? rangeTint : 0xef4444;

    if (!this.grenadierRangeRing) {
      this.grenadierRangeRing = this.add.graphics();
      this.grenadierRangeRing.setDepth(GRENADE_AIM_ASSIST_DEPTH);
    }

    if (!this.grenadierTargetMarker) {
      this.grenadierTargetMarker = this.add.graphics();
      this.grenadierTargetMarker.setDepth(GRENADE_AIM_ASSIST_DEPTH + 1);
    }

    this.grenadierRangeRing.clear();
    this.grenadierRangeRing.setVisible(true);
    this.grenadierRangeRing.lineStyle(2, rangeTint, localPlayer.ability === "ricochet" ? 0.52 : 0.34);
    this.grenadierRangeRing.strokeCircle(localPlayer.x, localPlayer.y, throwRange);
    this.grenadierRangeRing.lineStyle(1.5, markerTint, targetIsLegal ? 0.22 : 0.3);
    this.grenadierRangeRing.beginPath();
    this.grenadierRangeRing.moveTo(localPlayer.x, localPlayer.y);
    this.grenadierRangeRing.lineTo(target.x, target.y);
    this.grenadierRangeRing.strokePath();

    this.grenadierTargetMarker.clear();
    this.grenadierTargetMarker.setVisible(true);
    this.grenadierTargetMarker.lineStyle(2.25, markerTint, targetIsLegal ? 0.88 : 0.72);
    this.grenadierTargetMarker.strokeCircle(target.x, target.y, GRENADE_TARGET_MARKER_RADIUS);
    this.grenadierTargetMarker.lineStyle(1.6, markerTint, targetIsLegal ? 0.34 : 0.28);
    this.grenadierTargetMarker.strokeCircle(target.x, target.y, blastRadius);
    this.grenadierTargetMarker.fillStyle(markerTint, targetIsLegal ? 0.18 : 0.12);
    this.grenadierTargetMarker.fillCircle(target.x, target.y, targetIsLegal ? 4 : 3);
    this.grenadierTargetMarker.lineStyle(2.5, markerTint, targetIsLegal ? 0.86 : 0.7);
    this.grenadierTargetMarker.beginPath();

    if (targetIsLegal) {
      this.grenadierTargetMarker.moveTo(target.x - 7, target.y);
      this.grenadierTargetMarker.lineTo(target.x + 7, target.y);
      this.grenadierTargetMarker.moveTo(target.x, target.y - 7);
      this.grenadierTargetMarker.lineTo(target.x, target.y + 7);
    } else {
      this.grenadierTargetMarker.moveTo(target.x - 7, target.y - 7);
      this.grenadierTargetMarker.lineTo(target.x + 7, target.y + 7);
      this.grenadierTargetMarker.moveTo(target.x - 7, target.y + 7);
      this.grenadierTargetMarker.lineTo(target.x + 7, target.y - 7);
    }

    this.grenadierTargetMarker.strokePath();
  }

  private hideGrenadierAimAssist() {
    this.grenadierRangeRing?.clear();
    this.grenadierRangeRing?.setVisible(false);
    this.grenadierTargetMarker?.clear();
    this.grenadierTargetMarker?.setVisible(false);
  }

  private getGrenadeThrowRange(ability: PlayerAbility | null) {
    return GRENADE_THROW_RANGE * (ability === "ricochet" ? 2 : 1);
  }

  private getGrenadePreviewBlastRadius(ability: PlayerAbility | null) {
    return ability === "heavy-shot" ? GRENADE_BLAST_RADIUS * 2 : GRENADE_BLAST_RADIUS;
  }

  private isGrenadeTargetLegal(
    player: RoomSnapshot["players"][string],
    target: { x: number; y: number },
    walls: Wall[]
  ) {
    const throwRange = this.getGrenadeThrowRange(player.ability);
    return (
      Math.hypot(target.x - player.x, target.y - player.y) <= throwRange &&
      target.x >= PLAYER_RADIUS &&
      target.x <= ARENA_MAP.width - PLAYER_RADIUS &&
      target.y >= PLAYER_RADIUS &&
      target.y <= ARENA_MAP.height - PLAYER_RADIUS &&
      !walls.some((wall) => this.circleHitsWallAt(target.x, target.y, PLAYER_RADIUS, wall))
    );
  }

  private circleHitsWallAt(x: number, y: number, radius: number, wall: Wall) {
    const nearestX = Phaser.Math.Clamp(x, wall.x, wall.x + wall.width);
    const nearestY = Phaser.Math.Clamp(y, wall.y, wall.y + wall.height);
    const distanceX = x - nearestX;
    const distanceY = y - nearestY;

    return distanceX * distanceX + distanceY * distanceY < radius * radius;
  }

  private clearSceneObjects() {
    for (const collection of [
      this.players,
      this.playerLabels,
      this.playerShields,
      this.playerAbilityRings,
      this.bullets,
      this.lasers,
      this.bombs,
      this.pickupGlows,
      this.pickupCores,
      this.walls
    ]) {
      for (const object of collection.values()) {
        object.destroy();
      }

      collection.clear();
    }

    this.grenadierRangeRing?.destroy();
    this.grenadierRangeRing = null;
    this.grenadierTargetMarker?.destroy();
    this.grenadierTargetMarker = null;
  }
}
