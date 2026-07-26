import penguinUrl from '../../art/characters/企鹅-1.png?url';
import raccoonUrl from '../../art/characters/浣熊-1.png?url';
import seaTurtleUrl from '../../art/characters/海龟-1.png?url';
import pigUrl from '../../art/characters/猪-1.png?url';
import whiteRabbitUrl from '../../art/characters/白兔-1.png?url';
import redFoxUrl from '../../art/characters/红狐-1.png?url';
import tigerUrl from '../../art/characters/老虎-1.png?url';
import sikaDeerUrl from '../../art/characters/花鹿-1.png?url';
import yellowFoxUrl from '../../art/characters/黄狐狸-1.png?url';
import type { CharacterId } from '../game/config/characterProfiles';

export interface CharacterOpaqueBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CharacterAssetDefinition {
  readonly id: CharacterId;
  readonly sourceName: string;
  readonly url: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

export interface CharacterAssetRecord extends CharacterAssetDefinition {
  readonly opaqueBounds: CharacterOpaqueBounds;
}

export const CHARACTER_ASSET_DEFINITIONS: readonly CharacterAssetDefinition[] = [
  { id: 'penguin', sourceName: '企鹅-1.png', url: penguinUrl, naturalWidth: 406, naturalHeight: 439 },
  { id: 'raccoon', sourceName: '浣熊-1.png', url: raccoonUrl, naturalWidth: 352, naturalHeight: 638 },
  { id: 'sea-turtle', sourceName: '海龟-1.png', url: seaTurtleUrl, naturalWidth: 426, naturalHeight: 473 },
  { id: 'pig', sourceName: '猪-1.png', url: pigUrl, naturalWidth: 406, naturalHeight: 495 },
  { id: 'white-rabbit', sourceName: '白兔-1.png', url: whiteRabbitUrl, naturalWidth: 293, naturalHeight: 492 },
  { id: 'red-fox', sourceName: '红狐-1.png', url: redFoxUrl, naturalWidth: 360, naturalHeight: 537 },
  { id: 'tiger', sourceName: '老虎-1.png', url: tigerUrl, naturalWidth: 344, naturalHeight: 638 },
  { id: 'sika-deer', sourceName: '花鹿-1.png', url: sikaDeerUrl, naturalWidth: 372, naturalHeight: 563 },
  { id: 'yellow-fox', sourceName: '黄狐狸-1.png', url: yellowFoxUrl, naturalWidth: 1254, naturalHeight: 1254 },
];

async function measureOpaqueBounds(definition: CharacterAssetDefinition): Promise<CharacterOpaqueBounds> {
  const image = new Image();
  image.decoding = 'async';
  image.src = definition.url;
  try {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minimumX = canvas.width;
    let minimumY = canvas.height;
    let maximumX = -1;
    let maximumY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] < 16) continue;
        minimumX = Math.min(minimumX, x);
        minimumY = Math.min(minimumY, y);
        maximumX = Math.max(maximumX, x);
        maximumY = Math.max(maximumY, y);
      }
    }
    if (maximumX < minimumX || maximumY < minimumY) throw new Error('No opaque pixels');
    return {
      x: minimumX,
      y: minimumY,
      width: maximumX - minimumX + 1,
      height: maximumY - minimumY + 1,
    };
  } catch {
    return {
      x: 0,
      y: 0,
      width: definition.naturalWidth,
      height: definition.naturalHeight,
    };
  }
}

export async function loadCharacterAssetCatalog(): Promise<readonly CharacterAssetRecord[]> {
  return Promise.all(CHARACTER_ASSET_DEFINITIONS.map(async (definition) => ({
    ...definition,
    opaqueBounds: await measureOpaqueBounds(definition),
  })));
}
