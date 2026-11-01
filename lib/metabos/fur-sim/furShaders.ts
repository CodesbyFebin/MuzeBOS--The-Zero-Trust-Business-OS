/**
 * Clean-room fur shaders. Lighting is a Marschner-style approximation: R (primary specular, shifted toward the
 * root), TRT (secondary, tinted, shifted toward the tip), TT (transmission when back-lit), Beer-Lambert depth
 * shadow through the shell stack, and follicle AO near the skin. Written for three.js ShaderMaterial (GLSL ES 3).
 */
export const HAIR_LIGHTING = /* glsl */ `
uniform vec3 uRoot; uniform vec3 uTip; uniform vec3 uSpecCol;
uniform vec3 uKeyDir; uniform vec3 uKeyCol; uniform float uKey;
uniform vec3 uRimDir; uniform vec3 uRimCol; uniform float uRim;
uniform vec3 uAmbSky; uniform vec3 uAmbGround; uniform float uAmb;
uniform float uRough; uniform float uSpec;
float lobe(float x, float w) { return exp(-x * x / (2.0 * w * w)); }
vec3 marschner(vec3 T, vec3 V, vec3 L, vec3 albedo, float h) {
  float sinL = clamp(dot(T, L), -1.0, 1.0), sinV = clamp(dot(T, V), -1.0, 1.0);
  float thL = asin(sinL), thV = asin(sinV); float thH = 0.5 * (thL + thV);
  float alpha = radians(-5.0); float beta = mix(0.08, 0.45, uRough);
  float R = lobe(thH - alpha, beta);
  float TRT = lobe(thH + 1.5 * alpha, beta * 2.0);
  vec3 Lp = normalize(L - sinL * T), Vp = normalize(V - sinV * T); float cosPhi = dot(Lp, Vp);
  float TT = pow(max(0.0, -cosPhi), 6.0) * lobe(thH, beta * 0.5);
  float diffuse = sqrt(max(0.0, 1.0 - sinL * sinL)) * 0.5 + 0.15; // Kajiya-Kay diffuse
  float shadow = exp(-2.2 * (1.0 - h)); // Beer-Lambert through the coat
  vec3 col = albedo * diffuse * shadow + uSpec * (uSpecCol * R * 0.6 + albedo * TRT * 0.45) * mix(0.3, 1.0, h) + albedo * TT * 0.9;
  return col;
}
vec3 shadeHair(vec3 T, vec3 N, vec3 V, vec3 albedo, float h) {
  vec3 c = marschner(T, V, normalize(uKeyDir), albedo, h) * uKeyCol * uKey;
  c += marschner(T, V, normalize(uRimDir), albedo, h) * uRimCol * uRim;
  c += albedo * mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5) * uAmb;
  float ao = mix(0.25, 1.0, smoothstep(0.0, 0.6, h)); // follicle AO
  return c * ao;
}`;

const PHYS = /* glsl */ `
uniform sampler2D uPhys; uniform float uLen; uniform float uCurl; uniform float uTime;
vec3 physOffset(vec2 uv) { return texture(uPhys, uv).xyz; }`;

export const SHELL_VERT = /* glsl */ `
${PHYS}
in float aLayer; // instanced 0..1
out vec2 vUv; out float vH; out vec3 vN; out vec3 vT; out vec3 vView;
uniform float uBounce;
void main() {
  vUv = uv; vH = aLayer; vec3 n = normalize(normal);
  vec3 d = physOffset(uv);
  vec3 curl = uCurl * 0.25 * uLen * vec3(sin(uv.y * 80.0 + aLayer * 6.0), 0.0, cos(uv.x * 80.0 + aLayer * 6.0));
  vec3 p = position + n * uLen * aLayer + (d + curl) * aLayer * aLayer;
  vT = normalize(n * uLen + (d + curl) * 2.0 * aLayer);
  vN = normalize(mat3(modelMatrix) * n); vT = normalize(mat3(modelMatrix) * vT);
  vec4 wp = modelMatrix * vec4(p, 1.0); vView = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const SHELL_FRAG = /* glsl */ `
precision highp float;
${HAIR_LIGHTING}
uniform float uDensity; uniform float uClump;
in vec2 vUv; in float vH; in vec3 vN; in vec3 vT; in vec3 vView;
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 g = vUv * vec2(uDensity * 2.0, uDensity);
  vec2 cell = floor(g); vec2 f = fract(g) - 0.5;
  vec2 clumpCell = floor(g / 6.0); vec2 toClump = (vec2(hash(clumpCell), hash(clumpCell + 7.0)) - 0.5) * uClump * vH * 0.8;
  float r = hash(cell);
  float strandLen = 0.55 + 0.45 * r;
  if (vH > strandLen) discard;
  float radius = 0.48 * (1.0 - vH / strandLen);
  if (length(f + toClump) > radius && vH > 0.02) discard;
  vec3 albedo = mix(uRoot, uTip, smoothstep(0.0, 1.0, vH / strandLen));
  vec3 c = shadeHair(normalize(vT), normalize(vN), normalize(vView), albedo, vH / strandLen);
  outColor = vec4(c, 1.0);
}`;

export const STRAND_VERT = /* glsl */ `
${PHYS}
in float aSeg; in float aSide; // base ribbon
in vec3 aRoot; in vec3 aNormal; in vec2 aUv; in vec3 aClump; in float aRand; // per strand
uniform float uWidth;
out float vH; out vec3 vT; out vec3 vN; out vec3 vView;
vec3 strandPoint(float t) {
  vec3 d = physOffset(aUv);
  float L = uLen * (0.7 + 0.6 * aRand);
  vec3 curl = uCurl * L * 0.35 * vec3(sin(t * 12.0 + aRand * 40.0), 0.0, cos(t * 12.0 + aRand * 40.0)) * t;
  return aRoot + aNormal * L * t + (d * 1.2 + aClump) * t * t + curl;
}
void main() {
  float t = aSeg; vH = t;
  vec3 p = strandPoint(t); vec3 p2 = strandPoint(min(1.0, t + 0.05)) - strandPoint(max(0.0, t - 0.05));
  vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz; vec3 T = normalize(mat3(modelMatrix) * p2);
  vec3 V = normalize(cameraPosition - wp);
  vec3 side = normalize(cross(T, V)); // camera-facing cylindrical billboard
  wp += side * aSide * uWidth * (1.0 - 0.9 * t);
  vT = T; vN = normalize(mat3(modelMatrix) * aNormal); vView = V;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

export const STRAND_FRAG = /* glsl */ `
precision highp float;
${HAIR_LIGHTING}
in float vH; in vec3 vT; in vec3 vN; in vec3 vView; out vec4 outColor;
void main() { vec3 albedo = mix(uRoot, uTip, vH); outColor = vec4(shadeHair(normalize(vT), normalize(vN), normalize(vView), albedo, vH), 1.0); }`;

/** GPGPU Verlet step (same maths as physics.ts). Runs in GPUComputationRenderer; texPos = current, texPrev = previous. */
export const PHYS_POS_FRAG = /* glsl */ `
uniform float uDt; uniform float uTime; uniform float uK; uniform float uDamp; uniform float uGrav; uniform float uWind;
uniform vec3 uInertia; uniform vec4 uPet; uniform vec3 uPetDir; uniform vec3 uBoop; uniform float uMax;
vec3 restN(vec2 uv) { float th = uv.x * 6.2831853, ph = uv.y * 3.1415927; return vec3(-cos(th) * sin(ph), cos(ph), sin(th) * sin(ph)); }
float uvDist(vec2 a, vec2 b) { float du = abs(a.x - b.x); du = min(du, 1.0 - du); return length(vec2(du * 2.0, a.y - b.y)); }
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy; vec3 N = restN(uv);
  vec3 d = texture2D(texPos, uv).xyz; vec3 o = texture2D(texPrev, uv).xyz;
  vec3 a = -uK * d; vec3 g = vec3(0.0, -uGrav, 0.0); a += g - dot(g, N) * N; a -= uInertia;
  a += uWind * vec3((sin(uTime * 1.7 + uv.y * 9.0 + uv.x * 3.0) * 0.6 + 0.4) * 3.0, 0.0, sin(uTime * 2.3 + uv.x * 11.0) * 1.5);
  if (uPet.w > 0.0) a += uPetDir * max(0.0, 1.0 - uvDist(uv, uPet.xy) / uPet.z) * 400.0;
  if (uBoop.z >= 0.0) { float dist = uvDist(uv, uBoop.xy); float w = exp(-pow(dist - uBoop.z * 2.5, 2.0) * 60.0) * exp(-uBoop.z * 3.0); a += N * w * 60.0; }
  vec3 nx = d + (d - o) * (1.0 - uDamp) + a * uDt * uDt;
  float len = length(nx); if (len > uMax * 0.9) nx *= uMax * 0.9 / len;
  float inward = dot(nx, N); if (inward < -uMax * 0.5) nx -= N * (inward + uMax * 0.5);
  gl_FragColor = vec4(nx, 1.0);
}`;
export const PHYS_PREV_FRAG = /* glsl */ `void main() { vec2 uv = gl_FragCoord.xy / resolution.xy; gl_FragColor = texture2D(texPos, uv); }`;
