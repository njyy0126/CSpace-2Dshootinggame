import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("boot scene player asset loading", () => {
  it("loads the shipped Arrowhead sprite instead of generating a player circle at runtime", () => {
    const source = readFileSync("src/client/game/scenes/BootScene.ts", "utf8");

    expect(source).toContain("preload()");
    expect(source).toContain('this.load.image(PLAYER_TEXTURE_KEY, PLAYER_SPRITE_PATH);');
    expect(source).toContain('const PLAYER_SPRITE_PATH = "/assets/players/arrowhead-core-cyan.png";');
    expect(source).not.toContain('fillCircle(14, 14, 14)');
    expect(source).toContain('graphics.generateTexture("bullet", 8, 8)');
    expect(source).toContain('graphics.generateTexture("wall", 64, 24)');
  });

  it("ships the selected player sprite in the public asset tree", () => {
    expect(existsSync("public/assets/players/arrowhead-core-cyan.png")).toBe(true);
    expect(existsSync("public/assets/players/arrowhead-brace-amber.png")).toBe(true);
    expect(existsSync("public/assets/players/arrowhead-sprint-magenta.png")).toBe(true);
  });
});
