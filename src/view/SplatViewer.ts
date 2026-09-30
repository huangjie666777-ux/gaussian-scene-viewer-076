import { SplatRenderer } from "../render/splatRenderer";
import { OrbitCamera, attachOrbitControls, computeBounds } from "./orbitCamera";
import { Vector3 } from "three";
import type { GpuSceneData } from "../splat/prepareScene";
import type { SortResult, SortError, SortMessage } from "../worker/protocol";

type StatusListener = (status: {
  loading: boolean;
  error: string | null;
  count: number;
  visible: number;
}) => void;

export class SplatViewer {
  private canvas: HTMLCanvasElement;
  private renderer: SplatRenderer;
  private camera: OrbitCamera;
  private detachControls: () => void;
  private worker: Worker | null = null;
  private sceneId = 0;
  private taskId = 0;
  private queuedTask: SortMessage | null = null;
  private sortInFlight = false;
  private scheduleTimer: number | null = null;
  private rafId = 0;
  private disposed = false;
  private loading = false;
  private error: string | null = null;
  private count = 0;
  private visible = 0;
  private listeners = new Set<StatusListener>();
  private ro: ResizeObserver;
  private width = 1;
  private height = 1;
  private lastBounds: { center: Vector3; radius: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new SplatRenderer(canvas);
    const rect = canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.camera = new OrbitCamera(this.width / this.height);
    this.camera.onChange = () => this.scheduleSort();
    this.detachControls = attachOrbitControls(canvas, this.camera);

    this.ro = new ResizeObserver(() => this.handleResize());
    this.ro.observe(canvas);
    this.handleResize();
    this.loop();
  }

  subscribe(fn: StatusListener): () => void {
    this.listeners.add(fn);
    fn(this.getStatus());
    return () => this.listeners.delete(fn);
  }

  private getStatus() {
    return { loading: this.loading, error: this.error, count: this.count, visible: this.visible };
  }

  private emit(): void {
    const status = this.getStatus();
    this.listeners.forEach((l) => l(status));
  }

  setLoading(loading: boolean): void {
    this.loading = loading;
    this.emit();
  }

  setError(error: string | null): void {
    this.error = error;
    this.emit();
  }

  loadScene(data: GpuSceneData): void {
    const newSceneId = ++this.sceneId;
    this.taskId = 0;
    this.queuedTask = null;
    this.sortInFlight = false;
    this.visible = 0;
    this.count = data.count;
    this.terminateWorker();

    const worker = new Worker(new URL("../worker/sort.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<SortResult | SortError>) => {
      const result = event.data;
      if (result.type === "error") {
        if (result.sceneId === this.sceneId) {
          this.sortInFlight = false;
          this.setError(`排序/投影失败：${result.message}`);
        }
        return;
      }
      // 严格匹配场景、任务与视口尺寸：迟到结果不能覆盖新状态。
      if (
        result.sceneId !== this.sceneId ||
        result.taskId !== this.taskId ||
        result.width !== this.width ||
        result.height !== this.height
      ) {
        return;
      }
      this.sortInFlight = false;
      this.visible = result.count;
      this.renderer.uploadInstances(result.buffer, result.count);
      this.emit();
      if (this.queuedTask) {
        const task = this.queuedTask;
        this.queuedTask = null;
        this.postSort(task);
      }
    };

    const positions = data.positions.buffer.slice(0);
    const covariances = data.covariances.buffer.slice(0);
    const colors = data.colors.buffer.slice(0);
    worker.postMessage(
      {
        type: "init",
        sceneId: newSceneId,
        count: data.count,
        positions,
        covariances,
        colors,
      },
      [positions, covariances, colors],
    );

    const bounds = computeBounds(data.positions);
    this.lastBounds = { center: bounds.center, radius: bounds.radius };
    this.camera.fit(bounds);
    this.error = null;
    this.emit();
    this.scheduleSort(true);
  }

  resetView(): void {
    this.camera.reset();
  }

  refitView(): void {
    if (!this.lastBounds) return;
    this.camera.fit(this.lastBounds, false);
  }

  private handleResize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(w, h, dpr);
    this.camera.setViewport(w, h);
    this.scheduleSort(true);
  }

  private scheduleSort(immediate = false): void {
    if (this.scheduleTimer !== null) {
      window.clearTimeout(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    const delay = immediate ? 0 : 32;
    this.scheduleTimer = window.setTimeout(() => {
      this.scheduleTimer = null;
      this.requestSort();
    }, delay);
  }

  private requestSort(): void {
    if (!this.worker || this.count === 0) return;
    this.camera.camera.updateMatrixWorld(true);
    this.camera.camera.matrixWorldInverse.copy(
      this.camera.camera.matrixWorld,
    ).invert();
    const viewElements = new Float32Array(this.camera.camera.matrixWorldInverse.elements);
    const fov = (this.camera.camera.fov * Math.PI) / 180;
    const focalY = this.height / (2 * Math.tan(fov / 2));
    const focalX = focalY * this.camera.camera.aspect;
    const task: SortMessage = {
      type: "sort",
      sceneId: this.sceneId,
      taskId: ++this.taskId,
      view: viewElements,
      focalX,
      focalY,
      width: this.width,
      height: this.height,
      near: this.camera.camera.near,
    };
    if (this.sortInFlight) {
      this.queuedTask = task;
    } else {
      this.postSort(task);
    }
  }

  private postSort(task: SortMessage): void {
    if (!this.worker || task.sceneId !== this.sceneId) return;
    this.sortInFlight = true;
    this.worker.postMessage(task);
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);
    this.renderer.draw(this.width, this.height);
  };

  private terminateWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.sortInFlight = false;
    if (this.scheduleTimer !== null) {
      window.clearTimeout(this.scheduleTimer);
      this.scheduleTimer = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.detachControls();
    this.ro.disconnect();
    this.terminateWorker();
    this.renderer.dispose();
    this.listeners.clear();
  }
}
