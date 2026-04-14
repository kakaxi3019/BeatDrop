import {
  MeshBuilder,
  Mesh,
  StandardMaterial,
  ShaderMaterial,
  Color3,
  Vector3,
  Effect
} from '@babylonjs/core';

import { rippleVertexShader, rippleFragmentShader } from '../shaders/ripple.js';

// Colors matching the original game
const COLORS = {
  pink: new Color3(1.0, 0.41, 0.99),    // #ff68fd
  yellow: new Color3(1.0, 0.9, 0.16),  // #ffe528
  blue: new Color3(0.08, 0.75, 0.99)    // #15befc
};
const COLOR_KEYS = ['pink', 'yellow', 'blue'];

// Segment length
const SEGMENT_LENGTH = 8;

export class TrackSegment {
  constructor(scene, type, zPosition, color) {
    this.scene = scene;
    this.type = type;
    this.position = zPosition;
    this.color = color || this.randomColor();
    this.mesh = null;
    this.material = null;
    this.blocks = [];
    this.ripples = []; // Active ripple effects

    this.create();
  }

  randomColor() {
    const key = COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
    return { key, color: COLORS[key] };
  }

  create() {
    switch (this.type) {
      case 'straight':
        this.createStraight();
        break;
      case 'double':
        this.createDouble();
        break;
      case 'triple':
        this.createTriple();
        break;
      case 'speedBoost':
        this.createSpeedBoost();
        break;
    }
  }

  createStraight() {
    // Create plane geometry for better vertex displacement
    this.mesh = MeshBuilder.CreatePlane('straight', {
      width: 6,
      height: 1.5,
      subdivisions: 32
    }, this.scene);

    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.position.set(0, 0, this.position);

    // Create ripple shader material
    this.material = this.createRippleMaterial();
    this.mesh.material = this.material;

    this.mesh.trackSegment = this;
    // Babylon.js automatically adds mesh to scene when created via MeshBuilder
  }

  createDouble() {
    const group = MeshBuilder.CreateBox('double', {
      width: 6,
      height: 0.15,
      depth: 1.5
    }, this.scene);

    // Custom shader for depression effect on double
    this.material = this.createRippleMaterial();
    group.material = this.material;
    group.position.set(0, -0.45, this.position);

    this.mesh = group;
    this.mesh.trackSegment = this;

    // Create clickable blocks
    this.createClickableBlocks(2);
  }

  createTriple() {
    const group = MeshBuilder.CreateBox('triple', {
      width: 6,
      height: 0.15,
      depth: 1.5
    }, this.scene);

    this.material = this.createRippleMaterial();
    group.material = this.material;
    group.position.set(0, -0.45, this.position);

    this.mesh = group;
    this.mesh.trackSegment = this;

    this.createClickableBlocks(3);
  }

  createClickableBlocks(count) {
    // For simplicity, we'll use a single mesh with shader-based block visualization
    // The actual collision detection happens in Game.js based on ball X position
  }

  createSpeedBoost() {
    const group = MeshBuilder.CreateBox('speedBoost', {
      width: 6,
      height: 0.15,
      depth: 1.5
    }, this.scene);

    const mat = new StandardMaterial('speedBoostMat', this.scene);
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.diffuseColor = new Color3(1, 1, 1);
    mat.specularColor = new Color3(0.5, 0.5, 0.5);
    group.material = mat;
    group.position.set(0, -0.45, this.position);

    this.mesh = group;
    this.mesh.trackSegment = this;
    this.isSpeedBoost = true;
  }

  createRippleMaterial() {
    // Register shaders with Babylon.js Effect.ShadersStore
    const shaderName = 'trackRipple';

    // Register custom shaders
    Effect.ShadersStore[`${shaderName}VertexShader`] = rippleVertexShader;
    Effect.ShadersStore[`${shaderName}FragmentShader`] = rippleFragmentShader;

    const mat = new ShaderMaterial(shaderName, this.scene, {
      vertex: shaderName,
      fragment: shaderName
    }, {
      attributes: ['position', 'normal', 'uv'],
      uniforms: [
        'worldViewProjection', 'world',
        'uTime', 'uImpactTime', 'uColor',
        'uEmissiveIntensity', 'uDepressAmount',
        'uDepressDuration', 'uWaveSpeed', 'uWaveMaxRadius'
      ]
    });

    mat.setColor3('uColor', this.color.color);
    mat.setFloat('uTime', 0);
    mat.setFloat('uImpactTime', -100); // No impact initially
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
  }

  update(time) {
    if (this.material && this.material.setFloat) {
      this.material.setFloat('uTime', time);
    }
  }

  dispose() {
    if (this.mesh) {
      this.mesh.dispose();
    }
    if (this.material) {
      this.material.dispose();
    }
  }
}

export class TrackManager {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.segmentLength = SEGMENT_LENGTH;
    this.segmentGap = 0.3;

    // Track types configuration
    this.segmentLengths = {
      straight: SEGMENT_LENGTH,
      double: SEGMENT_LENGTH,
      triple: SEGMENT_LENGTH,
      speedBoost: SEGMENT_LENGTH
    };
  }

  initialize(levelConfig) {
    this.clear();
    this.levelConfig = levelConfig;
    this.availableTypes = levelConfig.trackTypes;

    // Create initial segments
    const firstColor = this.randomColor();
    const firstSegment = this.createSegment('straight', 0, firstColor);
    this.segments.push(firstSegment);

    let currentZ = SEGMENT_LENGTH;

    for (let i = 1; i < 25; i++) {
      const type = this.selectNextSegmentType(i);
      const segColor = type === 'straight' ? this.randomColor() : firstColor;
      const segment = this.createSegment(type, -currentZ, segColor);
      this.segments.push(segment);
      currentZ += SEGMENT_LENGTH;
    }
  }

  selectNextSegmentType(indexFromLastStraight) {
    // Every 4th segment is straight
    if (indexFromLastStraight % 4 === 0) {
      return 'straight';
    }

    const available = this.availableTypes.filter(t => t !== 'straight');
    if (available.length === 0) return 'straight';

    // 20% chance of speed boost if available
    if (available.includes('speedBoost') && Math.random() < 0.2) {
      return 'speedBoost';
    }

    // Random from other types
    const others = available.filter(t => t !== 'speedBoost');
    if (others.length > 0) {
      return others[Math.floor(Math.random() * others.length)];
    }

    return available[0];
  }

  createSegment(type, zPosition, color) {
    const segment = new TrackSegment(this.scene, type, zPosition, color);
    return segment;
  }

  randomColor() {
    const key = COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
    return { key, color: COLORS[key] };
  }

  update(allSegments, time, deltaTime) {
    // Update all segment shaders
    for (const seg of this.segments) {
      seg.update(time);
    }

    // Move segments and recycle
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      // Movement is handled by Game.js which passes updated positions
    }
  }

  recycleSegment(index, newZ) {
    const seg = this.segments[index];
    seg.dispose();

    const type = this.selectNextSegmentType(0);
    const color = type === 'straight' ? this.randomColor() : this.segments[0].color;
    this.segments[index] = this.createSegment(type, newZ, color);

    return this.segments[index];
  }

  clear() {
    for (const seg of this.segments) {
      seg.dispose();
    }
    this.segments = [];
  }
}
