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
