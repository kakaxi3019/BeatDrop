import {
  MeshBuilder,
  StandardMaterial,
  ShaderMaterial,
  Color3,
  Effect
} from '@babylonjs/core';

import { rippleVertexShader, rippleFragmentShader, outerRippleVertexShader, outerRippleFragmentShader } from '../shaders/ripple.js';

export const COLORS = {
  pink:   new Color3(1.0, 0.41, 0.99),
  yellow: new Color3(1.0, 0.90, 0.16),
  blue:   new Color3(0.08, 0.75, 0.99)
};
const COLOR_KEYS    = ['pink', 'yellow', 'blue'];
const SEGMENT_LENGTH = 8;

// ─── Register outer-ripple shaders once ───────────────────────────────────────
let _outerRippleShadersRegistered = false;
function ensureOuterRippleShaders() {
  if (_outerRippleShadersRegistered) return;
  Effect.ShadersStore['outerRippleVertexShader']   = outerRippleVertexShader;
  Effect.ShadersStore['outerRippleFragmentShader'] = outerRippleFragmentShader;
  _outerRippleShadersRegistered = true;
}

// ─── TrackSegment ─────────────────────────────────────────────────────────────
export class TrackSegment {
  constructor(scene, type, zPosition, color, blockColors) {
    this.scene      = scene;
    this.type       = type;
    this.position   = zPosition;
    this.color      = color || this.randomColor();
    this.blockColors = blockColors || null;
    this.mesh       = null;
    this.material   = null;
    this.blocks     = [];

    // Each entry: { mesh, mat, active, elapsed }
    // Index maps directly to block index (straight/speedBoost → index 0)
    this.outerRippleStates  = [];
    this.outerRippleDuration = 0.85;

    this.create();
  }

  randomColor() {
    const key = COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
    return { key, color: COLORS[key] };
  }

  // ── Builders ───────────────────────────────────────────────────────────────

  create() {
    switch (this.type) {
      case 'straight':   this.createStraight();   break;
      case 'double':     this.createDouble();     break;
      case 'triple':     this.createTriple();     break;
      case 'speedBoost': this.createSpeedBoost(); break;
    }
  }

  createStraight() {
    this.mesh = MeshBuilder.CreateBox('straight', { width: 6, height: 0.2, depth: 1.5 }, this.scene);
    this.mesh.position.set(0, -0.1, this.position);
    this.material = this.createRippleMaterial();
    this.mesh.material = this.material;
    this.mesh.trackSegment = this;

    // One ripple for the whole straight block (6 × 1.5)
    this.outerRippleStates.push(
      this._makeRippleState(this.mesh, 6, 1.5, this.color.color)
    );
  }

  createDouble() {
    this.mesh = MeshBuilder.CreateBox('double', { width: 6, height: 0.01, depth: 1.5 }, this.scene);
    this.mesh.isVisible = false;
    this.mesh.position.set(0, -0.1, this.position);

    const blockWidth = 2.8;
    const spacing  = 3.0;
    const startX   = -1.5;

    // Guarantee one block always matches the required path colour
    const reqColor    = this.color.color;
    const allColors   = [COLORS.pink, COLORS.yellow, COLORS.blue];
    const otherColors = allColors.filter(c => !(c.r === reqColor.r && c.g === reqColor.g && c.b === reqColor.b));
    const otherColor  = otherColors[Math.floor(Math.random() * otherColors.length)];
    const colors      = [reqColor, otherColor];
    if (Math.random() > 0.5) { [colors[0], colors[1]] = [colors[1], colors[0]]; }

    for (let i = 0; i < 2; i++) {
      const mat = this.createRippleMaterial(colors[i]);

      const block = MeshBuilder.CreateBox(`doubleBlock${i}`, { width: blockWidth, height: 0.2, depth: 1.5 }, this.scene);
      block.material = mat;
      block.position.set(startX + i * spacing, 0, 0);
      block.parent = this.mesh;
      block.originalY = 0;
      block.pressing  = false;
      block.pressTime = 0;
      block.blockColor = colors[i];
      this.blocks.push(block);

      // One ripple per block, matching its own colour
      this.outerRippleStates.push(
        this._makeRippleState(block, blockWidth, 1.5, colors[i])
      );
    }
    this.mesh.trackSegment = this;
  }

  createTriple() {
    this.mesh = MeshBuilder.CreateBox('triple', { width: 6, height: 0.01, depth: 1.5 }, this.scene);
    this.mesh.isVisible = false;
    this.mesh.position.set(0, -0.1, this.position);

    const blockWidth = 1.9;
    const spacing = 2.0;
    const startX  = -2.0;
    const colors  = this.shuffleColors(3);

    for (let i = 0; i < 3; i++) {
      const mat = this.createRippleMaterial(colors[i]);

      const block = MeshBuilder.CreateBox(`tripleBlock${i}`, { width: blockWidth, height: 0.2, depth: 1.5 }, this.scene);
      block.material = mat;
      block.position.set(startX + i * spacing, 0, 0);
      block.parent = this.mesh;
      block.originalY = 0;
      block.pressing  = false;
      block.pressTime = 0;
      block.blockColor = colors[i];
      this.blocks.push(block);

      // One ripple per block
      this.outerRippleStates.push(
        this._makeRippleState(block, blockWidth, 1.5, colors[i])
      );
    }
    this.mesh.trackSegment = this;
  }

  shuffleColors(count) {
    const allColors = [COLORS.pink, COLORS.yellow, COLORS.blue];
    const shuffled = [];
    const used     = [];
    for (let i = 0; i < count; i++) {
      let idx;
      do { idx = Math.floor(Math.random() * 3); } while (used.includes(idx));
      used.push(idx);
      shuffled.push(allColors[idx]);
    }
    return shuffled;
  }

  createSpeedBoost() {
    this.mesh = MeshBuilder.CreateBox('speedBoost', { width: 6, height: 0.15, depth: 1.5 }, this.scene);
    const mat = new StandardMaterial('speedBoostMat', this.scene);
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.diffuseColor  = new Color3(1, 1, 1);
    mat.specularColor = new Color3(0.5, 0.5, 0.5);
    this.mesh.material = mat;
    this.mesh.position.set(0, -0.45, this.position);
    this.mesh.trackSegment = this;
    this.isSpeedBoost = true;
    // Ripple for speedboost uses white
    this.outerRippleStates.push(
      this._makeRippleState(this.mesh, 6, 1.5, new Color3(1, 1, 1))
    );
  }

  // ── Track depression (ripple) material ────────────────────────────────────

  createRippleMaterial(passedColor) {
    const shaderName = 'trackRipple';
    Effect.ShadersStore[`${shaderName}VertexShader`]   = rippleVertexShader;
    Effect.ShadersStore[`${shaderName}FragmentShader`] = rippleFragmentShader;

    const mat = new ShaderMaterial(shaderName, this.scene, {
      vertex: shaderName, fragment: shaderName
    }, {
      attributes: ['position', 'normal', 'uv'],
      uniforms: ['worldViewProjection', 'world', 'uTime', 'uImpactTime', 'uColor',
                 'uEmissiveIntensity', 'uDepressAmount', 'uDepressDuration', 'uWaveSpeed', 'uWaveMaxRadius']
    });
    mat.setColor3('uColor', passedColor || this.color.color);
    mat.setFloat('uTime', 0);
    mat.setFloat('uImpactTime', -100);
    mat.setFloat('uEmissiveIntensity', 0.5);
    mat.setFloat('uDepressAmount', 0.25);
    mat.setFloat('uDepressDuration', 0.4);
    mat.setFloat('uWaveSpeed', 8.0);
    mat.setFloat('uWaveMaxRadius', 6.0);
    mat.backFaceCulling = false;
    return mat;
  }

  triggerRipple(time) {
    if (this.material && this.material.setFloat) {
      this.material.setFloat('uImpactTime', time);
      this.material.setFloat('uTime', time);
    }
    for (const block of this.blocks) {
      if (block.material && block.material.setFloat) {
        block.material.setFloat('uImpactTime', time);
        block.material.setFloat('uTime', time);
      }
    }
  }

  // ── Outer expanding ripple ─────────────────────────────────────────────────

  /**
   * Creates a flat spread-plane parented to `parentMesh`.
   * Dimensions are in WORLD UNITS so the shader can compute exact rect SDF.
   *
   * @param {Mesh}   parentMesh - the block or track mesh to attach to
   * @param {number} blockW     - parent block width  (world units)
   * @param {number} blockD     - parent block depth  (world units)
   * @param {Color3} color      - glow colour
   * @returns {{ mesh, mat, active, elapsed }}
   */
  _makeRippleState(parentMesh, blockW, blockD, color) {
    ensureOuterRippleShaders();

    const spreadMargin = 10.0;               // Expanded significantly to allow massive aura glow
    const planeW = blockW + spreadMargin * 2; // enough room for the ring to travel
    const planeD = blockD + spreadMargin * 2;

    const mat = new ShaderMaterial('outerRipple', this.scene, {
      vertex: 'outerRipple', fragment: 'outerRipple'
    }, {
      attributes: ['position', 'normal', 'uv'],
      uniforms: ['worldViewProjection',
                 'uElapsed', 'uDuration', 'uColor',
                 'uPlaneHalfW', 'uPlaneHalfD',
                 'uBlockHalfW', 'uBlockHalfD']
    });

    const c = (color instanceof Color3) ? color : new Color3(color.r, color.g, color.b);
    mat.setFloat('uElapsed',    -1.0);                  // hidden until triggered
    mat.setFloat('uDuration',   this.outerRippleDuration);
    mat.setColor3('uColor',     c);
    mat.setFloat('uPlaneHalfW', planeW / 2);
    mat.setFloat('uPlaneHalfD', planeD / 2);
    mat.setFloat('uBlockHalfW', blockW / 2);
    mat.setFloat('uBlockHalfD', blockD / 2);
    mat.backFaceCulling = false;
    mat.alphaMode = 1;                                  // ALPHA_ADD (Additive rendering prevents occlusion)
    mat.disableDepthWrite = true;                       // Prevent z-buffer occlusion
    mat.needAlphaBlending = () => true;

    // A simple low-poly plane is all we need for a flat soft glow
    const plane = MeshBuilder.CreateBox('outerRipplePlane', {
      width:  planeW,
      height: 0.01,
      depth:  planeD
    }, this.scene);

    plane.material   = mat;
    plane.parent     = parentMesh;
    // Local Y: Place it slightly below the track top surface to avoid z-fighting and let the glow sit behind/under
    plane.position.set(0, -0.05, 0); 
    plane.isPickable = false;

    return { mesh: plane, mat, active: false, elapsed: 0 };
  }

  /**
   * Trigger the outward ripple for the block at `blockIndex`.
   * For straight/speedBoost use blockIndex = 0.
   * For double use 0 or 1; for triple use 0, 1 or 2.
   */
  triggerOuterRipple(blockIndex = 0) {
    const state = this.outerRippleStates[blockIndex];
    if (!state) return;
    state.active  = true;
    state.elapsed = 0;
    state.mat.setFloat('uElapsed', 0.0);
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  update(time, dt) {
    // Track depression shader
    if (this.material && this.material.setFloat) {
      this.material.setFloat('uTime', time);
    }
    for (const block of this.blocks) {
      if (block.material && block.material.setFloat) {
        block.material.setFloat('uTime', time);
      }
    }

    // Block press animation (double / triple)
    for (const block of this.blocks) {
      if (block.pressing) {
        block.pressTime += dt;
        const pressDuration = 0.15;
        const pressDepth    = 0.25;
        if (block.pressTime < pressDuration) {
          const t = block.pressTime / pressDuration;
          const yOffset = t < 0.3
            ? (t / 0.3) * pressDepth
            : (1.0 - (t - 0.3) / 0.7) * pressDepth;
          block.position.y = block.originalY - yOffset;
          block.material.emissiveIntensity = 0.5 + yOffset * 2.0;
        } else {
          block.pressing = false;
          block.position.y = block.originalY;
          block.material.emissiveIntensity = 0.5;
        }
      }
    }

    // Outer ripple animations (all active states)
    for (const state of this.outerRippleStates) {
      if (!state.active) continue;
      state.elapsed += dt;
      if (state.elapsed >= this.outerRippleDuration) {
        state.active = false;
        state.mat.setFloat('uElapsed', -1.0);  // deactivate / hide
      } else {
        state.mat.setFloat('uElapsed', state.elapsed);
      }
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  dispose() {
    for (const state of this.outerRippleStates) {
      if (state.mesh) state.mesh.dispose();
      if (state.mat)  state.mat.dispose();
    }
    this.outerRippleStates = [];

    if (this.mesh)     this.mesh.dispose();
    if (this.material) this.material.dispose();
    for (const block of this.blocks) block.dispose();
    this.blocks = [];
  }
}

// ─── TrackManager ─────────────────────────────────────────────────────────────
export class TrackManager {
  constructor(scene) {
    this.scene        = scene;
    this.segments     = [];
    this.segmentLength = SEGMENT_LENGTH;
    this.segmentGap   = 0.3;
    this.pathColor    = null;
  }

  initialize(levelConfig) {
    this.clear();
    this.levelConfig    = levelConfig;
    this.availableTypes = levelConfig.trackTypes;
    this.pathColor      = null;
    this.blocksSinceLastStraight = 0;

    const firstColor = this.randomColor();
    this.pathColor   = firstColor.color;
    this.segments.push(this.createSegment('straight', 0, firstColor));

    let currentZ = SEGMENT_LENGTH + this.segmentGap;
    for (let i = 1; i < 25; i++) {
      const type = this.selectNextSegmentType();
      let segColor;
      if (type === 'straight') {
        segColor = this.randomColor();
        this.pathColor = segColor.color;
      } else {
        segColor = { key: null, color: this.pathColor };
      }
      this.segments.push(this.createSegment(type, -currentZ, segColor));
      currentZ += SEGMENT_LENGTH + this.segmentGap;
    }
  }

  selectNextSegmentType() {
    this.blocksSinceLastStraight++;
    if (this.blocksSinceLastStraight % 4 === 0) {
      this.blocksSinceLastStraight = 0;
      return 'straight';
    }
    const available = this.availableTypes.filter(t => t !== 'straight');
    if (available.length === 0) return 'straight';
    if (available.includes('speedBoost') && Math.random() < 0.2) {
      // Don't reset counter for speed boost, it replaces a complex block
      return 'speedBoost';
    }
    const others = available.filter(t => t !== 'speedBoost');
    if (others.length > 0) return others[Math.floor(Math.random() * others.length)];
    return available[0];
  }

  createSegment(type, zPosition, color) {
    const blockColors = (type === 'double' || type === 'triple')
      ? this.shuffleColors(type === 'triple' ? 3 : 2)
      : null;
    return new TrackSegment(this.scene, type, zPosition, color, blockColors);
  }

  shuffleColors(count) {
    const allColors = [COLORS.pink, COLORS.yellow, COLORS.blue];
    const shuffled  = [];
    const used      = [];
    for (let i = 0; i < count; i++) {
      let idx;
      do { idx = Math.floor(Math.random() * 3); } while (used.includes(idx));
      used.push(idx);
      shuffled.push(allColors[idx]);
    }
    return shuffled;
  }

  randomColor() {
    const key = COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
    return { key, color: COLORS[key] };
  }

  recycleSegment(index, newZ) {
    this.segments[index].dispose();

    const type = this.selectNextSegmentType();
    let color;
    if (type === 'straight') {
      color = this.randomColor();
      this.pathColor = color.color;
    } else {
      color = { key: null, color: this.pathColor };
    }

    const newSeg = this.createSegment(type, newZ, color);
    this.segments[index] = newSeg;
    return newSeg;
  }

  clear() {
    for (const seg of this.segments) seg.dispose();
    this.segments = [];
  }
}
