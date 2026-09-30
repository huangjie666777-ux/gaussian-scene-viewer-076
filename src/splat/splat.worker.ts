import { buildFrame } from './frameBuilder';
import type { SplatData } from './parser';
import type { SplatWorkerRequest, SplatWorkerResponse } from './messages';

let scene: SplatData | null = null;

self.onmessage = (event: MessageEvent<SplatWorkerRequest>) => {
  const message = event.data;
  if (message.type === 'dispose') {
    scene = null;
    return;
  }
  if (message.type === 'load') {
    scene = {
      count: message.count,
      positions: new Float32Array(message.positions),
      scales: new Float32Array(message.scales),
      rotations: new Float32Array(message.rotations),
      colors: new Uint8Array(message.colors),
      bounds: {
        center: [0, 0, 0],
        radius: 1,
        min: [0, 0, 0],
        max: [0, 0, 0],
      },
    };
    return;
  }
  if (message.type === 'frame') {
    if (!scene) return;
    const built = buildFrame(scene, message.params);
    const response: SplatWorkerResponse = {
      type: 'frame',
      sceneId: message.sceneId,
      frameId: message.frameId,
      packed: built.packed,
      visible: built.visible,
    };
    (self as unknown as Worker).postMessage(response, [built.packed]);
  }
};
