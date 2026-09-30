export interface SplatBounds {
  center: [number, number, number];
  radius: number;
  min: [number, number, number];
  max: [number, number, number];
}

export interface SplatData {
  count: number;
  /** xyz per splat */
  positions: Float32Array;
  /** positive axis scales per splat */
  scales: Float32Array;
  /** normalized quaternions per splat, layout w,x,y,z */
  rotations: Float32Array;
  /** straight RGBA bytes per splat */
  colors: Uint8Array;
  bounds: SplatBounds;
}

export const SPLAT_STRIDE = 32;

export class SplatParseError extends Error {}

function isFinite3(v: number): boolean {
  return Number.isFinite(v);
}

/**
 * Parse a 32-byte/record .splat buffer.
 *
 * Record layout (little endian):
 *   0..23  Float32 x,y,z, sx,sy,sz
 *   24..27 Uint8  R,G,B,A
 *   28..31 Int8-ish quaternion w,x,y,z -> (b-128)/128, then normalized
 *
 * Throws SplatParseError on truncation, non-finite values, non-positive
 * scales or zero quaternions. The caller keeps the previous scene on error.
 */
export function parseSplat(buffer: ArrayBuffer): SplatData {
  const byteLength = buffer.byteLength;
  if (byteLength === 0) {
    throw new SplatParseError('文件为空，未找到高斯数据');
  }
  if (byteLength % SPLAT_STRIDE !== 0) {
    throw new SplatParseError(
      `文件长度 ${byteLength} 不是 ${SPLAT_STRIDE} 字节的整数倍，数据可能被截断`,
    );
  }

  const count = byteLength / SPLAT_STRIDE;
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new SplatParseError('无法识别的高斯记录数量');
  }

  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count * 3);
  const rotations = new Float32Array(count * 4);
  const colors = new Uint8Array(count * 4);
  const view = new DataView(buffer);

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < count; i++) {
    const off = i * SPLAT_STRIDE;
    const x = view.getFloat32(off, true);
    const y = view.getFloat32(off + 4, true);
    const z = view.getFloat32(off + 8, true);
    const sx = view.getFloat32(off + 12, true);
    const sy = view.getFloat32(off + 16, true);
    const sz = view.getFloat32(off + 20, true);

    if (![x, y, z, sx, sy, sz].every(isFinite3)) {
      throw new SplatParseError(`第 ${i + 1} 条记录包含非有限数值`);
    }
    if (!(sx > 0 && sy > 0 && sz > 0)) {
      throw new SplatParseError(`第 ${i + 1} 条记录包含非正尺度`);
    }

    let qw = (view.getUint8(off + 28) - 128) / 128;
    let qx = (view.getUint8(off + 29) - 128) / 128;
    let qy = (view.getUint8(off + 30) - 128) / 128;
    let qz = (view.getUint8(off + 31) - 128) / 128;
    const qLen = Math.hypot(qw, qx, qy, qz);
    if (!(qLen > 0)) {
      throw new SplatParseError(`第 ${i + 1} 条记录包含零四元数`);
    }
    qw /= qLen;
    qx /= qLen;
    qy /= qLen;
    qz /= qLen;

    const p3 = i * 3;
    const p4 = i * 4;
    positions[p3] = x;
    positions[p3 + 1] = y;
    positions[p3 + 2] = z;
    scales[p3] = sx;
    scales[p3 + 1] = sy;
    scales[p3 + 2] = sz;
    rotations[p4] = qw;
    rotations[p4 + 1] = qx;
    rotations[p4 + 2] = qy;
    rotations[p4 + 3] = qz;
    colors[p4] = view.getUint8(off + 24);
    colors[p4 + 1] = view.getUint8(off + 25);
    colors[p4 + 2] = view.getUint8(off + 26);
    colors[p4 + 3] = view.getUint8(off + 27);

    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
  }

  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const ex = (max[0] - min[0]) / 2;
  const ey = (max[1] - min[1]) / 2;
  const ez = (max[2] - min[2]) / 2;
  const radius = Math.hypot(ex, ey, ez) || 1;

  return { count, positions, scales, rotations, colors, bounds: { center, radius, min, max } };
}
