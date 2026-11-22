#version 300 es
precision highp float;
layout(location = 0) in vec2 aPosition;
uniform mat3 uCamera;
void main() {
  vec3 clip = uCamera * vec3(aPosition, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
