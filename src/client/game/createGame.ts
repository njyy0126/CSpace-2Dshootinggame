import Phaser from "phaser";
import { ARENA_MAP } from "../../shared/constants";
import { BootScene } from "./scenes/BootScene";
import { ArenaScene } from "./scenes/ArenaScene";

export type GameInstance = Phaser.Game;

export function createGame(parent: HTMLElement) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: ARENA_MAP.width,
    height: ARENA_MAP.height,
    backgroundColor: "#08111f",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: ARENA_MAP.width,
      height: ARENA_MAP.height
    },
    scene: [BootScene, ArenaScene]
  });
}

export function destroyGame(game: GameInstance) {
  game.destroy(true);
}
