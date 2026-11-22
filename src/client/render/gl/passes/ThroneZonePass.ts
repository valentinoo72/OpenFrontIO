import type { TerrainRect } from "../../types";
import fragSrc from "../shaders/throne-zone/throne-zone.frag.glsl?raw";
import vertSrc from "../shaders/throne-zone/throne-zone.vert.glsl?raw";
import { createProgram } from "../utils/GlUtils";

/** Static land geometry drawn underneath structures, bars and world text. */
export class ThroneZonePass {
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private buffer: WebGLBuffer;
  private uCamera: WebGLUniformLocation;
  private vertexCount = 0;

  constructor(private gl: WebGL2RenderingContext) {
    this.program = createProgram(gl, vertSrc, fragSrc, "ThroneZonePass");
    this.uCamera = gl.getUniformLocation(this.program, "uCamera")!;
    this.vao = gl.createVertexArray()!;
    this.buffer = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  update(rects: readonly TerrainRect[]): void {
    const vertices = new Float32Array(rects.length * 12);
    rects.forEach(({ x, y, w, h }, index) =>
      vertices.set(
        [x, y, x + w, y, x, y + h, x, y + h, x + w, y, x + w, y + h],
        index * 12,
      ),
    );
    this.vertexCount = vertices.length / 2;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
  }

  draw(camera: Float32Array): void {
    if (this.vertexCount === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, camera);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}
