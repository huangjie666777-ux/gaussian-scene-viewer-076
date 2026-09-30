import { describe, expect, it } from "vitest";
import { buildCovariance3D } from "./covariance";
import { projectSplat } from "./projection";

// 相机位于 (0,0,5)，看向原点；列主序视图矩阵。
function viewAtDistance(distance: number): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1;
  m[14] = -distance;
  m[15] = 1;
  return m;
}

describe("buildCovariance3D", () => {
  it("单位四元数时协方差为尺度平方的对角阵", () => {
    const [a, b, c, d, e, f] = buildCovariance3D(0, 0, 0, 1, 2, 3, 4);
    expect(a).toBeCloseTo(4);
    expect(d).toBeCloseTo(9);
    expect(f).toBeCloseTo(16);
    expect([b, c, e].every((v) => Math.abs(v) < 1e-10)).toBe(true);
  });

  it("结果对称正定且尺度旋转 90 度时交换对角项", () => {
    // 绕 y 轴 90 度的四元数 (w=cos45, y=sin45)。
    const c = Math.SQRT1_2;
    const m = buildCovariance3D(0, c, 0, c, 2, 1, 1);
    expect(m[0]).toBeCloseTo(1);
    expect(m[5]).toBeCloseTo(4);
  });
});

describe("projectSplat", () => {
  const base = { focalX: 500, focalY: 500, width: 800, height: 600, near: 0.05 };

  it("把相机正前方高斯投影到屏幕中心", () => {
    const cov = buildCovariance3D(0, 0, 0, 1, 0.1, 0.1, 0.1);
    const p = projectSplat(0, 0, 0, cov, { ...base, view: viewAtDistance(5) });
    expect(p.visible).toBe(true);
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(300);
    expect(p.z).toBeCloseTo(5);
    expect(p.a).toBeGreaterThan(0);
    expect(p.c).toBeGreaterThan(0);
    expect(p.a * p.c - p.b * p.b).toBeGreaterThan(0);
  });

  it("相机后方的高斯不可见", () => {
    const cov = buildCovariance3D(0, 0, 0, 1, 1, 1, 1);
    const p = projectSplat(0, 0, 10, cov, { ...base, view: viewAtDistance(5) });
    expect(p.visible).toBe(false);
  });

  it("近裁面附近的大高斯被剔除，不产生铺满屏幕的椭圆", () => {
    const cov = buildCovariance3D(0, 0, 0, 1, 10, 10, 10);
    const p = projectSplat(0, 0, 4.9, cov, { ...base, near: 0.2, view: viewAtDistance(5) });
    expect(p.visible).toBe(false);
  });

  it("屏幕外的高斯被剔除", () => {
    const cov = buildCovariance3D(0, 0, 0, 1, 0.01, 0.01, 0.01);
    const p = projectSplat(100, 0, 0, cov, { ...base, view: viewAtDistance(5) });
    expect(p.visible).toBe(false);
  });
});
