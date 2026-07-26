import type {
  ObstacleKind,
  WorldAssetCategory,
  WorldAssetConfig,
  WorldAssetSlotId,
  WorldImageBinding,
} from '../types';

export interface WorldAssetSlotDefinition {
  readonly id: WorldAssetSlotId;
  readonly group: 'fixed' | 'seeded';
  readonly label: string;
  readonly category: WorldAssetCategory;
  readonly tree: boolean;
  readonly collidable: boolean;
  readonly generated: boolean;
  readonly defaultBinding: WorldImageBinding;
}

const binding = (
  sourceId: string,
  sizeMode: WorldImageBinding['sizeMode'],
  displaySize: number,
  anchorY: number,
  canopyCutRatio?: number,
  collider?: WorldImageBinding['collider'],
  densityWeight?: number,
): WorldImageBinding => ({
  sourceId,
  sizeMode,
  displaySize,
  anchorX: 0.5,
  anchorY,
  ...(canopyCutRatio === undefined ? {} : { canopyCutRatio }),
  ...(collider === undefined ? {} : { collider }),
  ...(densityWeight === undefined ? {} : { densityWeight }),
});

export const WORLD_ASSET_SLOT_DEFINITIONS: readonly WorldAssetSlotDefinition[] = [
  { id: 'fixed.tree', group: 'fixed', label: '普通树木', category: 'trees', tree: true, collidable: true, generated: false, defaultBinding: binding('builtin:trees/阔叶树-001', 'height', 148, 1, 0.76, { shape: 'rectangle', width: 34, height: 26 }) },
  { id: 'fixed.ancient-tree', group: 'fixed', label: '北侧古树', category: 'trees', tree: true, collidable: true, generated: false, defaultBinding: binding('builtin:trees/圆冠树-001', 'height', 260, 1, 0.76, { shape: 'rectangle', width: 70, height: 46 }) },
  { id: 'fixed.rock', group: 'fixed', label: '普通岩石', category: 'rocks', tree: false, collidable: true, generated: false, defaultBinding: binding('builtin:rocks/岩石-005', 'width', 64, 0.78, undefined, { shape: 'circle', radius: 28 }) },
  { id: 'fixed.white-rock', group: 'fixed', label: '白色巨石', category: 'rocks', tree: false, collidable: true, generated: false, defaultBinding: binding('builtin:rocks/石头-001', 'width', 118, 0.78, undefined, { shape: 'circle', radius: 50 }) },
  { id: 'fixed.fallen-log', group: 'fixed', label: '倒木', category: 'wood', tree: false, collidable: true, generated: false, defaultBinding: binding('builtin:wood/原木-001', 'width', 112, 0.78, undefined, { shape: 'rectangle', width: 112, height: 27 }) },
  ...(['阔叶树-001', '针叶树-001', '圆冠树-001', '幼树-001'] as const).map((name, index): WorldAssetSlotDefinition => ({
    id: `seeded.tree.${index}` as WorldAssetSlotId,
    group: 'seeded',
    label: `树木变体 ${index + 1}`,
    category: 'trees',
    tree: true,
    collidable: true,
    generated: true,
    defaultBinding: binding(`builtin:trees/${name}`, 'height', 148, 1, 0.76, { shape: 'rectangle', width: 34, height: 26 }, 1),
  })),
  ...(['岩石-005', '岩石-006', '岩石-007', '岩石-008'] as const).map((name, index): WorldAssetSlotDefinition => ({
    id: `seeded.rock.${index}` as WorldAssetSlotId,
    group: 'seeded',
    label: `岩石变体 ${index + 1}`,
    category: 'rocks',
    tree: false,
    collidable: true,
    generated: true,
    defaultBinding: binding(`builtin:rocks/${name}`, 'width', 64, 0.78, undefined, { shape: 'circle', radius: 26 }, 1),
  })),
  ...(['石子-001', '石子-002', '石子-003', '石子-004', '石子-005'] as const).map((name, index): WorldAssetSlotDefinition => ({
    id: `seeded.pebble.${index}` as WorldAssetSlotId,
    group: 'seeded',
    label: `石子变体 ${index + 1}`,
    category: 'rocks',
    tree: false,
    collidable: false,
    generated: true,
    defaultBinding: binding(`builtin:rocks/${name}`, 'height', 12, 0.85, undefined, undefined, 1),
  })),
  { id: 'seeded.log', group: 'seeded', label: '原木', category: 'wood', tree: false, collidable: true, generated: true, defaultBinding: binding('builtin:wood/原木-001', 'width', 112, 0.78, undefined, { shape: 'rectangle', width: 92, height: 26 }, 1) },
  { id: 'seeded.resource.berry-ripe', group: 'seeded', label: '成熟浆果丛', category: 'food', tree: false, collidable: false, generated: false, defaultBinding: binding('builtin:vegetation/浆果灌木-001', 'width', 76, 0.84) },
  { id: 'seeded.resource.berry-empty', group: 'seeded', label: '空浆果丛', category: 'food', tree: false, collidable: false, generated: false, defaultBinding: binding('builtin:vegetation/空浆果灌木-002', 'width', 76, 0.84) },
  { id: 'seeded.decoration.grass', group: 'seeded', label: '草叶', category: 'vegetation', tree: false, collidable: false, generated: true, defaultBinding: binding('builtin:vegetation/草丛-001', 'height', 18, 0.85, undefined, undefined, 1) },
  { id: 'seeded.decoration.bush', group: 'seeded', label: '草丛', category: 'vegetation', tree: false, collidable: false, generated: true, defaultBinding: binding('builtin:vegetation/草丛-001', 'height', 34, 0.85, undefined, undefined, 1) },
  { id: 'seeded.decoration.flower', group: 'seeded', label: '野花', category: 'vegetation', tree: false, collidable: false, generated: true, defaultBinding: binding('builtin:vegetation/野花-001', 'height', 24, 0.85, undefined, undefined, 1) },
  { id: 'seeded.decoration.leaf', group: 'seeded', label: '落叶', category: 'vegetation', tree: false, collidable: false, generated: true, defaultBinding: binding('builtin:vegetation/叶片-001', 'height', 18, 0.85, undefined, undefined, 1) },
  { id: 'seeded.decoration.reed', group: 'seeded', label: '芦苇', category: 'vegetation', tree: false, collidable: false, generated: true, defaultBinding: binding('builtin:vegetation/芦苇-001', 'height', 38, 0.85, undefined, undefined, 1) },
];

export const WORLD_ASSET_SLOT_IDS = WORLD_ASSET_SLOT_DEFINITIONS.map(({ id }) => id);

export const DEFAULT_WORLD_ASSET_CONFIG: WorldAssetConfig = {
  slots: Object.fromEntries(WORLD_ASSET_SLOT_DEFINITIONS.map(({ id, defaultBinding }) => [
    id,
    structuredClone(defaultBinding),
  ])) as Record<WorldAssetSlotId, WorldImageBinding>,
};

export function normalizeWorldAssetConfig(value: unknown): WorldAssetConfig {
  const candidateSlots = value && typeof value === 'object' && 'slots' in value
    ? (value as { slots?: Record<string, Partial<WorldImageBinding>> }).slots
    : undefined;
  return {
    slots: Object.fromEntries(WORLD_ASSET_SLOT_DEFINITIONS.map(({ id, defaultBinding }) => {
      const candidate = candidateSlots?.[id];
      return [id, {
        ...structuredClone(defaultBinding),
        ...(candidate ?? {}),
        ...(candidate?.collider === undefined
          ? {}
          : { collider: structuredClone(candidate.collider) }),
      }];
    })) as Record<WorldAssetSlotId, WorldImageBinding>,
  };
}

export function defaultSlotForObstacle(kind: ObstacleKind): WorldAssetSlotId | undefined {
  switch (kind) {
    case 'tree': return 'fixed.tree';
    case 'ancient-tree': return 'fixed.ancient-tree';
    case 'rock': return 'fixed.rock';
    case 'white-rock': return 'fixed.white-rock';
    case 'fallen-log': return 'fixed.fallen-log';
    case 'water': return undefined;
  }
}

export function getSlotDefinition(id: WorldAssetSlotId): WorldAssetSlotDefinition {
  return WORLD_ASSET_SLOT_DEFINITIONS.find((slot) => slot.id === id)!;
}
