import Phaser from 'phaser';
import { ASSET_KEYS, ASSET_URLS, WILDLIFE_ASSET_KEYS, WILDLIFE_ASSET_URLS } from '../../game/assets/manifest';
import type { ResolvedWorldAssets } from '../../game/assets/worldAssetLibrary';

export class BootScene extends Phaser.Scene {
  static readonly KEY = 'boot';

  constructor(private readonly worldAssets: ResolvedWorldAssets) {
    super(BootScene.KEY);
  }

  preload(): void {
    this.load.image(ASSET_KEYS.playerFox, ASSET_URLS.playerFox);
    for (const species of Object.keys(WILDLIFE_ASSET_KEYS) as (keyof typeof WILDLIFE_ASSET_KEYS)[]) {
      this.load.image(WILDLIFE_ASSET_KEYS[species], WILDLIFE_ASSET_URLS[species]);
    }
    for (const [key, url] of this.worldAssets.textureEntries) {
      this.load.image(key, url);
    }
  }

  create(): void {
    this.game.events.emit('assets-ready');
    this.scene.stop();
  }
}
