#version 300 es
/*
  図書館の通路を、レイマーチングで1枚の絵として描く。
  床・壁・天井・奥の壁の箱の中に、通路の両側へ書架の列とアーチの梁を並べ、
  突き当たりの窓の光と、天井の灯りのやわらかい光で照らす。
  重いので、表示したときと画面の大きさが変わったときにだけ描く
*/
precision highp float;

uniform vec2 uRes;
out vec4 outColor;

// ---- 部屋の寸法（メートル） ----
const float AISLE = 1.2;    // 通路の幅の半分
const float HALL = 6.0;     // 部屋の幅の半分
const float CEIL = 5.8;     // 天井の高さ
const float BACK = -40.0;   // 奥の壁の位置
const float PITCH = 3.4;    // 書架の列の間隔
const float FIRST = -2.4;   // いちばん手前の書架の位置
const float NSTALL = 10.0;  // 書架の列の数
const float STALL_H = 2.8;  // 書架の高さ
const float STALL_T = 0.3;  // 書架の厚みの半分
const float BAY = 0.42;     // 棚1段の高さ
const vec3 WIN = vec3(0.0, 2.7, BACK + 0.05); // 窓の中心

// ---- 色（リニア） ----
const vec3 WOOD = vec3(0.09, 0.05, 0.03);
const vec3 WOOD_DARK = vec3(0.05, 0.028, 0.016);
const vec3 PALETTE[6] = vec3[6](
  vec3(0.16, 0.07, 0.035),
  vec3(0.22, 0.12, 0.05),
  vec3(0.12, 0.04, 0.025),
  vec3(0.30, 0.20, 0.10),
  vec3(0.07, 0.04, 0.025),
  vec3(0.20, 0.10, 0.06)
);

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

/** その位置にいちばん近い書架の列の z */
float stallCenter(float z) {
  float k = clamp(floor((FIRST - z) / PITCH + 0.5), 0.0, NSTALL - 1.0);
  return FIRST - k * PITCH;
}

/**
 * 場面までの距離と、当たったものの種類を返す。
 * 1 床 / 2 横の壁 / 3 天井 / 4 奥の壁 / 5 書架 / 6 アーチと梁
 */
vec2 map(vec3 p) {
  vec2 res = vec2(p.y, 1.0);
  float d = HALL - abs(p.x);
  if (d < res.x) res = vec2(d, 2.0);
  d = CEIL - p.y;
  if (d < res.x) res = vec2(d, 3.0);
  d = p.z - BACK;
  if (d < res.x) res = vec2(d, 4.0);

  // 書架：左右対称なので |x| で1つ分だけ考える
  float cz = stallCenter(p.z);
  vec3 q = vec3(abs(p.x) - (HALL + AISLE) * 0.5, p.y - STALL_H * 0.5, p.z - cz);
  d = sdBox(q, vec3((HALL - AISLE) * 0.5, STALL_H * 0.5, STALL_T));
  if (d < res.x) res = vec2(d, 5.0);

  // 通路をまたぐアーチ（横に少し広げた半円の帯）
  vec2 a = vec2(p.x / 1.15, p.y - 3.1);
  float ring = (length(a) - 2.4) * 0.85;
  d = max(max(abs(ring) - 0.11, abs(p.z - cz) - 0.12), 3.1 - p.y);
  if (d < res.x) res = vec2(d, 6.0);

  // アーチの外側、書架の上を横に渡る梁
  d = max(
    sdBox(vec3(p.x, p.y - 3.05, p.z - cz), vec3(HALL, 0.09, 0.13)),
    2.7 - abs(p.x)
  );
  if (d < res.x) res = vec2(d, 6.0);
  return res;
}

vec2 march(vec3 ro, vec3 rd) {
  float t = 0.0;
  float m = -1.0;
  for (int i = 0; i < 120; i++) {
    vec2 h = map(ro + rd * t);
    if (h.x < 0.0008 * t) {
      m = h.y;
      break;
    }
    t += h.x * 0.9;
    if (t > 60.0) break;
  }
  return vec2(t, m);
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(
    e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x +
    e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x
  );
}

/** すき間や角を少し暗くする（環境光の遮り） */
float calcAO(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.02 + 0.12 * float(i);
    float d = map(p + n * h).x;
    occ += (h - d) * sca;
    sca *= 0.85;
  }
  return clamp(1.0 - 2.0 * occ, 0.0, 1.0);
}

/** 書架の正面：棚板・仕切り・1冊ずつ高さと色の違う背表紙 */
vec3 stallFront(vec3 p) {
  float u = abs(p.x) - AISLE; // 通路側の端から 0
  float v = p.y;
  if (v < 0.3 || v > STALL_H - 0.14) return WOOD_DARK; // 台輪と笠木
  if (u < 0.08) return WOOD; // 通路側の柱
  if (fract((u - 0.08) / 1.05) < 0.045) return WOOD; // 縦の仕切り

  float sv = v - 0.3;
  float si = floor(sv / BAY);
  float fv = sv - si * BAY;
  if (fv < 0.035) return WOOD * 1.3; // 棚板

  // 本：段・左右・列ごとにずらした番号から、高さと色を決める
  float bu = (u - 0.08) / 0.042 + si * 17.0 + sign(p.x) * 5.3 + floor(p.z) * 3.1;
  float id = floor(bu);
  float h = 0.22 + 0.13 * hash11(id + 7.1);
  if (fv - 0.035 > h) return vec3(0.012, 0.008, 0.006); // 本の上の暗がり

  vec3 c = PALETTE[int(hash11(id) * 5.999)];
  c *= 0.75 + 0.5 * hash11(id + 3.3);
  float x = fract(bu);
  c *= smoothstep(0.0, 0.12, x) * smoothstep(1.0, 0.88, x) * 0.6 + 0.4; // 背の丸み
  float bv = (fv - 0.035) / h;
  if (abs(bv - 0.8) < 0.03 || abs(bv - 0.2) < 0.02) {
    c = mix(c, vec3(0.5, 0.35, 0.12), 0.6); // 金の帯
  }
  return c;
}

/** 格天井：梁で区切ったます目に、金の板と紋 */
vec3 ceiling(vec3 p) {
  vec2 g = vec2(p.x / 1.25, p.z / 1.5);
  vec2 f = fract(g);
  if (min(f.x, f.y) < 0.08) return WOOD_DARK;
  vec2 c = (f - 0.54) / vec2(0.46, 0.46);
  float r = length(c * vec2(1.0, 1.2));
  if (r < 0.32) return vec3(0.55, 0.48, 0.35);
  if (r < 0.55) return vec3(0.25, 0.06, 0.04);
  return vec3(0.36, 0.25, 0.09);
}

/** 石の床：大きな板石を敷き、1枚ずつ色を少し変える */
vec3 floorAlbedo(vec3 p) {
  vec2 g = p.xz / 0.9;
  vec2 f = fract(g);
  float seam = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  vec3 c = vec3(0.24, 0.19, 0.13) * (0.85 + 0.3 * hash21(floor(g)));
  return c * mix(0.6, 1.0, smoothstep(0.0, 0.02, seam));
}

/** 窓：アーチ形の明るい窓と、格子の桟 */
float windowMask(vec3 p) {
  vec2 w = vec2(p.x, p.y - 1.2);
  bool inside = abs(w.x) < 1.0 && w.y > 0.0 &&
    (w.y < 2.2 || length(vec2(w.x, w.y - 2.2)) < 1.0);
  if (!inside) return 0.0;
  bool bar = fract(w.x / 0.25 + 0.5) < 0.08 || fract(w.y / 0.36) < 0.06;
  return bar ? 0.35 : 1.0;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 ro = vec3(0.0, 1.75, 2.5);
  vec3 ta = vec3(0.0, 2.3, -20.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.1 * ww);

  vec2 h = march(ro, rd);
  vec3 col = vec3(0.0);

  if (h.y > 0.0) {
    vec3 p = ro + rd * h.x;
    vec3 n = calcNormal(p);
    float m = h.y;

    vec3 alb;
    float emit = 0.0;
    if (m < 1.5) alb = floorAlbedo(p);
    else if (m < 2.5) {
      alb = vec3(0.45, 0.38, 0.27);
      if (abs(p.y - (CEIL - 1.1)) < 0.08) alb = vec3(0.08, 0.14, 0.09); // 壁の上の帯
    }
    else if (m < 3.5) alb = ceiling(p);
    else if (m < 4.5) {
      alb = vec3(0.45, 0.38, 0.27);
      emit = windowMask(p);
    }
    else if (m < 5.5) alb = abs(n.z) > 0.5 ? stallFront(p) : WOOD;
    else alb = WOOD_DARK * 1.4;

    float ao = calcAO(p, n);
    // 天井の灯りのやわらかい光（上を向いた面ほど明るい）
    vec3 amb = mix(vec3(0.08, 0.055, 0.035), vec3(0.32, 0.24, 0.15), n.y * 0.5 + 0.5);
    col = alb * amb * ao * 1.5;

    // 突き当たりの窓の光
    vec3 L = WIN - p;
    float d = length(L);
    L /= d;
    vec3 winLight = vec3(0.85, 0.92, 1.0) * 60.0 / (d * d + 20.0);
    col += alb * max(dot(n, L), 0.0) * winLight * ao;

    // 磨かれた床に映る窓の光
    if (m < 1.5) {
      float s = pow(max(dot(reflect(rd, n), L), 0.0), 40.0);
      col += vec3(0.9, 0.85, 0.75) * s * 0.8 / (1.0 + d * 0.06);
    }

    col += vec3(3.0, 3.2, 3.5) * emit;

    // 奥ほど、暖かい色のもやにかすませる
    col = mix(col, vec3(0.10, 0.075, 0.05), 1.0 - exp(-h.x * 0.012));
  }

  // 窓のまわりのにじみ
  float g = max(dot(rd, normalize(WIN - ro)), 0.0);
  col += vec3(1.0, 0.95, 0.85) * (pow(g, 400.0) * 1.2 + pow(g, 40.0) * 0.06);

  // 明るすぎる所を丸めて、画面の色に直す
  col = 1.0 - exp(-col * 1.2);
  col = pow(col, vec3(1.0 / 2.2));
  outColor = vec4(col, 1.0);
}
