// Ripple shader for track depression + wave propagation
// Depression animation first, then ripple waves expand outward with feathered edges

export const rippleVertexShader = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform mat4 worldViewProjection;
uniform mat4 world;
uniform float uTime;
uniform float uImpactTime;
uniform float uDepressAmount;
uniform float uDepressDuration;
uniform float uWaveSpeed;
uniform float uWaveMaxRadius;

varying vec2 vUv;
varying vec3 vNormal;
varying float vDepress;
varying float vWaveIntensity;
varying float vDistance;

void main() {
  vUv = uv;
  vNormal = normal;

  vec3 pos = position;
  float timeSinceImpact = uTime - uImpactTime;

  // Calculate distance from center (impact point at origin)
  vDistance = length(pos.xz);

  // Phase 1: Depression animation (first 40% of duration)
  vDepress = 0.0;
  vWaveIntensity = 0.0;

  if (timeSinceImpact > 0.0 && timeSinceImpact < uDepressDuration * 0.4) {
    // Smooth depression curve with ease-out
    float t = timeSinceImpact / (uDepressDuration * 0.4);
    t = 1.0 - (1.0 - t) * (1.0 - t);
    vDepress = -uDepressAmount * t;

    // Bounce-back (subtle spring)
    float bouncePhase = (timeSinceImpact - uDepressDuration * 0.15) / (uDepressDuration * 0.25);
    if (bouncePhase > 0.0 && bouncePhase < 1.0) {
      float bounce = sin(bouncePhase * 3.14159) * exp(-bouncePhase * 4.0);
      vDepress -= bounce * uDepressAmount * 0.2;
    }

    pos.y += vDepress;
  }

  // Phase 2: Ripple wave propagation
  float waveRadius = timeSinceImpact * uWaveSpeed;
  if (timeSinceImpact > 0.05 && vDistance < waveRadius) {
    float distFromFront = waveRadius - vDistance;
    float waveWidth = 0.6;

    // Feathered wave front using Gaussian-like falloff
    float waveFront = exp(-distFromFront * distFromFront / (waveWidth * waveWidth));

    // Radial and temporal fade
    float radiusFade = 1.0 - smoothstep(uWaveMaxRadius * 0.4, uWaveMaxRadius, waveRadius);
    float timeFade = 1.0 - clamp((timeSinceImpact - uDepressDuration * 0.3) / 0.8, 0.0, 1.0);

    vWaveIntensity = waveFront * radiusFade * timeFade;

    // Add vertical displacement at wave front
    if (distFromFront < waveWidth * 2.0) {
      float waveDisplace = vWaveIntensity * 0.12 * sin(vDistance * 6.0 - timeSinceImpact * 15.0);
      pos.y += waveDisplace;
    }
  }

  // Phase 3: Surface settling
  if (timeSinceImpact > uDepressDuration) {
    float settleT = (timeSinceImpact - uDepressDuration) / 0.6;
    if (settleT < 1.0) {
      float settle = exp(-settleT * 3.5) * 0.015;
      pos.y += sin(vDistance * 12.0 + settleT * 8.0) * settle;
    }
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
varying float vDepress;
varying float vWaveIntensity;
varying float vDistance;

void main() {
  float timeSinceImpact = uTime - uImpactTime;

  // Base color
  vec3 color = uColor;

  // Impact flash
  float flashIntensity = 0.0;
  if (timeSinceImpact > 0.0 && timeSinceImpact < 0.12) {
    float t = timeSinceImpact / 0.12;
    flashIntensity = (1.0 - t) * (1.0 - t);
    color = mix(color, vec3(1.0, 0.95, 0.9), flashIntensity * 0.5);
  }

  // Depression glow (rim effect)
  float depressGlow = 0.0;
  if (timeSinceImpact > 0.0 && timeSinceImpact < 0.35) {
    float t = timeSinceImpact / 0.35;
    float rimDist = abs(vDistance - 0.6);
    depressGlow = exp(-rimDist * 2.5) * (1.0 - t) * 0.6;
    color += vec3(1.0, 0.85, 0.5) * depressGlow;
  }

  // Expanding ripple wave with feathered edge
  float waveGlow = 0.0;
  float edgeGlow = 0.0;
  float waveRadius = timeSinceImpact * 8.0;

  if (timeSinceImpact > 0.08 && vDistance < waveRadius) {
    float distFromFront = waveRadius - vDistance;
    float waveWidth = 0.5;

    // Main wave front
    float waveFront = exp(-distFromFront * distFromFront / (waveWidth * waveWidth));

    // Secondary interference wave
    float wave2 = sin(vDistance * 12.0 - timeSinceImpact * 25.0) * 0.3 + 0.7;

    // Feathered edge gradient
    float edgeDist = distFromFront / (waveWidth * 2.0);
    float feather = 1.0 - smoothstep(0.0, 1.0, edgeDist);

    // Fades
    float radiusFade = 1.0 - smoothstep(3.0, 6.0, waveRadius);
    float timeFade = 1.0 - smoothstep(0.2, 1.0, timeSinceImpact - 0.1);

    waveGlow = waveFront * wave2 * feather * radiusFade * timeFade;

    // Bright edge highlight at wave front
    edgeGlow = waveFront * feather * radiusFade * timeFade * 1.2;

    // Wave color gradient (warm center, cool edges)
    vec3 waveColor = mix(vec3(1.0, 0.92, 0.7), vec3(0.5, 0.85, 1.0), waveFront * feather);
    color = mix(color, waveColor, waveGlow * 0.65);

    // Add bright edge highlight
    color += vec3(1.0, 0.97, 0.88) * edgeGlow * 0.7;
  }

  // Surface settling glow
  float settleGlow = 0.0;
  if (timeSinceImpact > 0.45 && timeSinceImpact < 1.1) {
    float settleT = (timeSinceImpact - 0.45) / 0.65;
    settleGlow = exp(-settleT * 3.5) * 0.15 * (1.0 - smoothstep(0.0, 2.0, vDistance));
    color += vec3(1.0, 0.92, 0.75) * settleGlow;
  }

  // Final emissive calculation
  float emissive = uEmissiveIntensity;
  emissive += flashIntensity * 1.8;
  emissive += depressGlow * 0.9;
  emissive += vWaveIntensity * 1.5;
  emissive += waveGlow * 0.7;
  emissive += settleGlow * 0.5;

  // Rim lighting
  float rim = 1.0 - max(0.0, dot(normalize(vNormal), vec3(0.0, 1.0, 0.0)));
  rim = pow(rim, 2.5);
  color += uColor * rim * 0.25;

  // Final color
  vec3 finalColor = color * (0.55 + emissive);

  gl_FragColor = vec4(finalColor, 1.0);
}
`;
