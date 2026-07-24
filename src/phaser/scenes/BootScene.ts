import Phaser from 'phaser';
import { ASSET_KEYS, ASSET_URLS } from '../../game/assets/manifest';

export class BootScene extends Phaser.Scene {
  static readonly KEY = 'boot';

  constructor() {
    super(BootScene.KEY);
  }

  preload(): void {
    this.load.image(ASSET_KEYS.playerFox, ASSET_URLS.playerFox);
  }

  create(): void {
    this.game.events.emit('assets-ready');
    this.scene.stop();
  }
}
