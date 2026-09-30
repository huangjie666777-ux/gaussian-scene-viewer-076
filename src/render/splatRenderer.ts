import { INSTANCE_FLOATS, INSTANCE_STRIDE } from "../worker/protocol";

const VERT_FULL = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 iCenterRadius;
layout(location = 2) in vec3 iCov2D;
layout(location = 3) in vec4 iColor;
uniform vec2 uViewport;
uniform float uDpr;
out vec4 vColor;
out vec2 vPower;
void main() {
  vec2 offset = aCorner * iCenterRadius.z * uDpr;
  vec2 screen = (iCenterRadius.xy + aCorner * iCenterRadius.z) * uDpr;
  vec2 ndc = vec2(screen.x / uViewport.x * 2.0 - 1.0,
                  1.0 - screen.y / uViewport.y * 2.0);
  gl_Position = vec4(ndc, 0.5, 1.0);
  float a = iCov2D.x;
  float b = iCov2D.y;
  float c = iCov2D.z;
  float det = a * c - b * b;
  float power = 0.5 * (a * offset.y * offset.y + c * offset.x * offset.x
                        - 2.0 * b * offset.x * offset.y) / det;
  if (power > 4.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // 移到 NDC 外，硬件裁剪
  }
  vColor = iColor;
  vPower = vec2(power, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vPower;
out vec4 outColor;
void main() {
  if (vPower.y < 0.5) discard;
  float g = exp(-vPower.x);
  outColor = vec4(vColor.rgb, vColor.a * g);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("无法创建着色器");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`着色器编译失败: ${log}`);
  }
  return shader;
}

export class SplatRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private quadVbo: WebGLBuffer;
  private instanceVbo: WebGLBuffer;
  private uViewport: WebGLUniformLocation | null;
  private uDpr: WebGLUniformLocation | null;
  private dpr = 1;
  private instanceCapacity = 0;
  private currentCount = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("当前浏览器不支持 WebGL2");
    this.gl = gl;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT_FULL);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`程序链接失败: ${gl.getProgramInfoLog(program)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;
    this.uViewport = gl.getUniformLocation(program, "uViewport");
    this.uDpr = gl.getUniformLocation(program, "uDpr");

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    this.quadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.instanceVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    const stride = INSTANCE_STRIDE;
    // location 1: vec3 center/radius，location 2: vec3 cov2D，location 3: packed RGBA。
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, stride, 24);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);

    gl.clearColor(0.06, 0.07, 0.09, 1);
    gl.enable(gl.BLEND);
    // 源数据为非预乘 alpha：over 算子 src*a + dst*(1-a)。
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
  }

  // buffer 为 Worker 输出的实例数组，调用后所有权转移到 GPU 或被释放。
  uploadInstances(buffer: ArrayBuffer, count: number): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    if (count > this.instanceCapacity) {
      const cap = Math.max(count, 4096);
      gl.bufferData(gl.ARRAY_BUFFER, cap * INSTANCE_STRIDE, gl.DYNAMIC_DRAW);
      this.instanceCapacity = cap;
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, buffer);
    this.currentCount = count;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    this.dpr = dpr;
  }

  draw(width: number, height: number): void {
    const gl = this.gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.currentCount === 0) return;
    gl.useProgram(this.program);
    gl.uniform2f(this.uViewport, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(this.uDpr, this.dpr);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.currentCount);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.quadVbo);
    gl.deleteBuffer(this.instanceVbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
    this.currentCount = 0;
    this.instanceCapacity = 0;
  }
}
