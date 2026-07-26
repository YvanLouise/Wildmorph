export interface CameraViewport {
  readonly width: number;
  readonly height: number;
}

export interface CameraWorldSize {
  readonly width: number;
  readonly height: number;
}

export interface CameraViewMetrics {
  readonly zoom: number;
  readonly requestedHalfWidthWorld: number;
  readonly halfWidthWorld: number;
  readonly halfWidthBodyMultiplier: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly constrainedByWorldBounds: boolean;
}

export interface CameraWorldViewBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export function calculateCameraView(
  viewport: CameraViewport,
  playerVisualSize: number,
  halfWidthBodyMultiplier: number,
  worldSize?: CameraWorldSize,
): CameraViewMetrics {
  const width = Math.max(viewport.width, 1);
  const height = Math.max(viewport.height, 1);
  const requestedHalfWidthWorld = playerVisualSize * halfWidthBodyMultiplier;
  const requestedZoom = width / Math.max(requestedHalfWidthWorld * 2, 1);
  const boundsZoom = worldSize
    ? Math.max(width / Math.max(worldSize.width, 1), height / Math.max(worldSize.height, 1))
    : 0;
  const zoom = Math.max(requestedZoom, boundsZoom);
  const worldWidth = width / zoom;
  const worldHeight = height / zoom;
  const halfWidthWorld = worldWidth / 2;

  return {
    zoom,
    requestedHalfWidthWorld,
    halfWidthWorld,
    halfWidthBodyMultiplier: halfWidthWorld / playerVisualSize,
    worldWidth,
    worldHeight,
    constrainedByWorldBounds: boundsZoom > requestedZoom,
  };
}

export function cameraWorldViewBounds(
  centerX: number,
  centerY: number,
  metrics: Pick<CameraViewMetrics, 'worldWidth' | 'worldHeight'>,
): CameraWorldViewBounds {
  return {
    left: centerX - metrics.worldWidth / 2,
    top: centerY - metrics.worldHeight / 2,
    right: centerX + metrics.worldWidth / 2,
    bottom: centerY + metrics.worldHeight / 2,
  };
}

export function maximumStreamedHalfWidth(
  tileSize: number,
  chunkTiles: number,
  loadRadius: number,
): number {
  return tileSize * chunkTiles * loadRadius;
}
