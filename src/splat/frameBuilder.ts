import { projectCovariance, worldCovariance3, type ProjectionParams } from './covariance';
import type { SplatData } from './parser';

export const INSTANCE_STRIDE = 24;

export interface BuiltFrame {
  /** 24 bytes per visible splat, ordered far -> near */
  packed: ArrayBuffer;
  visible: number;
}

/**
 * Project every splat with the EWA Jacobian, cull invalid/off-screen ones,
 * sort by camera-space depth (far splats first for front-to-back alpha) and
 * pack the per-instance vertex attributes.
 */
export function buildFrame(scene: SplatData, params: ProjectionParams): BuiltFrame {
  const count = scene.count;
  const { positions, scales, rotations, colors } = scene;
  const depthScratch = new Float32Array(count);
  const screenXScratch = new Float32Array(count);
  const screenYScratch = new Float32Array(count);
  const covScratch = new Float32Array(count * 3);
  const worldCov = new Float32Array(6);
  const originalIndexScratch = new Int32Array(count);
  let visible = 0;

  for (let i = 0; i < count; i++) {
    worldCovariance3(rotations, scales, i, worldCov);
    const projected = projectCovariance(worldCov, positions, i * 3, params);
    if (!projected.visible) continue;
    depthScratch[visible] = projected.depth;
    screenXScratch[visible] = projected.screenX;
    screenYScratch[visible] = projected.screenY;
    covScratch[visible * 3] = projected.covA;
    covScratch[visible * 3 + 1] = projected.covB;
    covScratch[visible * 3 + 2] = projected.covC;
    originalIndexScratch[visible] = i;
    visible++;
  }

  const order = new Int32Array(visible);
  for (let i = 0; i < visible; i++) order[i] = i;
  order.sort((a, b) => depthScratch[b] - depthScratch[a]);

  const packed = new ArrayBuffer(visible * INSTANCE_STRIDE);
  const out = new DataView(packed);
  const u8 = new Uint8Array(packed);
  for (let k = 0; k < visible; k++) {
    const row = order[k];
    const originalIndex = originalIndexScratch[row];
    const o = k * INSTANCE_STRIDE;
    out.setFloat32(o, screenXScratch[row], true);
    out.setFloat32(o + 4, screenYScratch[row], true);
    out.setFloat32(o + 8, covScratch[row * 3], true);
    out.setFloat32(o + 12, covScratch[row * 3 + 1], true);
    out.setFloat32(o + 16, covScratch[row * 3 + 2], true);
    u8[o + 20] = colors[originalIndex * 4];
    u8[o + 21] = colors[originalIndex * 4 + 1];
    u8[o + 22] = colors[originalIndex * 4 + 2];
    u8[o + 23] = colors[originalIndex * 4 + 3];
  }

  return { packed, visible };
}
