import {
  MeshBuilder,
  Mesh,
  StandardMaterial,
  ShaderMaterial,
  Color3,
  Effect
} from '@babylonjs/core';

import { rippleVertexShader, rippleFragmentShader } from '../shaders/ripple.js';

export const COLORS = {
  pink: new Color3(1.0, 0.41, 0.99),
  yellow: new Color3(1.0, 0.9, 0.16),
  blue: new Color3(0.08, 0.75, 0.99)
};
const COLOR_KEYS = ['pink', 'yellow', 'blue'];
const SEGMENT_LENGTH = 8;

export class TrackSegment {
  constructor(scene, type, zPosition, color, blockColors) {
    this.scene = scene;
    this.type = type;
    this.position = zPosition;
    this.color = color || this.randomColor();
    this.blockColors = blockColors || null;
    this.mesh = null;
    this.material = null;
    this.blocks = [];
    this.create();
  }

  randomColor() {
    const key = COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
    return { key, color: COLORS[key] };
  }

  create() {
    switch (this.type) {
      case 'straight': this.createStraight(); break;
      case 'double': this.createDouble(); break;
      case 'triple': this.createTriple(); break;
      case 'speedBoost': this.createSpeedBoost(); break;
    }
  }

  createStraight() {
    this.mesh = MeshBuilder.CreatePlane('straight', { width: 6, height: 1.5, subdivisions: 32 }, this.scene);
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.position.set(0, 0, this.position);
    this.material = this.createRippleMaterial();
    this.mesh.material = this.material;
    this.mesh.trackSegment = this;
  }

  createDouble() {
    this.mesh = MeshBuilder.CreateBox('double', { width: 6, height: 0.01, depth: 1.5 }, this.scene);
    this.mesh.position.set(0, -0.5, this.position);

    const blockWidth = 2.0;
    const spacing = 2.5;
    const startX = -1.25;
    const colors = this.shuffleColors(2);

    for (let i = 0; i < 2; i++) {
      const mat = new StandardMaterial(`doubleBlock${i}`, this.scene);
      mat.diffuseColor = colors[i];
      mat.emissiveColor = colors[i].scale(0.5);
      mat.specularColor = new Color3(0.3, 0.3, 0.3);

      const block = MeshBuilder.CreateBox(`doubleBlock${i}`, { width: blockWidth, height: 0.15, depth: 1.5 }, this.scene);
      block.material = mat;
      block.position.set(startX + i * spacing, -0.45, 0);
      block.parent = this.mesh;

      block.originalY = -0.45;
      block.pressing = false;
      block.pressTime = 0;
      this.blocks.push(block);
    }
    this.mesh.trackSegment = this;
  }

  createTriple() {
    this.mesh = MeshBuilder.CreateBox('triple', { width: 6, height: 0.01, depth: 1.5 }, this.scene);
    this.mesh.position.set(0, -0.5, this.position);

    const blockWidth = 2.0;
    const spacing = 2.2;
    const startX = -2.2;
    const colors = this.shuffleColors(3);

    for (let i = 0; i < 3; i++) {
      const mat = new StandardMaterial(`tripleBlock${i}`, this.scene);
      mat.diffuseColor = colors[i];
      mat.emissiveColor = colors[i].scale(0.5);
      mat.specularColor = new Color3(0.3, 0.3, 0.3);

      const block = MeshBuilder.CreateBox(`tripleBlock${i}`, { width: blockWidth, height: 0.15, depth: 1.5 }, this.scene);
      block.material = mat;
      block.position.set(startX + i * spacing, -0.45, 0);
      block.parent = this.mesh;

      block.originalY = -0.45;
      block.pressing = false;
      block.pressTime = 0;
      this.blocks.push(block);
    }
    this.mesh.trackSegment = this;
  }

  shuffleColors(count) {
    const allColors = [COLORS.pink, COLORS.yellow, COLORS.blue];
    const shuffled = [];
    const used = [];
    for (let i = 0; i < count; i++) {
      let idx;
      do {
        idx = Math.floor(Math.random() * 3);
      } while (used.includes(idx));
      used.push(idx);
      shuffled.push(allColors[idx]);
    }
    return shuffled;
  }

  createSpeedBoost() {
    this.mesh = MeshBuilder.CreateBox('speedBoost', { width: 6, height: 0.15, depth: 1.5 }, this.scene);
    const mat = new StandardMaterial('speedBoostMat', this.scene);
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.diffuseColor = new Color3(1, 1, 1);
    mat.specularColor = new Color3(0.5, 0.5, 0.5);
    this.mesh.material = mat;
    this.mesh.position.set(0, -0.45, this.position);
    this.mesh.trackSegment = this;
    this.isSpeedBoost = true;
  }

  createRippleMaterial() {
    const shaderName = 'trackRipple';
    Effect.ShadersStore[`${shaderName}VertexShader`] = rippleVertexShader;
    Effect.ShadersStore[`${shaderName}FragmentShader`] = rippleFragmentShader;

    const mat = new ShaderMaterial(shaderName, this.scene, {
      vertex: shaderName, fragment: shaderName
    }, {
      attributes: ['position', 'normal', 'uv'],
      uniforms: ['worldViewProjection', 'world', 'uTime', 'uImpactTime', 'uColor',
                 'uEmissiveIntensity', 'uDepressAmount', 'uDepressDuration', 'uWaveSpeed', 'uWaveMaxRadius']
    });

    mat.setColor3('uColor', this.color.color);
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
    // Trigger press on all blocks
    for (const block of this.blocks) {
      block.pressing = true;
      block.pressTime = 0;
    }
  }

  update(time, dt) {
    if (this.material && this.material.setFloat) {
      this.material.setFloat('uTime', time);
    }
    // Update block press animations
    for (const block of this.blocks) {
      if (block.pressing) {
        block.pressTime += dt;
        const pressDuration = 0.15;
        const pressDepth = 0.12;

        if (block.pressTime < pressDuration) {
          const t = block.pressTime / pressDuration;
          const easeOut = 1 - Math.pow(1 - t, 3);
          block.position.y = block.originalY - pressDepth * Math.sin(easeOut * Math.PI);
          block.material.emissiveIntensity = 0.5 + 0.5 * (1 - easeOut);
        } else {
          block.pressing = false;
          block.position.y = block.originalY;
          block.material.emissiveIntensity = 0.5;
        }
      }
    }
  }

  dispose() {
    if (this.mesh) this.mesh.dispose();
    if (this.material) this.material.dispose();
    for (const block of this.blocks) block.dispose();
    this.blocks = [];
  }
}

export class TrackManager {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.segmentLength = SEGMENT_LENGTH;
    this.segmentGap = 0.3;
    this.pathColor = null;
  }

  initialize(levelConfig) {
    this.clear();
    this.levelConfig = levelConfig;
    this.availableTypes = levelConfig.trackTypes;
    this.pathColor = null;

    const firstColor = this.randomColor();
    this.pathColor = firstColor.color;
    const firstSegment = this.createSegment('straight', 0, firstColor);
    this.segments.push(firstSegment);

    let currentZ = SEGMENT_LENGTH;
    for (let i = 1; i < 25; i++) {
      const type = this.selectNextSegmentType(i);
      let segColor;
      if (type === 'straight') {
        segColor = this.randomColor();
        this.pathColor = segColor.color;
      } else {
        segColor = { key: null, color: this.pathColor };
      }
      const segment = this.createSegment(type, -currentZ, segColor);
      this.segments.push(segment);
      currentZ += SEGMENT_LENGTH;
    }
  }

  selectNextSegmentType(indexFromLastStraight) {
    if (indexFromLastStraight % 4 === 0) return 'straight';
    const available = this.availableTypes.filter(t => t !== 'straight');
    if (available.length === 0) return 'straight';
    if (available.includes('speedBoost') && Math.random() < 0.2) return 'speedBoost';
    const others = available.filter(t => t !== 'speedBoost');
    if (others.length > 0) return others[Math.floor(Math.random() * others.length)];
    return available[0];
  }

  createSegment(type, zPosition, color) {
    let blockColors = null;
    if (type === 'double' || type === 'triple') {
      blockColors = this.generateBlockColors(type);
    }
    return new TrackSegment(this.scene, type, zPosition, color, blockColors);
  }

  generateBlockColors(type) {
    const count = type === 'triple' ? 3 : 2;
    return this.shuffleColors(count);
  }

  shuffleColors(count) {
    const allColors = [COLORS.pink, COLORS.yellow, COLORS.blue];
    const shuffled = [];
    const used = [];
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
    const oldSeg = this.segments[index];
    oldSeg.dispose();

    const type = this.selectNextSegmentType(0);
    let color;
    if (type === 'straight') {
      color = this.randomColor();
      this.pathColor = color.color;
    } else {
      color = { key: null, color: this.pathColor };
    }

    const newSegment = this.createSegment(type, newZ, color);
    this.segments[index] = newSegment;
    return newSegment;
  }

  clear() {
    for (const seg of this.segments) seg.dispose();
    this.segments = [];
  }
}
