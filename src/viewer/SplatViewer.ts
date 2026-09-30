import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PerspectiveCamera, Vector3 } from 'three';
import { SplatRenderer } from '../renderer/SplatRenderer';
import { SplatWorkerClient, type FrameResult } from './SplatWorkerClient';
import { fitCamera, projectionParams } from './camera';
import type { SplatData } from '../splat/parser';

export interface ViewerStats {
  count: number;
  visible: number;
}

interface SceneEntry {
  id: number;
  data: SplatData;
}

export class SplatViewer {
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly renderer: SplatRenderer;
  private readonly worker: SplatWorkerClient;
  private scene: SceneEntry | null = null;
  private frameId = 0;
  private issuedFrame = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;
  private frameInFlight = false;
  private frameDirty = false;
  private immediateRequested = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onStats: (stats: ViewerStats) => void,
  ) {
    this.camera = new PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 0, 3);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => this.requestFrame());

    this.renderer = new SplatRenderer(canvas, () => this.requestFrame(true));
    this.worker = new SplatWorkerClient((result) => this.handleFrame(result));

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas);
    this.handleResize();

    // OrbitControls damping continues after interaction; keep updating while
    // the camera is still moving.
    const tick = (): void => {
      if (this.disposed) return;
      const changed = this.controls.update();
      if (changed) this.requestFrame();
      else if (this.frameDirty && !this.frameInFlight) this.dispatchFrame();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /**
   * Replace the active scene. The worker copies the arrays, so the caller may
   * release its own references afterwards.
   */
  setScene(data: SplatData): void {
    const id = this.scene ? this.scene.id + 1 : 1;
    this.scene = { id, data };
    this.frameId = 0;
    this.frameInFlight = false;
    this.frameDirty = false;
    this.worker.loadScene(id, data);
    this.fit();
    this.onStats({ count: data.count, visible: 0 });
  }

  fit(): void {
    if (!this.scene) return;
    const { center, radius } = this.scene.data.bounds;
    fitCamera(this.camera, { center, radius });
    this.controls.target.copy(new Vector3(center[0], center[1], center[2]));
    this.controls.update();
    this.requestFrame(true);
  }

  resetView(): void {
    this.fit();
  }

  private handleResize(): void {
    const width = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 1;
    const height = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 1;
    this.renderer.resize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestFrame(true);
  }

  /**
   * Mark the view dirty. Only one projection/sort job is in flight at a time,
   * so a slow worker cannot build a queue of stale camera positions; the next
   * rAF always sends the newest camera once the worker is free again.
   */
  private requestFrame(immediate = false): void {
    if (this.disposed || !this.scene) return;
    this.frameDirty = true;
    if (immediate) this.immediateRequested = true;
    if (!this.frameInFlight && immediate) this.dispatchFrame();
  }

  private dispatchFrame(): void {
    if (!this.scene || this.disposed) return;
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.camera.updateMatrixWorld();
    const params = projectionParams(this.camera, width, height, dpr);
    this.frameId += 1;
    this.issuedFrame = this.frameId;
    this.frameDirty = false;
    this.immediateRequested = false;
    this.frameInFlight = true;
    this.worker.requestFrame(this.scene.id, this.frameId, params);
  }

  private handleFrame(result: FrameResult): void {
    this.frameInFlight = false;
    if (this.disposed) return;
    // Drop late answers from an older scene or an outdated camera position.
    if (!this.scene || result.sceneId !== this.scene.id) return;
    if (result.frameId !== this.issuedFrame) return;
    this.renderer.draw(result.packed, result.visible);
    if (this.scene) this.onStats({ count: this.scene.data.count, visible: result.visible });
    // The camera moved while the worker was busy: send the newest position.
    if (this.frameDirty) {
      if (this.immediateRequested) this.dispatchFrame();
      else requestAnimationFrame(() => this.dispatchFrame());
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.worker.dispose();
    this.renderer.dispose();
  }
}
