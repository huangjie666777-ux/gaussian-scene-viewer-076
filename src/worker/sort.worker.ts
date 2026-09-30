/// <reference lib="webworker" />
import { projectSplat } from "../splat/projection";
import { radixSortSlots } from "./radixSort";
import type { WorkerInMessage } from "./protocol";
import { INSTANCE_FLOATS } from "./protocol";

let sceneId = -1;
let count = 0;
let positions: Float32Array = new Float32Array(0);
let covariances: Float32Array = new Float32Array(0);
let colors: Uint8Array = new Uint8Array(0);

// 按可见槽位复用暂存内存，交互排序时不再反复申请大块数组。
let capacity = 0;
let order: Uint32Array = new Uint32Array(0);
let orderScratch: Uint32Array = new Uint32Array(0);
let slotDepth: Float32Array = new Float32Array(0);
let slotX: Float32Array = new Float32Array(0);
let slotY: Float32Array = new Float32Array(0);
let slotA: Float32Array = new Float32Array(0);
let slotB: Float32Array = new Float32Array(0);
let slotC: Float32Array = new Float32Array(0);
let slotRadius: Float32Array = new Float32Array(0);
let slotOriginal: Uint32Array = new Uint32Array(0);

function resetBuffers(): void {
  capacity = 0;
  order = new Uint32Array(0);
  orderScratch = new Uint32Array(0);
  slotDepth = new Float32Array(0);
  slotX = new Float32Array(0);
  slotY = new Float32Array(0);
  slotA = new Float32Array(0);
  slotB = new Float32Array(0);
  slotC = new Float32Array(0);
  slotRadius = new Float32Array(0);
  slotOriginal = new Uint32Array(0);
}

function ensureCapacity(n: number): void {
  if (n <= capacity) return;
  capacity = n;
  order = new Uint32Array(n);
  orderScratch = new Uint32Array(n);
  slotDepth = new Float32Array(n);
  slotX = new Float32Array(n);
  slotY = new Float32Array(n);
  slotA = new Float32Array(n);
  slotB = new Float32Array(n);
  slotC = new Float32Array(n);
  slotRadius = new Float32Array(n);
  slotOriginal = new Uint32Array(n);
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  if (msg.type === "init") {
    sceneId = msg.sceneId;
    count = msg.count;
    positions = new Float32Array(msg.positions);
    covariances = new Float32Array(msg.covariances);
    colors = new Uint8Array(msg.colors);
    ensureCapacity(count);
    return;
  }
  if (msg.type === "dispose") {
    sceneId = -1;
    count = 0;
    positions = new Float32Array(0);
    covariances = new Float32Array(0);
    colors = new Uint8Array(0);
    resetBuffers();
    return;
  }
  if (msg.type !== "sort" || msg.sceneId !== sceneId) return;

  try {
    let visible = 0;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const projected = projectSplat(
        positions[i3],
        positions[i3 + 1],
        positions[i3 + 2],
        covariances.subarray(i * 6, i * 6 + 6),
        {
          view: msg.view,
          focalX: msg.focalX,
          focalY: msg.focalY,
          width: msg.width,
          height: msg.height,
          near: msg.near,
        },
      );
      if (!projected.visible) continue;
      slotDepth[visible] = projected.z;
      slotX[visible] = projected.x;
      slotY[visible] = projected.y;
      slotA[visible] = projected.a;
      slotB[visible] = projected.b;
      slotC[visible] = projected.c;
      slotRadius[visible] = projected.radius;
      slotOriginal[visible] = i;
      order[visible] = visible;
      visible++;
    }

    radixSortSlots(slotDepth, order, orderScratch, visible);

    const buffer = new ArrayBuffer(visible * INSTANCE_FLOATS * 4);
    const outF32 = new Float32Array(buffer);
    const outU32 = new Uint32Array(buffer);
    // 升序为近 -> 远；OpenGL 半透明混合需远 -> 近，故逆序写出。
    for (let v = 0; v < visible; v++) {
      const slot = order[visible - 1 - v];
      const original = slotOriginal[slot];
      const o = v * INSTANCE_FLOATS;
      outF32[o] = slotX[slot];
      outF32[o + 1] = slotY[slot];
      outF32[o + 2] = slotRadius[slot];
      outF32[o + 3] = slotA[slot];
      outF32[o + 4] = slotB[slot];
      outF32[o + 5] = slotC[slot];
      outU32[o + 6] =
        colors[original * 4] |
        (colors[original * 4 + 1] << 8) |
        (colors[original * 4 + 2] << 16) |
        (colors[original * 4 + 3] << 24);
    }

    (self as unknown as Worker).postMessage(
      {
        type: "result",
        sceneId: msg.sceneId,
        taskId: msg.taskId,
        count: visible,
        width: msg.width,
        height: msg.height,
        buffer,
      },
      [buffer],
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: "error",
      sceneId: msg.sceneId,
      taskId: msg.taskId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
