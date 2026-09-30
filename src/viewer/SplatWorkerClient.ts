import type {
  FrameResponse,
  SplatWorkerRequest,
} from '../splat/messages';
import type { SplatData } from '../splat/parser';
import type { ProjectionParams } from '../splat/covariance';

export interface FrameResult {
  packed: ArrayBuffer;
  visible: number;
  sceneId: number;
  frameId: number;
}

export class SplatWorkerClient {
  private readonly worker: Worker;

  constructor(onFrame: (result: FrameResult) => void) {
    this.worker = new Worker(new URL('../splat/splat.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (event: MessageEvent<FrameResponse>) => {
      const message = event.data;
      if (message.type === 'frame') {
        onFrame({
          packed: message.packed,
          visible: message.visible,
          sceneId: message.sceneId,
          frameId: message.frameId,
        });
      }
    };
  }

  loadScene(sceneId: number, scene: SplatData): void {
    const message: SplatWorkerRequest = {
      type: 'load',
      sceneId,
      count: scene.count,
      positions: slice(scene.positions),
      scales: slice(scene.scales),
      rotations: slice(scene.rotations),
      colors: slice(scene.colors),
    };
    this.worker.postMessage(message, [
      message.positions,
      message.scales,
      message.rotations,
      message.colors,
    ]);
  }

  requestFrame(sceneId: number, frameId: number, params: ProjectionParams): void {
    const message: SplatWorkerRequest = { type: 'frame', sceneId, frameId, params };
    this.worker.postMessage(message);
  }

  dispose(): void {
    this.worker.postMessage({ type: 'dispose' } satisfies SplatWorkerRequest);
    this.worker.terminate();
  }
}

function slice(array: ArrayBufferView): ArrayBuffer {
  return array.buffer.slice(
    array.byteOffset,
    array.byteOffset + array.byteLength,
  );
}
