import Phaser from "phaser";

const PLAYER_TEXTURE_KEY = "player";
const PLAYER_SPRITE_PATH = "/assets/players/arrowhead-core-cyan.png";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    this.load.image(PLAYER_TEXTURE_KEY, PLAYER_SPRITE_PATH);
  }

  create() {
    const graphics = this.add.graphics();

    graphics.clear();
    graphics.fillStyle(0xffffff).fillCircle(4, 4, 4);
    graphics.generateTexture("bullet", 8, 8);

    graphics.clear();
    graphics.fillStyle(0xffffff, 0.28).fillCircle(12, 12, 12);
    graphics.generateTexture("pickup-glow", 24, 24);

    graphics.clear();
    graphics.fillStyle(0xffffff).fillCircle(8, 8, 8);
    graphics.generateTexture("pickup-core", 16, 16);

    graphics.clear();
    graphics.fillStyle(0xffffff).fillRect(0, 0, 64, 24);
    graphics.generateTexture("wall", 64, 24);

    graphics.destroy();
    this.scene.start("arena");
  }
}
