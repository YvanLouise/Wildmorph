import foxUrl from '../../../art/characters/黄狐狸-1.png?url';
import whiteRabbitUrl from '../../../art/characters/白兔-1.png?url';
import sikaDeerUrl from '../../../art/characters/花鹿-1.png?url';
import pigUrl from '../../../art/characters/猪-1.png?url';
import raccoonUrl from '../../../art/characters/浣熊-1.png?url';
import redFoxUrl from '../../../art/characters/红狐-1.png?url';
import tigerUrl from '../../../art/characters/老虎-1.png?url';
import type { WildlifeSpeciesId } from '../types';
import titleScreenUrl from '../../../art/ui/title/蜕野首页ui1.png?url';
import healthIconUrl from '../../../art/ui/icons/生命图标1.png?url';
import foodIconUrl from '../../../art/ui/icons/卡通苹果1.png?url';
import waterIconUrl from '../../../art/ui/icons/水滴图标1.png?url';
import staminaIconUrl from '../../../art/ui/icons/耐力图标1.png?url';
import backgroundMusicUrl from '../../../music/平静-悠然1.ogg?url';
import titleMusicUrl from '../../../music/悠闲-悠然_1.ogg?url';

export const ASSET_KEYS = {
  playerFox: 'character.player-fox',
  wildlifeWhiteRabbit: 'character.wildlife.white-rabbit',
  wildlifeSikaDeer: 'character.wildlife.sika-deer',
  wildlifePig: 'character.wildlife.pig',
  wildlifeRaccoon: 'character.wildlife.raccoon',
  wildlifeRedFox: 'character.wildlife.red-fox',
  wildlifeTiger: 'character.wildlife.tiger',
} as const;

export const ASSET_URLS = {
  playerFox: foxUrl,
  wildlifeWhiteRabbit: whiteRabbitUrl,
  wildlifeSikaDeer: sikaDeerUrl,
  wildlifePig: pigUrl,
  wildlifeRaccoon: raccoonUrl,
  wildlifeRedFox: redFoxUrl,
  wildlifeTiger: tigerUrl,
  titleScreen: titleScreenUrl,
  healthIcon: healthIconUrl,
  foodIcon: foodIconUrl,
  waterIcon: waterIconUrl,
  staminaIcon: staminaIconUrl,
  backgroundMusic: backgroundMusicUrl,
  titleMusic: titleMusicUrl,
} as const;

export const WILDLIFE_ASSET_KEYS: Readonly<Record<WildlifeSpeciesId, string>> = {
  'white-rabbit': ASSET_KEYS.wildlifeWhiteRabbit,
  'sika-deer': ASSET_KEYS.wildlifeSikaDeer,
  pig: ASSET_KEYS.wildlifePig,
  raccoon: ASSET_KEYS.wildlifeRaccoon,
  'red-fox': ASSET_KEYS.wildlifeRedFox,
  tiger: ASSET_KEYS.wildlifeTiger,
};

export const WILDLIFE_ASSET_URLS: Readonly<Record<WildlifeSpeciesId, string>> = {
  'white-rabbit': ASSET_URLS.wildlifeWhiteRabbit,
  'sika-deer': ASSET_URLS.wildlifeSikaDeer,
  pig: ASSET_URLS.wildlifePig,
  raccoon: ASSET_URLS.wildlifeRaccoon,
  'red-fox': ASSET_URLS.wildlifeRedFox,
  tiger: ASSET_URLS.wildlifeTiger,
};
