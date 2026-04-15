import {
  MeshBuilder,
  Mesh,
  StandardMaterial,
  ShaderMaterial,
  Color3,
  Color4,
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
    this.mesh = MeshBuilder.CreateBox('straight', { width: 6, height: 0.2, depth: 1.5 }, this.scene);
    this.mesh.position.set(0, -0.1, this.position);
    this.material = this.createRippleMaterial();
    this.mesh.material = this.material;

    this.mesh.trackSegment = this;
  }

  createDouble() {
    this.mesh = MeshBuilder.CreateBox('double', { width: 6, height: 0.01, depth: 1.5 }, this.scene);
    this.mesh.isVisible = false;
    this.mesh.position.set(0, -0.1, this.position);

    const blockWidth = 2.8;
    const spacing = 3.0;
    const startX = -1.5;
    
    // Ensure the required path color is always one of the choices
    const requiredColor = this.color.color;
    const allColors = [COLORS.pink, COLORS.yellow, COLORS.blue];
    const otherColors = allColors.filter(c => c.r !== requiredColor.r || c.g !== requiredColor.g || c.b !== requiredColor.b);
    const otherColor = otherColors[Math.floor(Math.random() * otherColors.length)];
    const colors = [requiredColor, otherColor];
    if (Math.random() > 0.5) {
      [colors[0], colors[1]] = [colors[1], colors[0]];
    }

    for (let i = 0; i < 2; i++) {
      const mat = new StandardMaterial(`doubleBlock${i}`, this.scene);
      mat.diffuseColor = colors[i];
      mat.emissiveColor = colors[i].scale(0.3);
      mat.specularColor = new Color3(1, 1, 1);
      mat.specularPower = 64;

      const block = MeshBuilder.CreateBox(`doubleBlock${i}`, { width: blockWidth, height: 0.2, depth: 1.5 }, this.scene);
      block.material = mat;
      block.position.set(startX + i * spacing, 0, 0);
      block.parent = this.mesh;

      block.originalY = 0;
      block.pressing = false;
      block.pressTime = 0;
      this.blocks.push(block);
    }
    this.mesh.trackSegment = this;
  }

  createTriple() {
    this.mesh = MeshBuilder.CreateBox('triple', { width: 6, height: 0.01, depth: 1.5 }, this.scene);
    this.mesh.isVisible = false;
    this.mesh.position.set(0, -0.1, this.position);

    const blockWidth = 1.9;
    const spacing = 2.0;
    const startX = -2.0;
    const colors = this.shuffleColors(3);

    for (let i = 0; i < 3; i++) {
      const mat = new StandardMaterial(`tripleBlock${i}`, this.scene);
      mat.diffuseColor = colors[i];
      mat.emissiveColor = colors[i].scale(0.3);
      mat.specularColor = new Color3(1, 1, 1);
      mat.specularPower = 64;

      const block = MeshBuilder.CreateBox(`tripleBlock${i}`, { width: blockWidth, height: 0.2, depth: 1.5 }, this.scene);
      block.material = mat;
      block.position.set(startX + i * spacing, 0, 0);
      block.parent = this.mesh;

      block.originalY = 0;
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
        const pressDepth = 0.25;

        // Mechanical keyboard press: 30% down, 70% up
        if (block.pressTime < pressDuration) {
          const t = block.pressTime / pressDuration;
          let yOffset = 0;
          if (t < 0.3) {
            yOffset = (t / 0.3) * pressDepth;
          } else {
            yOffset = (1.0 - (t - 0.3) / 0.7) * pressDepth;
          }
          block.position.y = block.originalY - yOffset;
          // Subtly increase brightness when pushed down
          block.material.emissiveIntensity = 0.5 + yOffset * 2.0;
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

    let currentZ = SEGMENT_LENGTH + this.segmentGap;
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
      currentZ += SEGMENT_LENGTH + this.segmentGap;
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
