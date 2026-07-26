import type {
  ObstacleDefinition,
  WorldAssetCategory,
  WorldAssetConfig,
  WorldAssetSlotId,
  WorldImageBinding,
} from '../types';
import { DEFAULT_WORLD_ASSET_CONFIG, defaultSlotForObstacle } from './worldAssetConfig';

const builtInModules = import.meta.glob('../../../art/environment/**/*.{png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const WORLD_ASSET_DB_NAME = 'wildmorph-world-assets';
export const WORLD_ASSET_STORE_NAME = 'images';
export const WORLD_ASSET_MAX_BYTES = 8 * 1024 * 1024;
const WORLD_ASSET_DB_VERSION = 1;

export interface WorldAssetRecord {
  readonly id: string;
  readonly name: string;
  readonly category: WorldAssetCategory;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly builtIn: boolean;
  readonly createdAt?: string;
  readonly url: string;
}

export interface StoredWorldAsset {
  readonly id: string;
  readonly name: string;
  readonly category: 'uploaded';
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly createdAt: string;
  readonly blob: Blob;
}

export interface ResolvedWorldAssets {
  readonly slots: Readonly<Record<WorldAssetSlotId, WorldImageBinding>>;
  readonly obstacleOverrides: ReadonlyMap<string, WorldImageBinding>;
  readonly textureEntries: readonly (readonly [string, string])[];
  readonly missingSourceIds: readonly string[];
  dispose(): void;
}

function normalizeBuiltInPath(path: string): string {
  const marker = '/art/environment/';
  const normalized = path.replace(/\\/g, '/');
  const relative = normalized.slice(normalized.indexOf(marker) + marker.length).replace(/\.(png|webp)$/i, '');
  return `builtin:${relative}`;
}

function categoryFromId(id: string): WorldAssetCategory {
  return (id.slice('builtin:'.length).split('/')[0] || 'terrain') as WorldAssetCategory;
}

const BUILT_IN_URLS = new Map(
  Object.entries(builtInModules).map(([path, url]) => [normalizeBuiltInPath(path), url]),
);

export function worldTextureKey(sourceId: string): string {
  return `world-image:${sourceId}`;
}

export function getBuiltInWorldAssetUrl(sourceId: string): string | undefined {
  return BUILT_IN_URLS.get(sourceId);
}

function openDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WORLD_ASSET_DB_NAME, WORLD_ASSET_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(WORLD_ASSET_STORE_NAME)) {
        request.result.createObjectStore(WORLD_ASSET_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本机素材库'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本机素材库操作失败'));
  });
}

export async function listStoredWorldAssets(): Promise<StoredWorldAsset[]> {
  const database = await openDatabase();
  if (!database) return [];
  try {
    return await requestResult(database.transaction(WORLD_ASSET_STORE_NAME).objectStore(WORLD_ASSET_STORE_NAME).getAll()) as StoredWorldAsset[];
  } finally {
    database.close();
  }
}

export async function getStoredWorldAsset(id: string): Promise<StoredWorldAsset | undefined> {
  const database = await openDatabase();
  if (!database) return undefined;
  try {
    return await requestResult(database.transaction(WORLD_ASSET_STORE_NAME).objectStore(WORLD_ASSET_STORE_NAME).get(id)) as StoredWorldAsset | undefined;
  } finally {
    database.close();
  }
}

export async function deleteStoredWorldAsset(id: string): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  try {
    await requestResult(database.transaction(WORLD_ASSET_STORE_NAME, 'readwrite').objectStore(WORLD_ASSET_STORE_NAME).delete(id));
  } finally {
    database.close();
  }
}

function hexadecimal(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function imageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export async function storeUploadedWorldAsset(file: File): Promise<StoredWorldAsset> {
  if (!['image/png', 'image/webp'].includes(file.type)) {
    throw new Error('仅支持 PNG 或 WebP 图片');
  }
  if (file.size > WORLD_ASSET_MAX_BYTES) {
    throw new Error('图片不能超过 8MB');
  }
  const dimensions = await imageDimensions(file).catch(() => {
    throw new Error('无法读取图片内容');
  });
  if (dimensions.width < 16 || dimensions.height < 16 || dimensions.width > 4096 || dimensions.height > 4096) {
    throw new Error('图片宽高必须在 16–4096 像素之间');
  }
  const id = `upload:${hexadecimal(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))}`;
  const record: StoredWorldAsset = {
    id,
    name: file.name,
    category: 'uploaded',
    mimeType: file.type,
    width: dimensions.width,
    height: dimensions.height,
    byteSize: file.size,
    createdAt: new Date().toISOString(),
    blob: file,
  };
  const database = await openDatabase();
  if (!database) throw new Error('当前浏览器不支持本机素材库');
  try {
    await requestResult(database.transaction(WORLD_ASSET_STORE_NAME, 'readwrite').objectStore(WORLD_ASSET_STORE_NAME).put(record));
  } finally {
    database.close();
  }
  return record;
}

async function dimensionsFromUrl(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('无法读取内置图片'));
    image.src = url;
  });
}

export async function loadWorldAssetCatalog(): Promise<{ records: WorldAssetRecord[]; dispose(): void }> {
  const objectUrls: string[] = [];
  const builtIns = await Promise.all([...BUILT_IN_URLS.entries()].map(async ([id, url]) => {
    const dimensions = await dimensionsFromUrl(url);
    return {
      id,
      name: id.split('/').at(-1) ?? id,
      category: categoryFromId(id),
      mimeType: url.toLowerCase().includes('.webp') ? 'image/webp' : 'image/png',
      width: dimensions.width,
      height: dimensions.height,
      byteSize: 0,
      builtIn: true,
      url,
    } satisfies WorldAssetRecord;
  }));
  const uploads = (await listStoredWorldAssets()).map((asset): WorldAssetRecord => {
    const url = URL.createObjectURL(asset.blob);
    objectUrls.push(url);
    return { ...asset, builtIn: false, url };
  });
  return {
    records: [...builtIns, ...uploads].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, 'zh-CN')),
    dispose: () => objectUrls.forEach((url) => URL.revokeObjectURL(url)),
  };
}

export function referencedWorldAssetIds(configs: readonly { readonly worldAssets: WorldAssetConfig; readonly world: { readonly obstacles: readonly ObstacleDefinition[] } }[]): Map<string, string[]> {
  const references = new Map<string, string[]>();
  const add = (id: string, location: string) => references.set(id, [...(references.get(id) ?? []), location]);
  configs.forEach((config, configIndex) => {
    Object.entries(config.worldAssets.slots).forEach(([slot, value]) => add(value.sourceId, `预设 ${configIndex + 1} · ${slot}`));
    config.world.obstacles.forEach((obstacle) => {
      if (obstacle.assetOverride) add(obstacle.assetOverride.sourceId, `预设 ${configIndex + 1} · ${obstacle.id}`);
    });
  });
  return references;
}

export async function resolveWorldAssets(
  worldAssets: WorldAssetConfig,
  obstacles: readonly ObstacleDefinition[],
  includeUploads: boolean,
): Promise<ResolvedWorldAssets> {
  const uploads = includeUploads ? new Map((await listStoredWorldAssets()).map((asset) => [asset.id, asset])) : new Map<string, StoredWorldAsset>();
  const objectUrls = new Map<string, string>();
  const textureUrls = new Map<string, string>();
  const missing = new Set<string>();

  const sourceUrl = (sourceId: string): string | undefined => {
    const builtIn = getBuiltInWorldAssetUrl(sourceId);
    if (builtIn) return builtIn;
    const upload = uploads.get(sourceId);
    if (!upload) return undefined;
    let url = objectUrls.get(sourceId);
    if (!url) {
      url = URL.createObjectURL(upload.blob);
      objectUrls.set(sourceId, url);
    }
    return url;
  };
  const resolveBinding = (candidate: WorldImageBinding, fallback: WorldImageBinding): WorldImageBinding => {
    const url = sourceUrl(candidate.sourceId);
    const sourceId = url ? candidate.sourceId : fallback.sourceId;
    if (!url) missing.add(candidate.sourceId);
    const actualUrl = url ?? getBuiltInWorldAssetUrl(fallback.sourceId)!;
    textureUrls.set(worldTextureKey(sourceId), actualUrl);
    return {
      ...fallback,
      ...candidate,
      sourceId,
      ...(candidate.collider ?? fallback.collider
        ? { collider: structuredClone(candidate.collider ?? fallback.collider!) }
        : {}),
    };
  };

  const slots = Object.fromEntries(Object.entries(worldAssets.slots).map(([id, candidate]) => {
    const slotId = id as WorldAssetSlotId;
    return [slotId, resolveBinding(candidate, DEFAULT_WORLD_ASSET_CONFIG.slots[slotId])];
  })) as Record<WorldAssetSlotId, WorldImageBinding>;
  const obstacleOverrides = new Map<string, WorldImageBinding>();
  obstacles.forEach((obstacle) => {
    if (!obstacle.assetOverride) return;
    const slot = defaultSlotForObstacle(obstacle.kind);
    if (!slot) return;
    obstacleOverrides.set(obstacle.id, resolveBinding(obstacle.assetOverride, slots[slot]));
  });
  return {
    slots,
    obstacleOverrides,
    textureEntries: [...textureUrls.entries()],
    missingSourceIds: [...missing],
    dispose: () => objectUrls.forEach((url) => URL.revokeObjectURL(url)),
  };
}
