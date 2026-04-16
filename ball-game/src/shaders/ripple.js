// Ripple shader for track depression + wave propagation
// Depression animation first, then ripple waves expand outward with feathered edges

export const rippleVertexShader = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform mat4 worldViewProjection;
uniform float uTime;
uniform float uImpactTime;
uniform float uDepressAmount;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
  vUv = uv;
  vNormal = normal;

  vec3 pos = position;
  float timeSinceImpact = uTime - uImpactTime;

  float pressDuration = 0.15; 
  if (timeSinceImpact > 0.0 && timeSinceImpact < pressDuration) {
    float t = timeSinceImpact / pressDuration;
    float vDepress = 0.0;
    
    // Fast mechanical press down (30% in), rapid return (70% out)
    if (t < 0.3) {
      vDepress = -uDepressAmount * (t / 0.3);
    } else {
      vDepress = -uDepressAmount * (1.0 - (t - 0.3) / 0.7);
    }
    pos.y += vDepress;
  }

  gl_Position = worldViewProjection * vec4(pos, 1.0);
}
`;

export const rippleFragmentShader = `
precision highp float;

uniform vec3 uColor;
uniform float uTime;
uniform float uImpactTime;
uniform float uEmissiveIntensity;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
  float timeSinceImpact = uTime - uImpactTime;
  vec3 color = uColor;

  float pressDuration = 0.15;
  float emissive = uEmissiveIntensity;

  // Add a small brightness boost at the bottom of the keypress
  if (timeSinceImpact > 0.0 && timeSinceImpact < pressDuration) {
    float t = timeSinceImpact / pressDuration;
    float intensity = 0.0;
    if (t < 0.3) {
      intensity = t / 0.3;
    } else {
      intensity = 1.0 - (t - 0.3) / 0.7;
    }
    emissive += intensity * 0.5; // brightens slightly during the press
  }

  // Rim lighting
  float rim = 1.0 - max(0.0, dot(normalize(vNormal), vec3(0.0, 1.0, 0.0)));
  rim = pow(rim, 2.5);
  color += uColor * rim * 0.25;

  vec3 finalColor = color * emissive;
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Rectangular outer-ripple shader
// This is used on a separate flat plane (parent = track mesh) that is slightly
// larger than the track.  The ripple "ring" starts at the mesh inner edge and
// expands outward with a feathered (smooth) tail.
//
// UV convention expected:
//   This shader uses a custom "distance-to-inner-rect" approach encoded via
//   a uniform.  The plane itself is sized to cover the maximum spread radius
//   and the track dimensions are passed in as uniforms so the shader can
//   compute the signed distance from the track boundary.
// ─────────────────────────────────────────────────────────────────────────────

export const outerRippleVertexShader = `
precision highp float;

attribute vec3 position;
uniform mat4 worldViewProjection;

varying vec3 vLocalPos;

void main() {
  vLocalPos = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

export const outerRippleFragmentShader = `
precision highp float;

uniform float uElapsed;
uniform float uDuration;
uniform vec3  uColor;

uniform float uBlockHalfW;
uniform float uBlockHalfD;

varying vec3 vLocalPos;

// Pseudo-random noise for sparkle texture
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

// L4-Norm super-ellipse SDF for rectangular borders
float superEllipseDist(vec2 p, float halfW, float halfD) {
    vec2 q = abs(p) - vec2(halfW, halfD);
    vec2 qPos = max(q, 0.0);
    vec2 q2 = qPos * qPos;
    return sqrt(sqrt(q2.x * q2.x + q2.y * q2.y));
}

// Single ring contribution: ring at given phase (0-1), with its own expand & fade
float ringAtPhase(float dist, float phase, float maxExpand) {
    // Each ring expands from inner edge outward
    float ringRadius = phase * maxExpand;
    float ringWidth  = 0.15 + phase * 0.1; // ring gets slightly wider as it expands

    // Smooth ring band
    float ring = 1.0 - smoothstep(ringRadius - ringWidth, ringRadius + ringWidth, dist);

    // Fade: rings fade as they travel outward
    float fade = 1.0 - smoothstep(0.0, 1.0, phase);

    return ring * fade;
}

void main() {
  if (uElapsed < 0.0) discard;

  float progress = uElapsed / uDuration; // 0.0 to 1.0

  // Distance from block inner edge in local space (super-ellipse rect)
  float dist = superEllipseDist(vec2(vLocalPos.x, vLocalPos.z), uBlockHalfW, uBlockHalfD);

  float maxExpand = 8.0;

  // Single ring
  float ring = ringAtPhase(dist, progress, maxExpand);

  // Subtle sparkle texture
  float noise = random(vLocalPos.xz * 80.0 + uElapsed * 2.0);
  float sparkle = 0.8 + noise * 0.4;

  // Compose rings
  float rings = ring * sparkle;

  // Overall envelope fade (CSS uses 2s duration, fade starts early)
  float fadeOut = 1.0 - smoothstep(0.5, 1.0, progress);

  float alpha = rings * fadeOut * 0.05;

  if (alpha < 0.005) discard;

  gl_FragColor = vec4(uColor * 1.5, alpha);
}
`;
