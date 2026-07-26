import type {
  ChunkKey,
  GeneratedChunkData,
  GeneratedWildlifeSpawn,
  PointDefinition,
  WildlifeBehaviorState,
  WildlifeBodySize,
  WildlifeEntitySnapshot,
  WildlifeGlobalConfig,
  WildlifeSpeciesId,
  WildlifeTelemetry,
} from '../types';
import { hashText32 } from '../world/seed';
import { NavigationField } from './NavigationField';
import type { BerryTargetAssignments } from '../resources/BerryResourceSystem';
import type { GrassTargetAssignments } from '../resources/GrassResourceSystem';

export interface WildlifeForageAssignments {
  readonly berries: BerryTargetAssignments;
  readonly grass: GrassTargetAssignments;
}

interface MutableWildlifeEntity {
  readonly spawn: GeneratedWildlifeSpawn;
  state: WildlifeBehaviorState;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  facingRadians: number;
  targetId: string | 'player' | null;
  reactionKind: 'threat' | 'prey' | null;
  reactionTargetId: string | 'player' | null;
  reactionDueAt: number;
  active: boolean;
  stateSince: number;
  stateUntil: number;
  cooldownUntil: number;
  nextDecisionAt: number;
  decisionCounter: number;
  wanderTarget?: PointDefinition;
  path: PointDefinition[];
  pathIndex: number;
}

const ZERO_TELEMETRY: WildlifeTelemetry = {
  activeAnimals: 0,
  sleepingAnimals: 0,
  pathSearches: 0,
  lastSimulationMs: 0,
  bySpecies: {},
  byState: {},
};

function unitFromText(value: string): number {
  return hashText32(value) / 0xffffffff;
}

function distance(a: PointDefinition, b: PointDefinition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export const WILDLIFE_MAX_TURN_RADIANS_PER_SECOND = Math.PI * 2;

function turnTowards(current: number, target: number, maximumDelta: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  const next = current + Math.max(-maximumDelta, Math.min(maximumDelta, delta));
  return Math.atan2(Math.sin(next), Math.cos(next));
}

export class WildlifeSystem {
  private readonly entities = new Map<string, MutableWildlifeEntity>();
  private readonly chunkEntities = new Map<ChunkKey, Set<string>>();
  private readonly detachedEntities = new Set<string>();
  private accumulatorMs = 0;
  private simulationTimeMs = 0;
  private pathBudget = 0;
  private pathDeadline = 0;
  private telemetryValue: WildlifeTelemetry = ZERO_TELEMETRY;
  private berryAssignments: BerryTargetAssignments = new Map();
  private grassAssignments: GrassTargetAssignments = new Map();

  constructor(
    private readonly config: WildlifeGlobalConfig,
    private readonly navigation: NavigationField,
    private readonly bodySizes: Readonly<Partial<Record<WildlifeSpeciesId, WildlifeBodySize>>> = {},
    private readonly playerBodySize: WildlifeBodySize = { width: 28, height: 32 },
  ) {}

  mountChunk(data: GeneratedChunkData): void {
    this.navigation.addChunk(data);
    const ids = new Set<string>();
    for (const spawn of data.wildlifeSpawns) {
      ids.add(spawn.id);
      if (this.entities.has(spawn.id)) {
        this.detachedEntities.delete(spawn.id);
        continue;
      }
      const offset = Math.floor(unitFromText(`${spawn.id}:decision`) * this.config.decisionIntervalMs);
      this.entities.set(spawn.id, {
        spawn,
        state: 'idle',
        x: spawn.x,
        y: spawn.y,
        previousX: spawn.x,
        previousY: spawn.y,
        velocityX: 0,
        velocityY: 0,
        facingRadians: Math.PI,
        targetId: null,
        reactionKind: null,
        reactionTargetId: null,
        reactionDueAt: 0,
        active: false,
        stateSince: 0,
        stateUntil: 600 + unitFromText(`${spawn.id}:idle`) * 1000,
        cooldownUntil: 0,
        nextDecisionAt: offset,
        decisionCounter: 0,
        path: [],
        pathIndex: 0,
      });
    }
    this.chunkEntities.set(data.key, ids);
  }

  unmountChunk(key: ChunkKey): void {
    for (const id of this.chunkEntities.get(key) ?? []) {
      const entity = this.entities.get(id);
      if (entity?.active && this.navigation.chunkKeyAt(entity) !== key) {
        this.detachedEntities.add(id);
        continue;
      }
      this.entities.delete(id);
      this.detachedEntities.delete(id);
    }
    this.chunkEntities.delete(key);
    this.navigation.removeChunk(key);
  }

  clear(): void {
    this.entities.clear();
    this.chunkEntities.clear();
    this.detachedEntities.clear();
    this.navigation.clear();
    this.accumulatorMs = 0;
    this.simulationTimeMs = 0;
    this.telemetryValue = ZERO_TELEMETRY;
  }

  update(
    deltaMs: number,
    player: PointDefinition,
    forageAssignments: WildlifeForageAssignments = { berries: new Map(), grass: new Map() },
  ): void {
    this.berryAssignments = forageAssignments.berries;
    this.grassAssignments = forageAssignments.grass;
    this.accumulatorMs = Math.min(this.accumulatorMs + Math.max(0, deltaMs), this.config.simulationStepMs * 4);
    let steps = 0;
    const started = performance.now();
    let pathSearches = 0;
    while (this.accumulatorMs >= this.config.simulationStepMs && steps < 4) {
      this.pathBudget = this.config.pathSearchesPerStep;
      this.pathDeadline = performance.now() + this.config.pathBudgetMs;
      this.step(this.config.simulationStepMs / 1000, player);
      pathSearches += this.config.pathSearchesPerStep - this.pathBudget;
      this.accumulatorMs -= this.config.simulationStepMs;
      this.simulationTimeMs += this.config.simulationStepMs;
      steps += 1;
    }
    this.updateTelemetry(pathSearches, performance.now() - started);
  }

  snapshots(): readonly Readonly<WildlifeEntitySnapshot>[] {
    return [...this.entities.values()]
      .filter((entity) => entity.active)
      .map((entity) => {
        const body = this.snapshotBody(entity);
        return {
        id: entity.spawn.id,
        species: entity.spawn.species,
        state: entity.state,
        groupId: entity.spawn.groupId,
        homeChunkKey: entity.spawn.chunkKey,
        x: entity.x,
        y: entity.y,
        previousX: entity.previousX,
        previousY: entity.previousY,
        velocityX: entity.velocityX,
        velocityY: entity.velocityY,
        facingRadians: entity.facingRadians,
        sizeScale: entity.spawn.sizeScale,
        bodyWidth: body.width,
        bodyHeight: body.height,
        reactionRemainingMs: Math.max(0, entity.reactionDueAt - this.simulationTimeMs),
        targetId: entity.targetId ?? entity.reactionTargetId,
        path: entity.path.slice(entity.pathIndex).map((point) => ({ ...point })),
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  telemetry(): WildlifeTelemetry {
    return structuredClone(this.telemetryValue);
  }

  interpolationAlpha(): number {
    return Math.min(1, this.accumulatorMs / this.config.simulationStepMs);
  }

  private step(deltaSeconds: number, player: PointDefinition): void {
    const candidates = [...this.entities.values()]
      .filter((entity) => distance(entity, player) <= (entity.active ? this.config.sleepRadius : this.config.activationRadius))
      .sort((a, b) => distance(a, player) - distance(b, player) || a.spawn.priority - b.spawn.priority || a.spawn.id.localeCompare(b.spawn.id));
    const activeIds = new Set(candidates.slice(0, this.config.maxActiveAnimals).map(({ spawn }) => spawn.id));
    for (const entity of this.entities.values()) {
      entity.active = activeIds.has(entity.spawn.id);
      if (!entity.active) {
        entity.velocityX = 0;
        entity.velocityY = 0;
      }
    }
    for (const id of this.detachedEntities) {
      if (this.entities.get(id)?.active) continue;
      this.entities.delete(id);
      this.detachedEntities.delete(id);
    }

    const active = candidates.slice(0, this.config.maxActiveAnimals);
    const buckets = this.buildSpatialHash(active);
    for (const entity of active) {
      entity.previousX = entity.x;
      entity.previousY = entity.y;
      if (this.simulationTimeMs >= entity.nextDecisionAt) {
        this.decide(entity, active, player);
        entity.nextDecisionAt = this.simulationTimeMs + this.config.decisionIntervalMs;
        entity.decisionCounter += 1;
      }
    }
    for (const entity of active) this.move(entity, active, buckets, player, deltaSeconds);
  }

  private decide(entity: MutableWildlifeEntity, active: readonly MutableWildlifeEntity[], player: PointDefinition): void {
    const config = this.config.species[entity.spawn.species];
    const threat = this.findThreat(entity, active, player);
    if (threat) {
      const threatDistance = distance(entity, threat.position);
      if (entity.state === 'flee' && threatDistance > config.giveUpRadius) {
        this.transition(entity, 'return', null, 0);
      } else if (entity.state === 'alert' && this.simulationTimeMs >= entity.stateUntil) {
        this.transition(entity, 'flee', threat.id, config.cooldownMs);
      } else if (entity.state !== 'flee' && entity.state !== 'alert') {
        if (config.reactionDelayMs === 0 || this.reactionReady(entity, 'threat', threat.id)) {
          this.transition(entity, 'alert', threat.id, config.alertDurationMs);
        } else {
          this.scheduleReaction(entity, 'threat', threat.id, config.reactionDelayMs);
        }
      } else {
        entity.targetId = threat.id;
      }
      return;
    }
    this.clearReaction(entity, 'threat');

    if (config.role === 'predator' || config.role === 'mesopredator') {
      const target = this.findPrey(entity, active, player);
      if (entity.state === 'chase') {
        const targetPosition = this.targetPosition(entity.targetId, active, player);
        if (!targetPosition || this.simulationTimeMs >= entity.stateUntil || distance(entity.spawn, entity) > config.territoryRadius * 1.35 || distance(entity, targetPosition) > config.giveUpRadius) {
          entity.cooldownUntil = this.simulationTimeMs + config.cooldownMs;
          this.transition(entity, 'rest', null, config.restDurationMs);
        }
        return;
      }
      if ((entity.state === 'alert' || entity.state === 'stalk') && this.simulationTimeMs >= entity.stateUntil && entity.targetId) {
        this.transition(entity, 'chase', entity.targetId, config.chaseDurationMs);
        return;
      }
      if (target && this.simulationTimeMs >= entity.cooldownUntil && entity.state !== 'alert' && entity.state !== 'stalk') {
        if (config.reactionDelayMs === 0 || this.reactionReady(entity, 'prey', target.id)) {
          this.transition(entity, config.role === 'mesopredator' ? 'stalk' : 'alert', target.id, config.alertDurationMs);
        } else {
          this.scheduleReaction(entity, 'prey', target.id, config.reactionDelayMs);
        }
        return;
      }
      if (!target) this.clearReaction(entity, 'prey');
    }

    const berryTarget = config.eatsBerries ? this.berryAssignments.get(entity.spawn.id) : undefined;
    if (berryTarget) {
      this.transition(
        entity,
        distance(entity, berryTarget) <= berryTarget.interactionRadius ? 'eat-berry' : 'seek-berry',
        berryTarget.id,
        this.config.decisionIntervalMs * 2,
      );
      return;
    }
    if (entity.state === 'seek-berry' || entity.state === 'eat-berry') {
      this.transition(entity, 'idle', null, 0);
    }

    const grassTarget = config.eatsGrass ? this.grassAssignments.get(entity.spawn.id) : undefined;
    if (grassTarget) {
      this.transition(
        entity,
        distance(entity, grassTarget) <= grassTarget.interactionRadius ? 'eat-grass' : 'seek-grass',
        grassTarget.id,
        this.config.decisionIntervalMs * 2,
      );
      return;
    }
    if (entity.state === 'seek-grass' || entity.state === 'eat-grass') {
      this.transition(entity, 'idle', null, 0);
    }

    if (entity.state === 'flee') {
      this.transition(entity, 'return', null, 0);
      return;
    }
    if (distance(entity, entity.spawn) > config.territoryRadius) {
      this.transition(entity, 'return', null, 0);
      return;
    }
    if (this.simulationTimeMs < entity.stateUntil && !['return', 'chase'].includes(entity.state)) return;
    const roll = unitFromText(`${entity.spawn.id}:${entity.decisionCounter}`);
    if (roll < 0.22) this.transition(entity, 'rest', null, config.restDurationMs);
    else if (roll < 0.58) this.transition(entity, 'forage', null, 1200 + roll * 1800);
    else this.transition(entity, 'wander', null, 1400 + roll * 2200);
    this.chooseWanderTarget(entity);
  }

  private findThreat(
    entity: MutableWildlifeEntity,
    active: readonly MutableWildlifeEntity[],
    player: PointDefinition,
  ): { id: string | 'player'; position: PointDefinition } | undefined {
    const species = entity.spawn.species;
    const config = this.config.species[species];
    if (entity.state === 'flee' && entity.targetId) {
      const currentThreat = this.targetPosition(entity.targetId, active, player);
      if (currentThreat && distance(entity, currentThreat) <= config.giveUpRadius) {
        return { id: entity.targetId, position: currentThreat };
      }
    }
    const playerThreat = species !== 'tiger';
    const threats = active.filter((candidate) => candidate !== entity && (
      candidate.spawn.species === 'tiger'
      || ((species === 'white-rabbit' || species === 'sika-deer') && candidate.spawn.species === 'red-fox')
    ));
    let nearest = threats
      .map((candidate) => ({ id: candidate.spawn.id, position: candidate as PointDefinition, distance: distance(entity, candidate) }))
      .filter((candidate) => candidate.distance <= config.detectionRadius)
      .sort((a, b) => a.distance - b.distance)[0];
    if (species === 'sika-deer' && !nearest) {
      const alarmed = active.find((candidate) => candidate.spawn.groupId === entity.spawn.groupId && (candidate.state === 'alert' || candidate.state === 'flee') && candidate.targetId);
      const position = alarmed ? this.targetPosition(alarmed.targetId, active, player) : undefined;
      if (alarmed && position && distance(entity, alarmed) <= 240) nearest = { id: alarmed.targetId!, position, distance: distance(entity, position) };
    }
    if (playerThreat) {
      const playerDistance = distance(entity, player);
      if (playerDistance <= config.detectionRadius && (!nearest || playerDistance < nearest.distance)) return { id: 'player', position: player };
    }
    return nearest && { id: nearest.id, position: nearest.position };
  }

  private findPrey(
    entity: MutableWildlifeEntity,
    active: readonly MutableWildlifeEntity[],
    player: PointDefinition,
  ): { id: string | 'player'; position: PointDefinition } | undefined {
    const species = entity.spawn.species;
    const config = this.config.species[species];
    const allowed = species === 'red-fox'
      ? new Set<WildlifeSpeciesId>(['white-rabbit'])
      : new Set<WildlifeSpeciesId>(['sika-deer', 'pig', 'white-rabbit']);
    const targets = active
      .filter((candidate) => candidate !== entity && allowed.has(candidate.spawn.species))
      .map((candidate) => ({ id: candidate.spawn.id, position: candidate as PointDefinition, distance: distance(entity, candidate) }))
      .filter((candidate) => candidate.distance <= config.detectionRadius)
      .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
    if (species === 'tiger' && distance(entity, player) <= config.detectionRadius) {
      targets.push({ id: 'player', position: player, distance: distance(entity, player) });
      targets.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
    }
    return targets[0];
  }

  private transition(entity: MutableWildlifeEntity, state: WildlifeBehaviorState, targetId: string | 'player' | null, durationMs: number): void {
    entity.state = state;
    entity.targetId = targetId;
    entity.stateSince = this.simulationTimeMs;
    entity.stateUntil = this.simulationTimeMs + durationMs;
    entity.path = [];
    entity.pathIndex = 0;
    entity.reactionKind = null;
    entity.reactionTargetId = null;
    entity.reactionDueAt = 0;
    if (state === 'idle' || state === 'rest' || state === 'alert') entity.wanderTarget = undefined;
  }

  private chooseWanderTarget(entity: MutableWildlifeEntity): void {
    const config = this.config.species[entity.spawn.species];
    const angle = unitFromText(`${entity.spawn.id}:${entity.decisionCounter}:angle`) * Math.PI * 2;
    const radius = config.territoryRadius * (0.18 + unitFromText(`${entity.spawn.id}:${entity.decisionCounter}:radius`) * 0.55);
    entity.wanderTarget = {
      x: entity.spawn.homeX + Math.cos(angle) * radius,
      y: entity.spawn.homeY + Math.sin(angle) * radius,
    };
  }

  private move(
    entity: MutableWildlifeEntity,
    active: readonly MutableWildlifeEntity[],
    buckets: ReadonlyMap<string, readonly MutableWildlifeEntity[]>,
    player: PointDefinition,
    deltaSeconds: number,
  ): void {
    const config = this.config.species[entity.spawn.species];
    let target: PointDefinition | undefined;
    let speed = config.walkSpeed;
    if (entity.state === 'flee') {
      const threat = this.targetPosition(entity.targetId, active, player);
      if (threat) {
        const dx = entity.x - threat.x;
        const dy = entity.y - threat.y;
        const length = Math.hypot(dx, dy) || 1;
        target = { x: entity.x + dx / length * 260, y: entity.y + dy / length * 260 };
        speed = config.fleeSpeed;
      }
    } else if (entity.state === 'chase' || entity.state === 'stalk') {
      target = this.targetPosition(entity.targetId, active, player);
      speed = entity.state === 'chase' ? config.chaseSpeed : config.walkSpeed * 0.72;
    } else if (entity.state === 'return') {
      target = { x: entity.spawn.homeX, y: entity.spawn.homeY };
    } else if (entity.state === 'seek-berry') {
      target = this.berryAssignments.get(entity.spawn.id);
    } else if (entity.state === 'seek-grass') {
      target = this.grassAssignments.get(entity.spawn.id);
    } else if (entity.state === 'wander' || entity.state === 'forage') {
      target = entity.wanderTarget;
      if (entity.state === 'forage') speed *= 0.55;
      const leader = active
        .filter((candidate) => candidate.spawn.groupId === entity.spawn.groupId)
        .sort((a, b) => a.spawn.id.localeCompare(b.spawn.id))[0];
      if (leader && leader !== entity && distance(entity, leader) > 104) target = leader;
    }
    if (!target || ['idle', 'rest', 'alert', 'eat-berry', 'eat-grass'].includes(entity.state)) {
      entity.velocityX = 0;
      entity.velocityY = 0;
      return;
    }
    const arrivalDistance = entity.state === 'seek-berry'
      ? this.berryAssignments.get(entity.spawn.id)?.interactionRadius ?? 12
      : entity.state === 'seek-grass'
        ? this.grassAssignments.get(entity.spawn.id)?.interactionRadius ?? 12
        : 12;
    if (distance(entity, target) < arrivalDistance) {
      if (entity.state === 'seek-berry' || entity.state === 'seek-grass') {
        entity.velocityX = 0;
        entity.velocityY = 0;
        return;
      }
      this.transition(entity, entity.state === 'return' ? 'rest' : 'idle', null, config.restDurationMs * 0.6);
      entity.velocityX = 0;
      entity.velocityY = 0;
      return;
    }

    let waypoint = target;
    if (!this.navigation.hasLineOfTravel(entity, target, entity.spawn.species, entity.spawn.sizeScale)) {
      if (entity.pathIndex >= entity.path.length && this.pathBudget > 0 && performance.now() <= this.pathDeadline) {
        entity.path = this.navigation.findPath(entity, target, entity.spawn.species, entity.spawn.sizeScale);
        entity.pathIndex = 0;
        this.pathBudget -= 1;
      }
      waypoint = entity.path[entity.pathIndex] ?? target;
      if (entity.path[entity.pathIndex] && distance(entity, waypoint) < 10) {
        entity.pathIndex += 1;
        waypoint = entity.path[entity.pathIndex] ?? target;
      }
    } else {
      entity.path = [];
      entity.pathIndex = 0;
    }

    let dx = waypoint.x - entity.x;
    let dy = waypoint.y - entity.y;
    for (const neighbor of this.nearby(entity, buckets)) {
      if (neighbor === entity) continue;
      const separation = distance(entity, neighbor);
      const entityBody = this.snapshotBody(entity);
      const neighborBody = this.snapshotBody(neighbor);
      const separationRadius = (
        Math.max(entityBody.width, entityBody.height)
        + Math.max(neighborBody.width, neighborBody.height)
      ) / 2 + 8;
      if (separation <= 0 || separation >= separationRadius) continue;
      dx += (entity.x - neighbor.x) / separation * (separationRadius - separation) * 1.8;
      dy += (entity.y - neighbor.y) / separation * (separationRadius - separation) * 1.8;
    }
    const length = Math.hypot(dx, dy);
    if (length < 0.001) {
      entity.velocityX = 0;
      entity.velocityY = 0;
      return;
    }
    const desiredTravelRadians = Math.atan2(dy, dx);
    const currentTravelRadians = entity.facingRadians + Math.PI / 2;
    const maximumTurn = WILDLIFE_MAX_TURN_RADIANS_PER_SECOND * deltaSeconds;
    const travelRadians = turnTowards(currentTravelRadians, desiredTravelRadians, maximumTurn);
    const velocityX = Math.cos(travelRadians) * speed;
    const velocityY = Math.sin(travelRadians) * speed;
    const desired = { x: entity.x + velocityX * deltaSeconds, y: entity.y + velocityY * deltaSeconds };
    const candidates = [
      desired,
      { x: desired.x, y: entity.y },
      { x: entity.x, y: desired.y },
    ];
    const next = candidates.find((candidate) => (
      this.navigation.isWalkable(candidate, entity.spawn.species, entity.spawn.sizeScale)
      && !this.isOccupied(entity, candidate, active, player)
    ));
    if (!next) {
      entity.velocityX = 0;
      entity.velocityY = 0;
      entity.path = [];
      entity.pathIndex = 0;
      return;
    }
    entity.x = next.x;
    entity.y = next.y;
    entity.velocityX = (next.x - entity.previousX) / deltaSeconds;
    entity.velocityY = (next.y - entity.previousY) / deltaSeconds;
    if (entity.velocityX !== 0 || entity.velocityY !== 0) {
      const actualFacing = Math.atan2(entity.velocityY, entity.velocityX) - Math.PI / 2;
      entity.facingRadians = turnTowards(entity.facingRadians, actualFacing, maximumTurn);
    }
  }

  private scheduleReaction(
    entity: MutableWildlifeEntity,
    kind: 'threat' | 'prey',
    targetId: string | 'player',
    delayMs: number,
  ): void {
    if (entity.reactionKind === kind && entity.reactionTargetId === targetId) return;
    entity.reactionKind = kind;
    entity.reactionTargetId = targetId;
    entity.reactionDueAt = this.simulationTimeMs + delayMs;
  }

  private reactionReady(
    entity: MutableWildlifeEntity,
    kind: 'threat' | 'prey',
    targetId: string | 'player',
  ): boolean {
    return entity.reactionKind === kind
      && entity.reactionTargetId === targetId
      && this.simulationTimeMs >= entity.reactionDueAt;
  }

  private clearReaction(entity: MutableWildlifeEntity, kind: 'threat' | 'prey'): void {
    if (entity.reactionKind !== kind) return;
    entity.reactionKind = null;
    entity.reactionTargetId = null;
    entity.reactionDueAt = 0;
  }

  private snapshotBody(entity: MutableWildlifeEntity): WildlifeBodySize {
    const body = this.bodySizes[entity.spawn.species] ?? { width: 28, height: 32 };
    return {
      width: body.width * entity.spawn.sizeScale,
      height: body.height * entity.spawn.sizeScale,
    };
  }

  private isOccupied(
    entity: MutableWildlifeEntity,
    point: PointDefinition,
    active: readonly MutableWildlifeEntity[],
    player: PointDefinition,
  ): boolean {
    const body = this.snapshotBody(entity);
    if (this.overlaps(point, body, player, this.playerBodySize)) {
      const currentlyOverlapping = this.overlaps(entity, body, player, this.playerBodySize);
      if (!currentlyOverlapping || distance(point, player) <= distance(entity, player)) return true;
    }
    for (const neighbor of active) {
      if (neighbor === entity) continue;
      const neighborBody = this.snapshotBody(neighbor);
      if (!this.overlaps(point, body, neighbor, neighborBody)) continue;
      const currentlyOverlapping = this.overlaps(entity, body, neighbor, neighborBody);
      if (!currentlyOverlapping || distance(point, neighbor) <= distance(entity, neighbor)) return true;
    }
    return false;
  }

  private overlaps(
    a: PointDefinition,
    aBody: WildlifeBodySize,
    b: PointDefinition,
    bBody: WildlifeBodySize,
  ): boolean {
    return Math.abs(a.x - b.x) < (aBody.width + bBody.width) / 2
      && Math.abs(a.y - b.y) < (aBody.height + bBody.height) / 2;
  }

  private targetPosition(
    targetId: string | 'player' | null,
    active: readonly MutableWildlifeEntity[],
    player: PointDefinition,
  ): PointDefinition | undefined {
    if (targetId === 'player') return player;
    if (!targetId) return undefined;
    return active.find(({ spawn }) => spawn.id === targetId);
  }

  private buildSpatialHash(entities: readonly MutableWildlifeEntity[]): Map<string, MutableWildlifeEntity[]> {
    const buckets = new Map<string, MutableWildlifeEntity[]>();
    for (const entity of entities) {
      const key = `${Math.floor(entity.x / 128)},${Math.floor(entity.y / 128)}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(entity);
      buckets.set(key, bucket);
    }
    return buckets;
  }

  private nearby(entity: MutableWildlifeEntity, buckets: ReadonlyMap<string, readonly MutableWildlifeEntity[]>): MutableWildlifeEntity[] {
    const centerX = Math.floor(entity.x / 128);
    const centerY = Math.floor(entity.y / 128);
    const result: MutableWildlifeEntity[] = [];
    for (let y = centerY - 1; y <= centerY + 1; y += 1) {
      for (let x = centerX - 1; x <= centerX + 1; x += 1) result.push(...(buckets.get(`${x},${y}`) ?? []));
    }
    return result;
  }

  private updateTelemetry(pathSearches: number, elapsed: number): void {
    const bySpecies: Partial<Record<WildlifeSpeciesId, number>> = {};
    const byState: Partial<Record<WildlifeBehaviorState, number>> = {};
    let activeAnimals = 0;
    for (const entity of this.entities.values()) {
      if (!entity.active) continue;
      activeAnimals += 1;
      bySpecies[entity.spawn.species] = (bySpecies[entity.spawn.species] ?? 0) + 1;
      byState[entity.state] = (byState[entity.state] ?? 0) + 1;
    }
    this.telemetryValue = {
      activeAnimals,
      sleepingAnimals: this.entities.size - activeAnimals,
      pathSearches,
      lastSimulationMs: elapsed,
      bySpecies,
      byState,
    };
  }
}
