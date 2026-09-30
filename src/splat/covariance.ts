
// 三维协方差以上三角的 6 个分量存储：[m00,m01,m02,m11,m12,m22]，
// 对应矩阵 [[m00,m01,m02],[m01,m11,m12],[m02,m12,m22]]。

export function buildCovariance3D(
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  sx: number,
  sy: number,
  sz: number,
): [number, number, number, number, number, number] {
  // Sigma = R * diag(s^2) * R^T。R 为单位四元数 (w,x,y,z) 的旋转矩阵。
  const r00 = 1 - 2 * (qy * qy + qz * qz);
  const r01 = 2 * (qx * qy - qz * qw);
  const r02 = 2 * (qx * qz + qy * qw);
  const r10 = 2 * (qx * qy + qz * qw);
  const r11 = 1 - 2 * (qx * qx + qz * qz);
  const r12 = 2 * (qy * qz - qx * qw);
  const r20 = 2 * (qx * qz - qy * qw);
  const r21 = 2 * (qy * qz + qx * qw);
  const r22 = 1 - 2 * (qx * qx + qy * qy);

  const v0x = r00 * sx, v0y = r10 * sx, v0z = r20 * sx;
  const v1x = r01 * sy, v1y = r11 * sy, v1z = r21 * sy;
  const v2x = r02 * sz, v2y = r12 * sz, v2z = r22 * sz;

  return [
    v0x * v0x + v1x * v1x + v2x * v2x,
    v0x * v0y + v1x * v1y + v2x * v2y,
    v0x * v0z + v1x * v1z + v2x * v2z,
    v0y * v0y + v1y * v1y + v2y * v2y,
    v0y * v0z + v1y * v1z + v2y * v2z,
    v0z * v0z + v1z * v1z + v2z * v2z,
  ];
}
