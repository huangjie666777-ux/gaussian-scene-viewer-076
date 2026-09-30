
// 列主序 4x4 视图矩阵（three.js Matrix4.elements 格式）。
export type Mat4 = ArrayLike<number>;

export interface ProjectParams {
  view: Mat4;
  focalX: number; // 像素焦距
  focalY: number;
  width: number;
  height: number;
  near: number;
  lowpassPx?: number; // 低通滤波半径（像素），默认 0.3 抗锯齿
}

export interface ProjectedSplat {
  visible: boolean;
  x: number; // 屏幕中心（像素）
  y: number;
  z: number; // 相机空间正深度，前方为正
  a: number; // 二维协方差 [a b; b c]（像素^2）
  b: number;
  c: number;
  radius: number; // 3-sigma 外接圆半径（像素）
}

const EPS = 1e-6;

// 世界空间 3D 协方差经相机旋转与透视雅可比（EWA）投影为屏幕二维协方差。
// 雅可比推导：相机看向 -z，屏幕 x = -fx*tx/tz + w/2，y = -fy*ty/tz + h/2。
export function projectSplat(
  px: number,
  py: number,
  pz: number,
  cov: ArrayLike<number>,
  params: ProjectParams,
): ProjectedSplat {
  const { view, focalX, focalY, width, height, near } = params;
  const lowpass = params.lowpassPx ?? 0.3;

  const tx = view[0] * px + view[4] * py + view[8] * pz + view[12];
  const ty = view[1] * px + view[5] * py + view[9] * pz + view[13];
  const tz = view[2] * px + view[6] * py + view[10] * pz + view[14];
  const z = -tz;

  const hidden: ProjectedSplat = {
    visible: false, x: 0, y: 0, z, a: 0, b: 0, c: 0, radius: 0,
  };
  // 相机后方或贴近近裁面的高斯不参与投影，防止被透视放大为铺满屏幕的椭圆。
  if (!(z > near * 1.25) || !Number.isFinite(z)) return hidden;

  // 相机空间协方差 Vc = R * Sigma * R^T，R 为视图矩阵左上 3x3（列主序）。
  const r0 = view[0], r1 = view[1], r2 = view[2];
  const r3 = view[4], r4 = view[5], r5 = view[6];
  const r6 = view[8], r7 = view[9], r8 = view[10];

  const t0 = r0 * cov[0] + r3 * cov[1] + r6 * cov[2];
  const t1 = r0 * cov[1] + r3 * cov[3] + r6 * cov[4];
  const t2 = r0 * cov[2] + r3 * cov[4] + r6 * cov[5];
  const t3 = r1 * cov[0] + r4 * cov[1] + r7 * cov[2];
  const t4 = r1 * cov[1] + r4 * cov[3] + r7 * cov[4];
  const t5 = r1 * cov[2] + r4 * cov[4] + r7 * cov[5];
  const t6 = r2 * cov[0] + r5 * cov[1] + r8 * cov[2];
  const t7 = r2 * cov[1] + r5 * cov[3] + r8 * cov[4];
  const t8 = r2 * cov[2] + r5 * cov[4] + r8 * cov[5];

  const vc0 = t0 * r0 + t1 * r3 + t2 * r6;
  const vc1 = t0 * r1 + t1 * r4 + t2 * r7;
  const vc2 = t0 * r2 + t1 * r5 + t2 * r8;
  const vc3 = t3 * r1 + t4 * r4 + t5 * r7;
  const vc4 = t3 * r2 + t4 * r5 + t5 * r8;
  const vc5 = t6 * r2 + t7 * r5 + t8 * r8;

  const invZ = 1 / z;
  const invZ2 = invZ * invZ;
  const j00 = focalX * invZ;
  const j02 = focalX * tx * invZ2;
  const j11 = focalY * invZ;
  const j12 = focalY * ty * invZ2;

  // 屏幕协方差 C = J Vc J^T，只取 (tx,ty,tz) 雅可比的两行。
  const a = j00 * j00 * vc0 + 2 * j00 * j02 * vc1 + j02 * j02 * vc5 + lowpass * lowpass;
  const b = j00 * j11 * vc1 + j00 * j12 * vc2 + j02 * j11 * vc4 + j02 * j12 * vc5;
  const c = j11 * j11 * vc3 + 2 * j11 * j12 * vc4 + j12 * j12 * vc5 + lowpass * lowpass;

  const det = a * c - b * b;
  if (!(det > EPS) || !Number.isFinite(det)) return hidden;

  // 对称矩阵最大特征值 = 迹/2 + sqrt(((a-c)/2)^2 + b^2)。
  const mid = 0.5 * (a + c);
  const disc = Math.sqrt(Math.max(0, 0.25 * (a - c) * (a - c) + b * b));
  const lambdaMin = mid - disc;
  const lambdaMax = mid + disc;
  if (!(lambdaMin > 0) || !(lambdaMax > 0)) return hidden;

  const radius = Math.sqrt(lambdaMax) * 3 * 1.15;
  if (!Number.isFinite(radius) || radius < 0.3) return hidden;

  const x = -focalX * tx * invZ + width * 0.5;
  const y = -focalY * ty * invZ + height * 0.5;
  if (x + radius < 0 || x - radius > width || y + radius < 0 || y - radius > height) {
    return hidden;
  }
  return { visible: true, x, y, z, a, b, c, radius };
}
