#version 300 es
// 画面全体を覆う三角形を1つ描く（頂点データは使わず、頂点番号から座標を作る）
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
