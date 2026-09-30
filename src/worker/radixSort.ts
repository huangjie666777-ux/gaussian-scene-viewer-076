
// 对非负 Float32 位模式做稳定的 4 趟 8 位基数排序，
// 直接排列槽位索引，输出深度升序（近 -> 远）。
export function radixSortSlots(
  depth: Float32Array,
  order: Uint32Array,
  scratch: Uint32Array,
  n: number,
): void {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < n; i++) order[i] = i;
  let src = order;
  let dst = scratch;
  for (let shift = 0; shift < 32; shift += 8) {
    histogram.fill(0);
    for (let i = 0; i < n; i++) histogram[(depth[src[i]] >>> shift) & 255]++;
    let sum = 0;
    for (let b = 0; b < 256; b++) {
      const h = histogram[b];
      histogram[b] = sum;
      sum += h;
    }
    for (let i = 0; i < n; i++) {
      const slot = src[i];
      dst[histogram[(depth[slot] >>> shift) & 255]++] = slot;
    }
    const tmp = src;
    src = dst;
    dst = tmp;
  }
  if (src !== order) order.set(src.subarray(0, n));
}
