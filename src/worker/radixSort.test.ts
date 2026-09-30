import { describe, expect, it } from "vitest";
import { radixSortSlots } from "./radixSort";

describe("radixSortSlots", () => {
  it("按深度升序排列槽位", () => {
    const depth = Float32Array.from([3, 1, 2.5, 0.5, 8]);
    const order = new Uint32Array(5);
    const scratch = new Uint32Array(5);
    radixSortSlots(depth, order, scratch, 5);
    const sorted = Array.from(order).map((i) => depth[i]);
    expect(sorted).toEqual([0.5, 1, 2.5, 3, 8]);
  });

  it("相等深度保持稳定顺序", () => {
    const depth = Float32Array.from([2, 2, 1, 1]);
    const order = new Uint32Array(4);
    const scratch = new Uint32Array(4);
    radixSortSlots(depth, order, scratch, 4);
    expect(Array.from(order.slice(0, 2))).toEqual([2, 3]);
    expect(Array.from(order.slice(2))).toEqual([0, 1]);
  });
});
