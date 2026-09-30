import { buildCovariance3D } from "./covariance";
import type { SplatData } from "./types";

export interface GpuSceneData {
  count: number;
  positions: Float32Array;
  covariances: Float32Array;
  colors: Uint8Array;
}

// 将四元数 + 三轴尺度预计算为世界空间三维协方差（加载时只做一次）。
export function buildSceneCovariances(data: SplatData): GpuSceneData {
  const covariances = new Float32Array(data.count * 6);
  for (let i = 0; i < data.count; i++) {
    const i3 = i * 3;
    const i4 = i * 4;
    const [a, b, c, d, e, f] = buildCovariance3D(
      data.rotations[i4 + 1],
      data.rotations[i4 + 2],
      data.rotations[i4 + 3],
      data.rotations[i4],
      data.scales[i3],
      data.scales[i3 + 1],
      data.scales[i3 + 2],
    );
    const o = i * 6;
    covariances[o] = a;
    covariances[o + 1] = b;
    covariances[o + 2] = c;
    covariances[o + 3] = d;
    covariances[o + 4] = e;
    covariances[o + 5] = f;
  }
  return {
    count: data.count,
    positions: data.positions.slice(),
    covariances,
    colors: data.colors.slice(),
  };
}
