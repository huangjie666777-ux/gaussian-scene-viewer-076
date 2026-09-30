# 3D Gaussian Splatting 浏览器

面向数字资产人员的高斯泼溅重建结果检查工具。使用 TypeScript + React 19 +
Three.js（相机/控制器）+ 原生 WebGL2（高斯绘制），内置吉他场景并支持打开
本地 `.splat` 文件。

## 启动

```bash
npm install
npm run dev       # 开发服务器（默认 http://localhost:5173/）
npm run build     # 类型检查 + 生产构建
npm run preview   # 预览生产构建
npm test          # Vitest 单元测试（解析、协方差、投影、排序）
```

## 操作

- 左键拖动：旋转视角；右键拖动（或双指）：平移；滚轮：缩放（OrbitControls）。
- 工具栏可重新载入内置场景、打开本地 `.splat`、适配全景、重置视角。
- 左下角 HUD 显示高斯总数、当前可见数量与加载/错误状态。
- 窗口尺寸或设备像素比变化时自动更新画布与投影比例。

## `.splat` 文件格式

每条记录固定 32 字节，小端字节序：

| 偏移 | 字节数 | 内容 |
| --- | --- | --- |
| 0 | 12 | Float32 位置 `x, y, z` |
| 12 | 12 | Float32 三轴正尺度 `sx, sy, sz` |
| 24 | 4 | Uint8 颜色 `R, G, B, A`（固定 RGB，不做 SH 计算） |
| 28 | 4 | Uint8 四元数 `w, x, y, z` |

四元数解码：每个字节先减 128 再除以 128，然后整体归一化。

解析会逐条校验并在以下情况下整体拒绝（抛出错误、不覆盖当前场景）：

- 文件长度不是 32 的整数倍（截断）或为空；
- 位置/尺度包含非有限值（NaN、±Infinity）；
- 任一尺度不为正（`<= 0`）；
- 四元数为零（无法归一化）。

## 渲染管线

代码按职责拆分：

- `src/splat/parser.ts`：严格解析与包围体计算。
- `src/splat/covariance.ts`：四元数旋转矩阵、世界协方差 `R S (R S)^T`、相机变换与透视雅可比 EWA 屏幕投影（含 0.3 像素低通滤波）。
- `src/splat/frameBuilder.ts`：逐高斯投影、剔除、按相机空间深度排序、打包 24 字节/实例的属性数据。
- `src/splat/splat.worker.ts` 与 `src/splat/messages.ts`：在 Web Worker 中执行投影排序，保持主线程交互响应。
- `src/renderer/SplatRenderer.ts`：WebGL2 实例化（`drawArraysInstanced`）椭圆四边形，片元按逆协方差二次型计算高斯透明度。
- `src/viewer/camera.ts`：由 Three.js 透视相机导出像素焦距/主点与包围球适配。
- `src/viewer/SplatViewer.ts` 与 `src/viewer/SplatWorkerClient.ts`：交互编排、任务节流、状态一致性与资源释放。
- `src/ui/*`：React 界面（加载、文件选择、HUD、错误提示）。

### 排序与一致性

- Worker 每次按当前视图矩阵把高斯变换到相机空间，剔除后按正深度**从远到近**排序，再传回主线程；WebGL2 使用预乘 alpha 的 `gl.blendFunc(ONE, ONE_MINUS_SRC_ALPHA)` 正确混合。
- 同一时刻只允许一个排序任务在途：相机连续变化时只发送最新位置，Worker 不会堆积过期相机任务，主线程也只接受“当前场景 + 最新帧号”的结果，连续转动或快速切换文件时迟到结果不会覆盖新状态。
- 切换场景使用单调 `sceneId`；卸载时终止 Worker 并删除 GL 缓冲、VAO 与程序。

### 剔除与渲染取舍

- 相机后方、深度未越过近裁面（`near * 1.05`）的高斯直接剔除：透视雅可比在相机附近发散，否则会产生铺满屏幕的异常椭圆。
- 屏幕协方差非正定、椭圆半径过大（超过 2 倍屏幕边长）或完全在视口外的高斯剔除；半径小于 0.5 像素的亚像素高斯跳过。
- 每个高斯用其屏幕协方差最大特征值生成 3σ 椭圆四边形（不是等大点、球体或贴图），片元着色器按逆协方差计算椭圆高斯，`alpha < 1/255` 的片元丢弃。
- 仅使用文件内固定 RGB 与 alpha，不使用球谐高频颜色，也不做 Tonemap/色调编辑。
- 每帧在 CPU（Worker）端构建屏幕协方差并排序，精度与正确性优先；9 万级高斯在现代桌面浏览器可交互，超大场景可后续再做分块/瓦片化。

## 测试

`npm test` 覆盖：解析成功路径与截断、非有限值、非正尺度、零四元数拒绝；四元数矩阵、轴对齐协方差、EWA 投影中心点与各向同性、近裁面/后方剔除；以及远到近排序顺序与实例打包字段。

## 素材

内置场景来源与许可见 `public/scenes/ATTRIBUTION.md`、`public/scenes/PLAYCANVAS-LICENSE.txt`。本仓库不包含任何第三方高斯渲染器代码。
