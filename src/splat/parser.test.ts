import { describe, expect, it } from 'vitest';
import { parseSplat, SPLAT_STRIDE, SplatParseError } from './parser';

function buildRecord(overrides: Partial<Record<string, number>> = {}): Uint8Array {
  const bytes = new Uint8Array(SPLAT_STRIDE);
  const view = new DataView(bytes.buffer);
  const floats = {
    x: 0,
    y: 0,
    z: 0,
    sx: 1,
    sy: 1,
    sz: 1,
    ...overrides,
  };
  view.setFloat32(0, floats.x, true);
  view.setFloat32(4, floats.y, true);
  view.setFloat32(8, floats.z, true);
  view.setFloat32(12, floats.sx, true);
  view.setFloat32(16, floats.sy, true);
  view.setFloat32(20, floats.sz, true);
  bytes[24] = 10;
  bytes[25] = 20;
  bytes[26] = 30;
  bytes[27] = 200;
  bytes[28] = 128; // qw = 0
  bytes[29] = 255; // qx = 127/128
  bytes[30] = 128;
  bytes[31] = 128;
  return bytes;
}

describe('parseSplat', () => {
  it('parses positions, colors and normalized quaternions', () => {
    const bytes = buildRecord({ x: 1.5, y: -2, z: 3, sx: 0.25, sy: 0.5, sz: 1 });
    const scene = parseSplat(bytes.buffer);
    expect(scene.count).toBe(1);
    expect(Array.from(scene.positions)).toEqual([1.5, -2, 3]);
    expect(Array.from(scene.scales)).toEqual([0.25, 0.5, 1]);
    expect(Array.from(scene.colors)).toEqual([10, 20, 30, 200]);
    const q = Array.from(scene.rotations);
    expect(Math.hypot(q[0], q[1], q[2], q[3])).toBeCloseTo(1, 6);
    expect(q[1]).toBeCloseTo(1, 5);
    expect(scene.bounds.radius).toBeGreaterThan(0);
  });

  it('rejects truncated buffers', () => {
    expect(() => parseSplat(new ArrayBuffer(31))).toThrow(SplatParseError);
    expect(() => parseSplat(new ArrayBuffer(0))).toThrow(SplatParseError);
  });

  it('rejects non-finite values and non-positive scales', () => {
    const nan = buildRecord();
    new DataView(nan.buffer).setFloat32(0, NaN, true);
    expect(() => parseSplat(nan.buffer)).toThrow(/非有限/);
    const zeroScale = buildRecord({ sz: 0 });
    expect(() => parseSplat(zeroScale.buffer)).toThrow(/非正尺度/);
    const negativeScale = buildRecord({ sy: -1 });
    expect(() => parseSplat(negativeScale.buffer)).toThrow(/非正尺度/);
  });

  it('rejects zero quaternions', () => {
    const bytes = buildRecord();
    for (let i = 28; i < 32; i++) bytes[i] = 128;
    expect(() => parseSplat(bytes.buffer)).toThrow(/零四元数/);
  });
});
