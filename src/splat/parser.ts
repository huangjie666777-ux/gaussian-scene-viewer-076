import type { SplatData } from "./types";

export const BYTES_PER_SPLAT = 32;

export class SplatParseError extends Error {}

export function parseSplat(buffer: ArrayBuffer): SplatData {
  if (buffer.byteLength === 0 || buffer.byteLength % BYTES_PER_SPLAT !== 0) {
    throw new SplatParseError(
      `文件长度 ${buffer.byteLength} 不是 ${BYTES_PER_SPLAT} 字节的整数倍，数据可能被截断`,
    );
  }
  const view = new DataView(buffer);
  const count = buffer.byteLength / BYTES_PER_SPLAT;
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count * 3);
  const rotations = new Float32Array(count * 4);
  const colors = new Uint8Array(count * 4);
  const bytes = new Uint8Array(buffer);

  for (let i = 0; i < count; i++) {
    const off = i * BYTES_PER_SPLAT;
    const px = view.getFloat32(off, true);
    const py = view.getFloat32(off + 4, true);
    const pz = view.getFloat32(off + 8, true);
    const sx = view.getFloat32(off + 12, true);
    const sy = view.getFloat32(off + 16, true);
    const sz = view.getFloat32(off + 20, true);
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
      throw new SplatParseError(`第 ${i} 条高斯位置包含非有限值`);
    }
    if (!(sx > 0) || !(sy > 0) || !(sz > 0)) {
      throw new SplatParseError(`第 ${i} 条高斯必须具有正的三轴尺度`);
    }

    let w = (bytes[off + 28] - 128) / 128;
    let x = (bytes[off + 29] - 128) / 128;
    let y = (bytes[off + 30] - 128) / 128;
    let z = (bytes[off + 31] - 128) / 128;
    const qLen = Math.hypot(w, x, y, z);
    if (qLen === 0 || !Number.isFinite(qLen)) {
      throw new SplatParseError(`第 ${i} 条高斯四元数为零或非法`);
    }
    w /= qLen;
    x /= qLen;
    y /= qLen;
    z /= qLen;

    const i3 = i * 3;
    const i4 = i * 4;
    positions[i3] = px;
    positions[i3 + 1] = py;
    positions[i3 + 2] = pz;
    scales[i3] = sx;
    scales[i3 + 1] = sy;
    scales[i3 + 2] = sz;
    rotations[i4] = w;
    rotations[i4 + 1] = x;
    rotations[i4 + 2] = y;
    rotations[i4 + 3] = z;
    colors[i4] = bytes[off + 24];
    colors[i4 + 1] = bytes[off + 25];
    colors[i4 + 2] = bytes[off + 26];
    colors[i4 + 3] = bytes[off + 27];
  }
  return { count, positions, scales, rotations, colors };
}
