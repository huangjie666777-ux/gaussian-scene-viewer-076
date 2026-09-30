import { useEffect, useRef, useState } from "react";
import { SplatViewer } from "../view/SplatViewer";
import { parseSplat, SplatParseError } from "../splat/parser";
import { buildSceneCovariances } from "../splat/prepareScene";
import "../styles.css";

const BUILTIN_SCENES = [
  { label: "guitar.splat（内置）", url: "/scenes/guitar.splat" },
];

interface Status {
  loading: boolean;
  error: string | null;
  count: number;
  visible: number;
}

export default function ViewerApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<SplatViewer | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<Status>({
    loading: true,
    error: null,
    count: 0,
    visible: 0,
  });
  const [sceneName, setSceneName] = useState<string>("");

  useEffect(() => {
    if (!canvasRef.current) return;
    const viewer = new SplatViewer(canvasRef.current);
    viewerRef.current = viewer;
    const unsubscribe = viewer.subscribe(setStatus);
    void loadFromUrl(BUILTIN_SCENES[0].url, BUILTIN_SCENES[0].label, viewer);
    return () => {
      unsubscribe();
      viewer.dispose();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFromUrl(url: string, name: string, viewer: SplatViewer) {
    viewer.setError(null);
    viewer.setLoading(true);
    setSceneName(name);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const parsed = parseSplat(buffer);
      viewer.loadScene(buildSceneCovariances(parsed));
    } catch (err) {
      viewer.setError(formatError(err));
    } finally {
      viewer.setLoading(false);
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const viewer = viewerRef.current;
    if (!file || !viewer) return;
    viewer.setError(null);
    viewer.setLoading(true);
    setSceneName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseSplat(buffer);
      // 只有解析完全成功后才切换场景；损坏文件不会覆盖当前画面。
      viewer.loadScene(buildSceneCovariances(parsed));
    } catch (err) {
      viewer.setError(formatError(err));
    } finally {
      viewer.setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function formatError(err: unknown): string {
    if (err instanceof SplatParseError) return `文件解析失败：${err.message}`;
    if (err instanceof Error) return err.message;
    return String(err);
  }

  return (
    <div className="app">
      <canvas ref={canvasRef} className="viewport" />
      <div className="panel">
        <h1>3D Gaussian Splatting 浏览器</h1>
        <label className="field">
          内置场景
          <select
            defaultValue={BUILTIN_SCENES[0].url}
            onChange={(e) => {
              const scene = BUILTIN_SCENES.find((s) => s.url === e.target.value);
              if (scene && viewerRef.current) {
                void loadFromUrl(scene.url, scene.label, viewerRef.current);
              }
            }}
          >
            {BUILTIN_SCENES.map((s) => (
              <option key={s.url} value={s.url}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          本地文件
          <input
            ref={fileInputRef}
            type="file"
            accept=".splat,application/octet-stream"
            onChange={(e) => void handleFile(e)}
          />
        </label>
        <div className="buttons">
          <button onClick={() => viewerRef.current?.resetView()}>重置视角</button>
          <button onClick={() => viewerRef.current?.refitView()}>适配全景</button>
        </div>
        <dl className="stats">
          <dt>当前场景</dt>
          <dd title={sceneName}>{sceneName || "-"}</dd>
          <dt>高斯总数</dt>
          <dd>{status.count.toLocaleString()}</dd>
          <dt>可见数量</dt>
          <dd>{status.visible.toLocaleString()}</dd>
        </dl>
        {status.loading && <div className="status loading">加载中…</div>}
        {status.error && <div className="status error">{status.error}</div>}
        <p className="hint">
          左键拖动旋转 · 右键拖动平移 · 滚轮缩放
        </p>
      </div>
    </div>
  );
}
