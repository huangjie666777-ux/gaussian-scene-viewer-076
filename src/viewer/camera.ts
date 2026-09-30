import type { PerspectiveCamera } from 'three';
import type { ProjectionParams } from '../splat/covariance';

/** Extract pixel-space pinhole parameters from a three perspective camera. */
export function projectionParams(
  camera: PerspectiveCamera,
  widthCss: number,
  heightCss: number,
  dpr: number,
): ProjectionParams {
  const focalY = (0.5 * heightCss * dpr) / Math.tan(0.5 * camera.fov * (Math.PI / 180));
  const focalX = focalY * camera.aspect;
  const view = new Float32Array(16);
  view.set(camera.matrixWorldInverse.elements);
  return {
    view,
    focalX,
    focalY,
    centerX: widthCss * dpr * 0.5,
    centerY: heightCss * dpr * 0.5,
    width: widthCss * dpr,
    height: heightCss * dpr,
    near: camera.near * 1.05,
  };
}

export interface FitTarget {
  center: [number, number, number];
  radius: number;
}

/** Place the camera so the whole bounding sphere fits the vertical fov. */
export function fitCamera(camera: PerspectiveCamera, target: FitTarget): void {
  const fov = camera.fov * (Math.PI / 180);
  const aspect = Math.max(camera.aspect, 1e-4);
  const fitFov = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * aspect));
  const distance = (target.radius / Math.sin(fitFov / 2)) * 1.15;
  camera.position.set(
    target.center[0],
    target.center[1] + target.radius * 0.15,
    target.center[2] + distance,
  );
  camera.near = Math.max(distance - target.radius * 3, 1e-3);
  camera.far = Math.max(distance + target.radius * 3, 100);
  camera.updateProjectionMatrix();
}
