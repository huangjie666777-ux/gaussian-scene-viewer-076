import type { ProjectionParams } from './covariance';

export interface LoadSceneRequest {
  type: 'load';
  /** monotonic scene token; stale results are discarded by the host */
  sceneId: number;
  positions: ArrayBuffer;
  scales: ArrayBuffer;
  rotations: ArrayBuffer;
  colors: ArrayBuffer;
  count: number;
}

export interface FrameRequest {
  type: 'frame';
  sceneId: number;
  /** monotonic camera frame id */
  frameId: number;
  params: ProjectionParams;
}

export interface DisposeRequest {
  type: 'dispose';
}

export type SplatWorkerRequest = LoadSceneRequest | FrameRequest | DisposeRequest;

export interface FrameResponse {
  type: 'frame';
  sceneId: number;
  frameId: number;
  packed: ArrayBuffer;
  visible: number;
}

export type SplatWorkerResponse = FrameResponse;
