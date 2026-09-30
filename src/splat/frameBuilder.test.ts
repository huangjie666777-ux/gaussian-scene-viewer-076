import { describe, expect, it } from 'vitest';
import { buildFrame, INSTANCE_STRIDE } from './frameBuilder';
import { quatToMat3, worldCovariance3, projectCovariance, type ProjectionParams } from './covariance';
import { parseSplat, SPLAT_STRIDE } from './parser';

function identityParams(overrides: Partial<ProjectionParams> = {}): ProjectionParams {
  const view = new Float32Array(16);
  view[0] = 1;
  view[5] = 1;
  view[10] = 1;
  view[15] = 1;
  return {
    view,
    focalX: 500,
    focalY: 500,
    centerX: 400,
    centerY: 300,
    width: 800,
    height: 600,
    near: 0.1,
    ...overrides,
  };
}

describe('covariance math', () => {
  it('builds an orthonormal matrix from a unit quaternion', () => {
    const m = quatToMat3([1, 0, 0, 0], new Float32Array(9));
    expect(Array.from(m)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('produces squared scales along axes for identity rotation', () => {
    const rotations = new Float32Array([1, 0, 0, 0]);
    const scales = new Float32Array([2, 3, 4]);
    const cov = worldCovariance3(rotations, scales, 0, new Float32Array(6));
    expect(Array.from(cov)).toEqual([4, 0, 0, 9, 0, 16]);
  });

  it('projects a front-facing splat into an isotropic screen ellipse', () => {
    const cov = worldCovariance3(
      new Float32Array([1, 0, 0, 0]),
      new Float32Array([0.1, 0.1, 0.1]),
      0,
      new Float32Array(6),
    );
    const projected = projectCovariance(cov, [0, 0, -5], 0, identityParams());
    expect(projected.visible).toBe(true);
    expect(projected.screenX).toBeCloseTo(400, 5);
    expect(projected.screenY).toBeCloseTo(300, 5);
    expect(projected.covA).toBeCloseTo(projected.covC, 4);
    expect(projected.covB).toBeCloseTo(0, 5);
    expect(projected.radius).toBeGreaterThan(0);
    expect(projected.depth).toBeCloseTo(5, 5);
  });

  it('rejects splats behind the camera and at/near the near plane', () => {
    const cov = new Float32Array([0.01, 0, 0, 0.01, 0, 0.01]);
    expect(projectCovariance(cov, [0, 0, 5], 0, identityParams()).visible).toBe(false);
    expect(projectCovariance(cov, [0, 0, -0.05], 0, identityParams()).visible).toBe(false);
  });
});

describe('buildFrame', () => {
  it('sorts visible splats far to near and packs attributes', () => {
    const bytes = new Uint8Array(SPLAT_STRIDE * 3);
    const view = new DataView(bytes.buffer);
    const depths = [-2, -8, -4]; // camera looks toward -z
    for (let i = 0; i < 3; i++) {
      const off = i * SPLAT_STRIDE;
      view.setFloat32(off, 0, true);
      view.setFloat32(off + 4, 0, true);
      view.setFloat32(off + 8, depths[i], true);
      view.setFloat32(off + 12, 0.05, true);
      view.setFloat32(off + 16, 0.05, true);
      view.setFloat32(off + 20, 0.05, true);
      bytes[off + 24] = 100 + i;
      bytes[off + 25] = 0;
      bytes[off + 26] = 0;
      bytes[off + 27] = 255;
      bytes[off + 28] = 255;
      bytes[off + 29] = 128;
      bytes[off + 30] = 128;
      bytes[off + 31] = 128;
    }
    const scene = parseSplat(bytes.buffer);
    const frame = buildFrame(scene, identityParams());
    expect(frame.visible).toBe(3);
    expect(frame.packed.byteLength).toBe(3 * INSTANCE_STRIDE);
    const packed = new Uint8Array(frame.packed);
    // Far splat (z=-8, red=101) must be first so back-to-front blending works.
    expect(packed[20]).toBe(101);
    expect(packed[INSTANCE_STRIDE + 20]).toBe(102);
    expect(packed[2 * INSTANCE_STRIDE + 20]).toBe(100);
  });
});
