import { describe, expect, it } from "vitest";
import { BYTES_PER_SPLAT, parseSplat, SplatParseError } from "./parser";

function buildSplat(values: {
  x?: number; y?: number; z?: number;
  sx?: number; sy?: number; sz?: number;
  r?: number; g?: number; b?: number; a?: number;
  q?: [number, number, number, number];
}): ArrayBuffer {
  const buf = new ArrayBuffer(BYTES_PER_SPLAT);
  const f32 = new DataView(buf);
  f32.setFloat32(0, values.x ?? 0, true);
  f32.setFloat32(4, values.y ?? 0, true);
  f32.setFloat32(8, values.z ?? 0, true);
  f32.setFloat32(12, values.sx ?? 1, true);
  f32.setFloat32(16, values.sy ?? 1, true);
  f32.setFloat32(20, values.sz ?? 1, true);
  const u8 = new Uint8Array(buf);
  u8[24] = values.r ?? 200;
  u8[25] = values.g ?? 100;
  u8[26] = values.b ?? 50;
  u8[27] = values.a ?? 255;
  const q = values.q ?? [1, 0, 0, 0];
  const encode = (v: number) => Math.max(0, Math.min(255, Math.round(v * 128 + 128)));
  u8[28] = encode(q[0]);
  u8[29] = encode(q[1]);
  u8[30] = encode(q[2]);
  u8[31] = encode(q[3]);
  return buf;
}

describe("parseSplat", () => {
  it("解析合法记录并解码四元数与颜色", () => {
    const data = parseSplat(buildSplat({ x: 1.5, q: [0, 0, 0, 1] }));
    expect(data.count).toBe(1);
    expect(data.positions[0]).toBeCloseTo(1.5);
    expect(data.scales[1]).toBe(1);
    expect(data.rotations[0]).toBeCloseTo(0, 1);
    expect(data.rotations[3]).toBeCloseTo(1, 1);
    expect(Array.from(data.colors.slice(0, 3))).toEqual([200, 100, 50]);
  });

  it("拒绝截断文件", () => {
    expect(() => parseSplat(new ArrayBuffer(10))).toThrow(SplatParseError);
    expect(() => parseSplat(new ArrayBuffer(0))).toThrow(SplatParseError);
  });

  it("拒绝非有限位置", () => {
    expect(() => parseSplat(buildSplat({ x: Number.NaN }))).toThrow(SplatParseError);
    expect(() => parseSplat(buildSplat({ x: Number.POSITIVE_INFINITY }))).toThrow(SplatParseError);
  });

  it("拒绝非正尺度（含 0 与负数）", () => {
    expect(() => parseSplat(buildSplat({ sx: 0 }))).toThrow(SplatParseError);
    expect(() => parseSplat(buildSplat({ sy: -2 }))).toThrow(SplatParseError);
  });

  it("拒绝零四元数", () => {
    // 128 解码后四个分量均为 0。
    const buf = buildSplat({});
    const u8 = new Uint8Array(buf);
    u8[28] = u8[29] = u8[30] = u8[31] = 128;
    expect(() => parseSplat(buf)).toThrow(SplatParseError);
  });

  it("归一化非单位四元数", () => {
    const data = parseSplat(buildSplat({ q: [1, 1, 0, 0] }));
    const norm = Math.hypot(...data.rotations);
    expect(norm).toBeCloseTo(1, 6);
    expect(data.rotations[0]).toBeCloseTo(Math.SQRT1_2, 1);
  });
});
