#version 300 es
/*
  描いておいた図書館の絵に、光の中を漂うほこりの粒を重ねる。
  絵そのものは描き直さないので、毎フレーム動かしても軽い
*/
precision highp float;

uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uTime;
out vec4 outColor;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 col = texture(uScene, gl_FragCoord.xy / uRes).rgb;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));

  // 大きさと速さの違う3層に、ほこりを散らす
  float dust = 0.0;
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float size = 26.0 + fl * 20.0; // ます目の大きさ（ピクセル）
    vec2 drift = vec2(sin(uTime * 0.07 + fl * 2.0) * 10.0, uTime * (3.0 + fl * 2.0));
    vec2 p = (gl_FragCoord.xy + drift) / size;
    vec2 cell = floor(p);
    float r = hash21(cell + fl * 31.7);
    if (r > 0.8) {
      vec2 c = vec2(hash21(cell + 1.3), hash21(cell + 4.7)) * 0.8 + 0.1;
      float twinkle = 0.5 + 0.5 * sin(uTime * (0.6 + r) + r * 40.0);
      float d = length(fract(p) - c) * size;
      dust += smoothstep(1.4 + fl * 0.6, 0.0, d) * twinkle;
    }
  }

  // 光の当たっている明るい所にだけ見せる
  col += vec3(1.0, 0.92, 0.78) * dust * smoothstep(0.18, 0.6, lum) * 0.55;
  outColor = vec4(col, 1.0);
}
