
export interface InitMessage {
  type: "init";
  sceneId: number;
  count: number;
  positions: ArrayBuffer; // Float32 xyz
  covariances: ArrayBuffer; // Float32 x6 上三角
  colors: ArrayBuffer; // Uint8 rgba
}

export interface SortMessage {
  type: "sort";
  sceneId: number;
  taskId: number;
  view: Float32Array;
  focalX: number;
  focalY: number;
  width: number;
  height: number;
  near: number;
}

export interface DisposeMessage {
  type: "dispose";
}

export type WorkerInMessage = InitMessage | SortMessage | DisposeMessage;

// 每个可见实例 7 个 float：[x, y, radius, covA, covB, covC, colorPackedRGBA]。
export const INSTANCE_FLOATS = 7;
export const INSTANCE_STRIDE = INSTANCE_FLOATS * 4;

export interface SortResult {
  type: "result";
  sceneId: number;
  taskId: number;
  count: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

export interface SortError {
  type: "error";
  sceneId: number;
  taskId: number;
  message: string;
}
