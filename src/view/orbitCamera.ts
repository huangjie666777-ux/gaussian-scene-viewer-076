import { PerspectiveCamera, Vector3 } from "three";

export interface Bounds {
  center: Vector3;
  radius: number;
}

export function computeBounds(positions: Float32Array): Bounds {
  if (positions.length === 0) {
    return { center: new Vector3(), radius: 1 };
  }
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < positions.length; i += 3) {
    min.x = Math.min(min.x, positions[i]);
    min.y = Math.min(min.y, positions[i + 1]);
    min.z = Math.min(min.z, positions[i + 2]);
    max.x = Math.max(max.x, positions[i]);
    max.y = Math.max(max.y, positions[i + 1]);
    max.z = Math.max(max.z, positions[i + 2]);
  }
  const center = min.clone().add(max).multiplyScalar(0.5);
  const radius = Math.max(1e-4, max.distanceTo(min) * 0.5);
  return { center, radius };
}

// 轻量轨道相机：左键旋转、右键平移、滚轮缩放。
// 状态以球坐标 (yaw, pitch, distance) 描述，支持一键适配与重置。
export class OrbitCamera {
  readonly camera: PerspectiveCamera;
  target = new Vector3();
  yaw = 0;
  pitch = 0.15;
  distance = 4;
  defaultYaw = 0;
  defaultPitch = 0.15;
  defaultDistance = 4;
  defaultTarget = new Vector3();
  onChange?: () => void;

  constructor(aspect: number, near = 0.05, far = 2000) {
    this.camera = new PerspectiveCamera(50, aspect, near, far);
    this.update();
  }

  fit(bounds: Bounds, saveDefaultView = true): void {
    this.target.copy(bounds.center);
    const fov = (this.camera.fov * Math.PI) / 180;
    const fitHeight = bounds.radius / Math.tan(fov / 2);
    const fitWidth = bounds.radius / (Math.tan(fov / 2) * this.camera.aspect);
    this.distance = Math.max(fitHeight, fitWidth) * 1.25;
    this.clamp();
    if (saveDefaultView) this.saveDefault();
    this.update();
  }

  saveDefault(): void {
    this.defaultYaw = this.yaw;
    this.defaultPitch = this.pitch;
    this.defaultDistance = this.distance;
    this.defaultTarget.copy(this.target);
  }

  reset(): void {
    this.yaw = this.defaultYaw;
    this.pitch = this.defaultPitch;
    this.distance = this.defaultDistance;
    this.target.copy(this.defaultTarget);
    this.update();
  }

  rotate(dx: number, dy: number): void {
    this.yaw -= dx * 0.005;
    this.pitch -= dy * 0.005;
    const limit = Math.PI / 2 - 1e-3;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    this.update();
  }

  pan(dx: number, dy: number): void {
    const fov = (this.camera.fov * Math.PI) / 180;
    const viewHeight = 2 * this.distance * Math.tan(fov / 2);
    const scale = viewHeight / this.viewHeightPx;
    const right = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.target.addScaledVector(right, (-dx / this.viewHeightPx) * scale);
    this.target.addScaledVector(up, (dy / this.viewHeightPx) * scale);
    this.update();
  }

  zoom(factor: number): void {
    this.distance *= factor;
    this.clamp();
    this.update();
  }

  private viewHeightPx = 1;
  setViewport(width: number, height: number): void {
    this.viewHeightPx = Math.max(1, height);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  private clamp(): void {
    this.distance = Math.max(1e-3, Math.min(this.distance, 1e5));
  }

  update(): void {
    const cp = Math.cos(this.pitch);
    const offset = new Vector3(
      this.distance * cp * Math.sin(this.yaw),
      this.distance * Math.sin(this.pitch),
      this.distance * cp * Math.cos(this.yaw),
    );
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld(true);
    this.onChange?.();
  }
}

export function attachOrbitControls(el: HTMLElement, camera: OrbitCamera): () => void {
  const state = new Map<number, { x: number; y: number }>();
  let activeButton = -1;

  const onPointerDown = (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId);
    state.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeButton === -1) activeButton = e.button;
  };
  const onPointerMove = (e: PointerEvent) => {
    const prev = state.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;
    if (activeButton === 2 || e.button === 2) camera.pan(dx, dy);
    else camera.rotate(dx, dy);
  };
  const onPointerUp = (e: PointerEvent) => {
    state.delete(e.pointerId);
    if (state.size === 0) activeButton = -1;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      // 指针可能已被浏览器释放
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    camera.zoom(Math.exp(e.deltaY * 0.0012));
  };
  const onContext = (e: Event) => e.preventDefault();

  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerUp);
  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("contextmenu", onContext);

  return () => {
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerUp);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("contextmenu", onContext);
  };
}
