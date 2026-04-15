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

// Pseudo-random noise to mimic scattered particles
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

void main() {
  if (uElapsed < 0.0) discard;

  float progress  = uElapsed / uDuration; // 0.0 to 1.0
  
  // 1. Grand expansion spanning much wider (but kept faint by our transparency)
  float currentRadius = progress * 7.5 + 0.2;
  
  // L4-Norm super-ellipse distance
  // This maintains highly rectangular, blocky borders (unlike standard circular Euclidean SDF),
  // but perfectly smooths the 90-degree corners to completely eliminate the diagonal artifact 
  // lines caused by the gradient snapping in standard max(x,y) Chebyshev boundaries.
  vec2 q = abs(vec2(vLocalPos.x, vLocalPos.z)) - vec2(uBlockHalfW, uBlockHalfD);
  vec2 qPos = max(q, 0.0);
  vec2 q2 = qPos * qPos;
  float dist = sqrt(sqrt(q2.x * q2.x + q2.y * q2.y));

  // 2. Base soft glow
  float glow = 1.0 - smoothstep(0.0, currentRadius, dist);
  
  // 3. Very subtle and clean particle dissolve
  float noise = random(vLocalPos.xz * 120.0);
  
  // Widened smoothstep for a much gentler, cleaner dissolve rather than harsh holes
  float particleMask = smoothstep(noise - 0.2, noise + 0.5, glow * 1.5);

  // Faster fade out to keep the visual screen clean and non-cluttered
  float fadeOut = 1.0 - smoothstep(0.0, 0.8, progress);
  
  // 4. Extreme transparency for a faint, pale aesthetic
  float alpha = pow(glow, 2.2) * particleMask * fadeOut * 0.20; 

  if (alpha < 0.005) discard;

  float brightness = 1.0;

  gl_FragColor = vec4(uColor * brightness, alpha);
}
`;
