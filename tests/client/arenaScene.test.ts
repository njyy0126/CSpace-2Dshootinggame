import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("arena scene rendering", () => {
  it("does not render persistent player aim lines", () => {
    const source = readFileSync("src/client/game/scenes/ArenaScene.ts", "utf8");

    expect(source).not.toContain("playerAimLines");
    expect(source).not.toContain("add.line");
  });

  it("renders projectiles large enough to read during fast movement", () => {
    const source = readFileSync("src/client/game/scenes/ArenaScene.ts", "utf8");

    expect(source).toContain("projectile.radius * 2");
    expect(source).toContain("getProjectileTint");
  });

  it("keeps the shipped player sprite footprint aligned with the old 28px circle marker", () => {
    const source = readFileSync("src/client/game/scenes/ArenaScene.ts", "utf8");

    expect(source).toContain("const PLAYER_DISPLAY_SIZE = 33;");
    expect(source).toContain("const PLAYER_LABEL_OFFSET = 28;");
    expect(source).toContain("const PLAYER_SHIELD_RADIUS = 18;");
    expect(source).toContain("const winnerScale = room.winnerId === player.id ? 1.12 : 1;");
    expect(source).toContain("body.setDisplaySize(PLAYER_DISPLAY_SIZE * winnerScale, PLAYER_DISPLAY_SIZE * winnerScale)");
    expect(source).toContain("this.add.circle(player.x, player.y, PLAYER_SHIELD_RADIUS)");
    expect(source).not.toContain("body.setScale(");
  });

  it("rotates the player sprite so the gun follows the shared aim direction", () => {
    const source = readFileSync("src/client/game/scenes/ArenaScene.ts", "utf8");

    expect(source).toContain("const PLAYER_AIM_ROTATION_OFFSET");
    expect(source).toContain("const aimAngle = Math.atan2(player.aim.y, player.aim.x);");
    expect(source).toContain("body.setRotation(aimAngle + PLAYER_AIM_ROTATION_OFFSET)");
  });

  it("uses pointer events so mouse clicks are not missed between input ticks", () => {
    const source = readFileSync("src/client/game/scenes/ArenaScene.ts", "utf8");

    expect(source).toContain('this.input.on("pointerdown"');
    expect(source).toContain('this.input.on("pointerup"');
    expect(source).toContain("this.sendCurrentInput(true)");
  });

  it("latches short clicks long enough for the server tick to observe firing", () => {
    const source = readFileSync("src/client/game/scenes/ArenaScene.ts", "utf8");

    expect(source).toContain("fireLatchUntil");
    expect(source).toContain("Date.now() < this.fireLatchUntil");
    expect(source).toContain("SERVER_TICK_MS * 2");
  });

  it("does not rely on Phaser pointer state for the periodic firing sync", () => {
    const source = readFileSync("src/client/game/scenes/ArenaScene.ts", "utf8");

    expect(source).toContain("this.sendCurrentInput(this.shouldSendFiring())");
    expect(source).not.toContain("this.input.activePointer.isDown");
  });

  it("binds native pointer events as a fallback when Phaser misses mouse input", () => {
    const source = readFileSync("src/client/game/scenes/ArenaScene.ts", "utf8");

    expect(source).toContain("bindNativePointerInput");
    expect(source).toContain('closest(".game-root")');
    expect(source).toContain('addEventListener("pointerdown"');
    expect(source).toContain("updateAimFromNativePointer");
  });

  it("also binds native mouse events for browsers that do not emit pointer events", () => {
    const source = readFileSync("src/client/game/scenes/ArenaScene.ts", "utf8");

    expect(source).toContain('addEventListener("mousedown"');
    expect(source).toContain('addEventListener("mouseup"');
    expect(source).toContain('addEventListener("mousemove"');
  });

  it("renders pick-ups with their own sync path and type-specific glow colors", () => {
    const source = readFileSync("src/client/game/scenes/ArenaScene.ts", "utf8");

    expect(source).toContain("syncPickups");
    expect(source).toContain("getPickupTint");
    expect(source).toContain("pickup-glow");
    expect(source).toContain('ability === "rapid-fire"');
    expect(source).toContain("0xa855f7");
  });

  it("renders laser paths with graphics-based sync so delayed beams and ricochets can persist without aim lines", () => {
    const source = readFileSync("src/client/game/scenes/ArenaScene.ts", "utf8");

    expect(source).toContain("syncLasers");
    expect(source).toContain("activeLasers");
    expect(source).toContain("this.add.graphics()");
    expect(source).toContain("laser.path");
  });

  it("renders grenades and explosions from server-driven bomb state instead of pretending they are bullets", () => {
    const source = readFileSync("src/client/game/scenes/ArenaScene.ts", "utf8");

    expect(source).toContain("syncBombs");
    expect(source).toContain("activeBombs");
    expect(source).toContain('bomb.state === "exploding"');
    expect(source).toContain("blastRadius");
  });

  it("renders a grenadier throw range ring and invalid target feedback for local aim assistance", () => {
    const source = readFileSync("src/client/game/scenes/ArenaScene.ts", "utf8");

    expect(source).toContain("syncGrenadierAimAssist");
    expect(source).toContain("grenadierRangeRing");
    expect(source).toContain("grenadierTargetMarker");
    expect(source).toContain("isGrenadeTargetLegal");
  });

  it("renders lasers with layered telegraph strokes so the delayed warning reads more clearly before damage lands", () => {
    const source = readFileSync("src/client/game/scenes/ArenaScene.ts", "utf8");

    expect(source).toContain("laserTelegraphAlpha");
    expect(source).toContain("outerWidth");
    expect(source).toContain("coreWidth");
  });

  it("honors the debug input override so e2e input does not get stomped by the client tick loop", () => {
    const source = readFileSync("src/client/game/scenes/ArenaScene.ts", "utf8");

    expect(source).toContain("__FPS_DEBUG__?.getInputOverride?.()");
    expect(source).toContain("firing: debugInputOverride?.firing ?? firing");
  });

  it("keeps playfield decoration from intercepting mouse clicks", () => {
    const source = readFileSync("src/client/styles.css", "utf8");

    expect(source).toContain(".playfield-shell::before");
    expect(source).toContain("pointer-events: none;");
  });

  it("uses state subscriptions instead of interval-driven lobby redraw loops", () => {
    const source = readFileSync("src/client/app.ts", "utf8");

    expect(source).toContain("subscribeToClientState");
    expect(source).toContain("renderRoomLobbyScreen");
    expect(source).not.toContain("setInterval(render");
    expect(source).not.toContain("window.setInterval(render");
  });
});
