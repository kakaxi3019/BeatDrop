import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  PointLight,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  ShaderMaterial,
  GlowLayer,
  DefaultRenderingPipeline,
  Mesh,
  Effect,
  Texture
} from '@babylonjs/core';

import { TrackManager, COLORS } from './Track.js';

// Level configurations
const LEVELS = [
  { id: 1, name: "Miller's Planet", nameCn: "第1关", trackTypes: ['straight'], jumpsToWin: 1 },
  { id: 2, name: "Mann's World", nameCn: "第2关", trackTypes: ['straight', 'double', 'speedBoost'], jumpsToWin: 10 },
  { id: 3, name: "Edmunds' Planet", nameCn: "第3关", trackTypes: ['straight', 'double', 'triple', 'speedBoost'], jumpsToWin: 20 },
  { id: 4, name: "Gargantua's Edge", nameCn: "第4关", trackTypes: ['straight', 'double', 'triple', 'speedBoost'], jumpsToWin: 200 },
  { id: 5, name: "The Tesseract", nameCn: "第5关", trackTypes: ['straight', 'double', 'triple', 'speedBoost'], jumpsToWin: 1000 }
];

// Physics constants
const GRAVITY = 25;
const BOUNCE_HEIGHT = 1.5;
const GROUND_Y = 0;
const SPHERE_RADIUS = 0.9;
const SEGMENT_LENGTH = 8;
const SEGMENT_GAP = 0.3;

// Black hole shader
const blackHoleVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const blackHoleFragmentShader = `
precision highp float;
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
varying vec2 vUv;
void main() {
  vec2 center = vUv - 0.5;
  float dist = length(center);
  float angle = atan(center.y, center.x);
  float spiral = sin(angle * 12.0 - dist * 30.0 + uTime * 3.0) * 0.5 + 0.5;
  float rings = sin(dist * 40.0 - uTime * 5.0) * 0.5 + 0.5;
  float pattern = mix(spiral, rings, 0.5);
  vec3 color = mix(uColor1, uColor2, dist * 2.0);
  color = mix(color, uColor3, pattern * smoothstep(0.3, 0.6, dist));
  float centerDark = smoothstep(0.25, 0.0, dist);
  color = mix(color, vec3(0.0), centerDark);
  float edgeGlow = smoothstep(0.5, 0.48, dist) * smoothstep(0.45, 0.48, dist);
  color += uColor3 * edgeGlow * 2.0;
  float pulse = sin(uTime * 2.0) * 0.1 + 0.9;
  color *= pulse;
  gl_FragColor = vec4(color, 1.0);
}
`;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0, 0, 0, 1);

    // Game state
    this.currentLevel = 1;
    this.unlockedLevels = [1];
    this.continueCount = 3;
    this.collisionCount = 0;
    this.gameState = 'paused';

    // Ball
    this.ballVY = 0;
    this.onGround = true;
    this.ballColor = new Color3(0.2, 0.6, 0.9);
    this.pathColor = this.ballColor;

    // Speed boost
    this.speedBoostActive = false;
    this.speedBoostTimer = 0;
    this.speedBoostDuration = 10;
    this.speedBoostGravityMultiplier = 1.5;
    this.speedBoostVelocityMultiplier = 1.63;

    // Track
    this.currentSegmentIndex = 0;
    this.sharedVelocity = 0;

    // Mouse
    this.mouseX = 0;
    this.mouseSensitivity = 6;

    // Combo
    this.comboCount = 0;
    this.comboTimeout = null;

    // Black hole
    this.blackHoleActive = false;
    this.blackHole = null;
    this.blackHoleZ = -30;

    // Effects
    this.shatterParticles = [];
    this.speedBoostParticles = [];
    this.ripples = [];
    this.blackHoleRings = [];

    // Timing
    this.lastTime = performance.now();
    this.currentTime = 0;
    this.shatterTime = 0;
    this.shatterDuration = 1;

    this.setupCamera();
    this.setupLights();
    this.setupEffects();
    this.setupBall();
    this.setupTrack();
    this.setupUI();
    this.setupEventListeners();
  }

  setupCamera() {
    this.camera = new ArcRotateCamera('camera', Math.PI / 2, Math.PI / 3, 20, new Vector3(0, 2, 0), this.scene);
    this.camera.inputs.clear();
    this.camera.position = new Vector3(0, 8, 18);
    this.camera.setTarget(new Vector3(0, 0, -5));
  }

  setupLights() {
    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
    ambient.intensity = 0.5;
    const point1 = new PointLight('point1', new Vector3(5, 5, 5), this.scene);
    point1.diffuse = new Color3(0.2, 0.6, 0.9);
    point1.intensity = 2;
    const point2 = new PointLight('point2', new Vector3(-5, -3, -5), this.scene);
    point2.diffuse = new Color3(0.9, 0.3, 0.3);
    point2.intensity = 1.5;
  }

  setupEffects() {
    this.glowLayer = new GlowLayer('glow', this.scene, { mainTextureFixedSize: 512, blurKernelSize: 32 });
    this.glowLayer.intensity = 0.6;

    this.pipeline = new DefaultRenderingPipeline('pipeline', true, this.scene, [this.camera]);
    this.pipeline.bloomEnabled = true;
    this.pipeline.bloomThreshold = 0.8;
    this.pipeline.bloomWeight = 0.15;
    this.pipeline.bloomKernel = 32;
    this.pipeline.bloomScale = 0.3;
    this.pipeline.imageProcessingEnabled = true;
    this.pipeline.imageProcessing.vignetteEnabled = true;
    this.pipeline.imageProcessing.vignetteWeight = 0.5;
  }

  setupBall() {
    this.ball = MeshBuilder.CreateSphere('ball', { diameter: SPHERE_RADIUS * 2, segments: 32 }, this.scene);
    this.ballMaterial = new StandardMaterial('ballMat', this.scene);
    this.ballMaterial.diffuseColor = this.ballColor;
    this.ballMaterial.specularColor = new Color3(0.3, 0.3, 0.3);
    this.ballMaterial.emissiveColor = this.ballColor.scale(0.2);
    this.ball.material = this.ballMaterial;
    this.ball.position = new Vector3(0, BOUNCE_HEIGHT + SPHERE_RADIUS, 0);
  }

  setupTrack() {
    this.trackManager = new TrackManager(this.scene);
  }

  setupUI() {
    this.ui = {
      gameOver: document.getElementById('gameOver'),
      victory: document.getElementById('victory'),
      comboDisplay: document.getElementById('comboDisplay'),
      comboText: document.getElementById('comboText'),
      comboCount: document.getElementById('comboCount'),
      currentDistance: document.getElementById('currentDistance'),
      targetDistance: document.getElementById('targetDistance'),
      levelNum: document.getElementById('levelNum'),
      levelTitle: document.getElementById('levelTitle'),
      levelSelect: document.getElementById('levelSelect'),
      levelList: document.getElementById('levelList'),
      continueCount: document.getElementById('continueCount'),
      continueBtn: document.getElementById('continueBtn'),
      restartBtn: document.getElementById('restartBtn'),
      victoryBtn: document.getElementById('victoryBtn'),
      nextLevelBtn: document.getElementById('nextLevelBtn'),
      menuBtn: document.getElementById('menuBtn')
    };
    this.buildLevelList();
  }

  buildLevelList() {
    this.ui.levelList.innerHTML = '';
    for (const level of LEVELS) {
      const btn = document.createElement('button');
      btn.className = 'level-btn' + (this.unlockedLevels.includes(level.id) ? '' : ' locked');
      btn.innerHTML = `<span class="level-num">${level.nameCn}</span><span class="level-name">${level.name}</span><span class="level-desc">${this.getLevelDescription(level)}</span><span class="lock-icon">🔒</span>`;
      btn.onclick = () => this.selectLevel(level.id);
      this.ui.levelList.appendChild(btn);
    }
  }

  getLevelDescription(level) {
    if (level.jumpsToWin >= 200) return '混合轨道 · 200跳通关';
    if (level.jumpsToWin >= 1000) return '混合轨道 · 1000跳通关';
    if (level.trackTypes.includes('triple')) return '直线 + 双色块 + 三色块 + 加速轨道';
    if (level.trackTypes.includes('double')) return '直线 + 双色块 + 加速轨道';
    return '全部直线轨道';
  }

  setupEventListeners() {
    this.canvas.addEventListener('mousemove', (e) => {
      this.mouseX = -(e.clientX / this.canvas.clientWidth - 0.5) * 2;
    });
    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        this.mouseX = -(e.touches[0].clientX / this.canvas.clientWidth - 0.5) * 2;
      }
    });
    this.ui.continueBtn.onclick = () => this.continueGame();
    this.ui.restartBtn.onclick = () => this.returnToLevelSelect();
    this.ui.victoryBtn.onclick = () => this.returnToLevelSelect();
    this.ui.nextLevelBtn.onclick = () => this.nextLevel();
    this.ui.menuBtn.onclick = () => this.showLevelSelect();
  }

  start() {
    this.startLevel(1);
    this.showLevelSelect();
    this.engine.runRenderLoop(() => {
      this.update();
      this.scene.render();
    });
  }

  resize() { this.engine.resize(); }

  startLevel(levelId) {
    const level = LEVELS.find(l => l.id === levelId);
    if (!level) return;

    this.currentLevel = levelId;
    this.collisionCount = 0;
    this.collisionsToWin = level.jumpsToWin;
    this.continueCount = 3;
    this.speedBoostActive = false;
    this.speedBoostTimer = 0;
    this.blackHoleActive = false;
    this.blackHole = null;
    this.comboCount = 0;

    // Reset ball
    this.ball.position = new Vector3(0, BOUNCE_HEIGHT + SPHERE_RADIUS, 0);
    this.ballColor = new Color3(0.2, 0.6, 0.9);
    this.ballMaterial.diffuseColor = this.ballColor;
    this.ballMaterial.emissiveColor = this.ballColor.scale(0.2);
    this.ballMaterial.emissiveIntensity = 0;
    this.ball.visibility = 1;
    this.ballVY = 0;
    this.onGround = true;
    this.currentSegmentIndex = 0;
    this.sharedVelocity = 0;
    this.gameState = 'playing';

    // Clear effects
    this.clearAllEffects();

    // Init track
    this.trackManager.initialize(level);

    // Velocity
    const distance = SEGMENT_LENGTH + 0.3;
    const bouncePeriod = 2 * Math.sqrt(2 * BOUNCE_HEIGHT / GRAVITY);
    this.sharedVelocity = distance / bouncePeriod;

    // UI
    this.ui.levelNum.textContent = level.nameCn;
    this.ui.levelTitle.textContent = level.name;
    this.ui.currentDistance.textContent = '0m';
    this.ui.targetDistance.textContent = '???m';
    this.ui.gameOver.style.display = 'none';
    this.ui.victory.style.display = 'none';
    this.ui.comboDisplay.style.display = 'none';
    this.glowLayer.intensity = 0.6;
    this.lastTime = performance.now();
  }

  update() {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.currentTime += dt;

    if (this.gameState === 'gameOver') {
      this.updateShatter(dt);
      return;
    }

    if (this.gameState !== 'playing') return;

    // Speed boost
    if (this.speedBoostActive) {
      this.speedBoostTimer -= dt;
      if (this.speedBoostTimer <= 0) {
        this.speedBoostActive = false;
        this.speedBoostTimer = 0;
        this.clearSpeedBoostParticles();
      }
      this.updateSpeedBoostParticles(dt);
    }

    const currentGravity = this.speedBoostActive ? GRAVITY * this.speedBoostGravityMultiplier : GRAVITY;
    const effectiveVelocity = this.sharedVelocity * (this.speedBoostActive ? this.speedBoostVelocityMultiplier : 1);

    // Ball physics
    if (this.onGround) {
      this.ballVY = Math.sqrt(2 * currentGravity * BOUNCE_HEIGHT);
      this.onGround = false;
    }
    this.ballVY -= currentGravity * dt;
    this.ball.position.y += this.ballVY * dt;

    // Find the segment under the ball before moving (based on z position)
    const ballZ = 0; // Ball stays at z=0
    let segmentUnderBall = null;
    let segmentUnderBallIndex = -1;

    for (let i = 0; i < this.trackManager.segments.length; i++) {
      const seg = this.trackManager.segments[i];
      const segZ = seg.mesh.position.z;
      // Segment covers roughly from segZ - SEGMENT_LENGTH/2 to segZ + SEGMENT_LENGTH/2
      // Ball is at z=0, so segment is under ball when its center is near 0
      if (Math.abs(segZ) < SEGMENT_LENGTH) {
        segmentUnderBall = seg;
        segmentUnderBallIndex = i;
        break;
      }
    }

    // Ground collision - check if ball reached ground
    if (this.ball.position.y <= GROUND_Y + SPHERE_RADIUS) {
      this.ball.position.y = GROUND_Y + SPHERE_RADIUS;
      this.onGround = true;

      if (segmentUnderBall) {
        this.handleLanding(segmentUnderBall, segmentUnderBallIndex, currentGravity);
      }
    }

    this.ball.position.x = Math.max(-3, Math.min(3, this.mouseX * this.mouseSensitivity));
    this.ball.rotation.z -= 0.03;

    // Track segments
    for (let i = 0; i < this.trackManager.segments.length; i++) {
      const seg = this.trackManager.segments[i];
      seg.mesh.position.z += effectiveVelocity * dt;
      seg.update(this.currentTime, dt);

      if (seg.mesh.position.z > 30) {
        let minZ = Infinity;
        for (const s of this.trackManager.segments) {
          if (s.mesh.position.z < minZ) minZ = s.mesh.position.z;
        }
        const newZ = minZ - SEGMENT_LENGTH - 0.3;
        this.trackManager.recycleSegment(i, newZ);
      }
    }

    // Update effects
    this.updateRipples(dt);
    this.updateBlackHole(effectiveVelocity, dt);
    this.updateDistanceDisplay();
  }

  handleLanding(currentSeg, currentSegIndex, currentGravity) {
    // Trigger track ripple shader
    currentSeg.triggerRipple(this.currentTime);

    // Create visual ripple effect at segment position
    this.createRippleEffect(currentSeg);

    if (currentSeg.type === 'straight') {
      this.ball.position.x = 0;
      this.ballColor = currentSeg.color.color.clone();
      this.ballMaterial.diffuseColor = this.ballColor;
      this.ballMaterial.emissiveColor = this.ballColor.scale(0.5);
      this.ballMaterial.emissiveIntensity = 0.5;
      this.pathColor = this.ballColor;
      this.onSurvived();

    } else if (currentSeg.type === 'speedBoost') {
      this.ball.position.x = 0;
      this.speedBoostActive = true;
      this.speedBoostTimer = this.speedBoostDuration;
      this.glowLayer.intensity = 1.2;
      this.createSpeedBoostParticles();
      this.onSurvived();

    } else if (currentSeg.type === 'double' || currentSeg.type === 'triple') {
      const ballX = this.ball.position.x;
      const blockIndex = this.getBlockIndex(ballX, currentSeg.type);

      if (blockIndex >= 0 && currentSeg.blocks && currentSeg.blocks[blockIndex]) {
        const blockColor = currentSeg.blocks[blockIndex].material.diffuseColor;
        if (this.colorsMatch(this.ballColor, blockColor)) {
          // Trigger block press animation
          const block = currentSeg.blocks[blockIndex];
          block.pressing = true;
          block.pressTime = 0;
          this.onSurvived();
        } else {
          this.onGameOver();
          return;
        }
      } else {
        this.onGameOver();
        return;
      }
    }

    // Find next segment (the one ahead, with larger z)
    let nextSeg = null;
    let minNextZ = Infinity;
    for (let i = 0; i < this.trackManager.segments.length; i++) {
      const seg = this.trackManager.segments[i];
      if (seg.mesh.position.z > currentSeg.mesh.position.z && seg.mesh.position.z < minNextZ) {
        minNextZ = seg.mesh.position.z;
        nextSeg = seg;
      }
    }

    // Calculate velocity based on distance to next segment
    if (nextSeg) {
      const distance = Math.abs(nextSeg.mesh.position.z - currentSeg.mesh.position.z);
      const bouncePeriod = 2 * Math.sqrt(2 * BOUNCE_HEIGHT / currentGravity);
      this.sharedVelocity = distance / bouncePeriod;
    }

    this.currentSegmentIndex = currentSegIndex;
  }

  getBlockIndex(ballX, segmentType) {
    const blockCount = segmentType === 'triple' ? 3 : 2;
    const blockWidth = 2.0;
    const spacing = segmentType === 'triple' ? 2.2 : 2.5;
    const startX = -(blockCount - 1) * spacing / 2;
    for (let i = 0; i < blockCount; i++) {
      const blockX = startX + i * spacing;
      if (ballX >= blockX - blockWidth / 2 && ballX <= blockX + blockWidth / 2) return i;
    }
    return -1;
  }

  colorsMatch(c1, c2) {
    const threshold = 0.15;
    return Math.abs(c1.r - c2.r) < threshold && Math.abs(c1.g - c2.g) < threshold && Math.abs(c1.b - c2.b) < threshold;
  }

  onSurvived() {
    this.showCombo();
    this.collisionCount++;
    if (this.collisionCount >= this.collisionsToWin && !this.blackHoleActive) {
      this.activateBlackHole();
    }
  }

  showCombo() {
    this.comboCount++;
    const text = Math.random() < 0.8 ? 'PERFECT' : 'GREAT';
    this.ui.comboText.textContent = text;
    this.ui.comboCount.textContent = `x${this.comboCount}`;
    const colorHex = '#' + Math.floor(this.ballColor.r * 255).toString(16).padStart(2, '0') + Math.floor(this.ballColor.g * 255).toString(16).padStart(2, '0') + Math.floor(this.ballColor.b * 255).toString(16).padStart(2, '0');
    this.ui.comboDisplay.style.setProperty('--glow-color', colorHex);
    this.ui.comboDisplay.style.display = 'block';
    if (this.comboTimeout) clearTimeout(this.comboTimeout);
    this.comboTimeout = setTimeout(() => { this.ui.comboDisplay.style.display = 'none'; }, 800);
  }

  activateBlackHole() {
    this.blackHoleActive = true;
    this.blackHoleZ = -30;
    this.createBlackHole(this.blackHoleZ);
  }

  createBlackHole(z) {
    try {
      const coreGeo = MeshBuilder.CreateSphere('blackHoleCore', { diameter: 5, segments: 32 }, this.scene);

      const shaderName = 'blackHole';
      Effect.ShadersStore[`${shaderName}VertexShader`] = blackHoleVertexShader;
      Effect.ShadersStore[`${shaderName}FragmentShader`] = blackHoleFragmentShader;

      const coreMat = new ShaderMaterial(shaderName, this.scene, {
        vertex: shaderName, fragment: shaderName
      }, {
        attributes: ['position', 'normal', 'uv'],
        uniforms: ['worldViewProjection', 'uTime', 'uColor1', 'uColor2', 'uColor3']
      });

      coreMat.setFloat('uTime', 0);
      coreMat.setColor3('uColor1', new Color3(0, 0, 0));
      coreMat.setColor3('uColor2', new Color3(0.29, 0, 0.5));
      coreMat.setColor3('uColor3', new Color3(1, 0.42, 0));
      coreMat.backFaceCulling = false;

      coreGeo.material = coreMat;
      coreGeo.position.set(0, 2, z);
      coreGeo.isPickable = false;

      // Create rings using CreateTorus
      const ringColors = [new Color3(1, 0.42, 0), new Color3(0.67, 0, 1), new Color3(0.29, 0, 0.5)];
      this.blackHoleRings = [];
      for (let i = 0; i < 3; i++) {
        const ringGeo = MeshBuilder.CreateTorus(`ring${i}`, { diameter: 5.6 + i * 1.0, thickness: 0.4, tessellation: 32 }, this.scene);
        const ringMat = new StandardMaterial(`ringMat${i}`, this.scene);
        ringMat.diffuseColor = ringColors[i];
        ringMat.emissiveColor = ringColors[i];
        ringMat.alpha = 0.4 - i * 0.1;
        ringMat.backFaceCulling = false;
        ringGeo.material = ringMat;
        ringGeo.rotation.x = Math.PI / 2;
        ringGeo.position.set(0, 0, 0.01 + i * 0.02);
        ringGeo.parent = coreGeo;
        ringGeo.isPickable = false;
        this.blackHoleRings.push({ mesh: ringGeo, speed: 0.5 + i * 0.3, dir: i % 2 === 0 ? 1 : -1 });
      }

      this.blackHole = coreGeo;
      this.blackHole.userData = { isBlackHole: true };
    } catch (e) {
      console.error('Black hole error:', e);
    }
  }

  updateBlackHole(effectiveVelocity, dt) {
    if (!this.blackHole) return;

    const mat = this.blackHole.material;
    if (mat && mat.setFloat) mat.setFloat('uTime', this.currentTime);

    this.blackHole.rotation.y += dt * 0.5;
    this.blackHole.rotation.z += dt * 0.3;
    this.blackHole.position.z += effectiveVelocity * dt;

    // Update rings
    if (this.blackHoleRings) {
      for (let i = 0; i < this.blackHoleRings.length; i++) {
        const ring = this.blackHoleRings[i];
        ring.mesh.rotation.z += dt * ring.speed * ring.dir;
      }
    }

    const dist = Vector3.Distance(this.ball.position, this.blackHole.position);
    if (dist < 2.5) {
      this.triggerVictory();
      return;
    }
    if (dist < 10) {
      const pullStrength = (10 - dist) * 0.01;
      this.ball.position.x += (this.blackHole.position.x - this.ball.position.x) * pullStrength;
      this.ball.position.y += (this.blackHole.position.y - this.ball.position.y) * pullStrength;
    }
  }

  triggerVictory() {
    this.gameState = 'victory';
    this.ball.visibility = 0;
    this.unlockNextLevel();
    const level = LEVELS[this.currentLevel - 1];
    const victoryTitle = document.querySelector('#victory h1');
    if (victoryTitle) victoryTitle.textContent = level.name;
    const victorySubtitle = document.querySelector('#victory p');
    if (victorySubtitle) victorySubtitle.textContent = this.currentLevel < LEVELS.length ? '关卡完成!' : '恭喜通关全部关卡!';
    this.ui.nextLevelBtn.style.display = this.currentLevel < LEVELS.length ? 'block' : 'none';
    this.ui.comboDisplay.style.display = 'none';
    this.ui.victory.style.display = 'block';
  }

  unlockNextLevel() {
    const nextLevel = this.currentLevel + 1;
    if (nextLevel <= LEVELS.length && !this.unlockedLevels.includes(nextLevel)) {
      this.unlockedLevels.push(nextLevel);
    }
  }

  createRippleEffect(segment) {
    const color = segment.type === 'straight' ? segment.color.color : new Color3(1, 1, 1);
    const trackY = segment.type === 'straight' ? 0.15 : -0.3;

    // Track dimensions
    const trackWidth = 6;
    const trackDepth = 1.5;

    // Create 4 lines forming a rectangular frame that expands
    for (let ring = 0; ring < 3; ring++) {
      const delay = ring * 0.15;
      const alpha = 0.6 - ring * 0.15;

      // Create horizontal lines (top and bottom)
      const hLineGeo = MeshBuilder.CreatePlane(`hLine${ring}`, {
        width: trackWidth,
        height: 0.08,
        sideOrientation: Mesh.DOUBLESIDE
      }, this.scene);
      const hLineMat = new StandardMaterial(`hLineMat${ring}`, this.scene);
      hLineMat.emissiveColor = color;
      hLineMat.disableLighting = true;
      hLineMat.alpha = alpha;
      hLineMat.backFaceCulling = false;
      hLineGeo.material = hLineMat;
      hLineGeo.rotation.x = Math.PI / 2;
      hLineGeo.position.set(0, trackY + 0.03, -(trackDepth / 2 - 0.04));
      hLineGeo.parent = segment.mesh;
      hLineGeo.userData = {
        type: 'rippleLine',
        age: -delay,
        axis: 'horizontal',
        maxExpand: 1.5 + ring * 0.6,
        life: 1.2,
        color: color
      };
      this.scene.addMesh(hLineGeo);
      this.ripples.push(hLineGeo);

      // Bottom horizontal line
      const hLineGeo2 = hLineGeo.clone(`hLine2${ring}`);
      hLineGeo2.position.z = trackDepth / 2 - 0.04;
      hLineGeo2.parent = segment.mesh;
      hLineGeo2.userData = { ...hLineGeo.userData };
      this.scene.addMesh(hLineGeo2);
      this.ripples.push(hLineGeo2);

      // Create vertical lines (left and right)
      const vLineGeo = MeshBuilder.CreatePlane(`vLine${ring}`, {
        width: 0.08,
        height: trackDepth,
        sideOrientation: Mesh.DOUBLESIDE
      }, this.scene);
      const vLineMat = new StandardMaterial(`vLineMat${ring}`, this.scene);
      vLineMat.emissiveColor = color;
      vLineMat.disableLighting = true;
      vLineMat.alpha = alpha;
      vLineMat.backFaceCulling = false;
      vLineGeo.material = vLineMat;
      vLineGeo.rotation.x = Math.PI / 2;
      vLineGeo.position.set(-(trackWidth / 2 - 0.04), trackY + 0.03, 0);
      vLineGeo.parent = segment.mesh;
      vLineGeo.userData = {
        type: 'rippleLine',
        age: -delay,
        axis: 'vertical',
        maxExpand: 1.5 + ring * 0.6,
        life: 1.2,
        color: color
      };
      this.scene.addMesh(vLineGeo);
      this.ripples.push(vLineGeo);

      // Right vertical line
      const vLineGeo2 = vLineGeo.clone(`vLine2${ring}`);
      vLineGeo2.position.x = trackWidth / 2 - 0.04;
      vLineGeo2.parent = segment.mesh;
      vLineGeo2.userData = { ...vLineGeo.userData };
      this.scene.addMesh(vLineGeo2);
      this.ripples.push(vLineGeo2);
    }

    // Create flash at impact point
    const flashGeo = MeshBuilder.CreateSphere('flash', { diameter: 0.5, segments: 8 }, this.scene);
    const flashMat = new StandardMaterial('flashMat', this.scene);
    flashMat.emissiveColor = new Color3(1, 1, 1);
    flashMat.disableLighting = true;
    flashGeo.material = flashMat;
    flashGeo.position.set(0, trackY + 0.1, 0);
    flashGeo.parent = segment.mesh;
    flashGeo.userData = { type: 'flash', age: 0, life: 0.3 };
    this.scene.addMesh(flashGeo);
    this.ripples.push(flashGeo);
  }

  updateRipples(dt) {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      const ud = r.userData;
      ud.age += dt;

      if (ud.type === 'rippleLine') {
        // Handle delay
        if (ud.age < 0) continue;

        const progress = ud.age / ud.life;
        if (progress < 1) {
          // Expand outward
          const expand = 1 + (ud.maxExpand - 1) * progress;
          if (ud.axis === 'horizontal') {
            r.scaling.set(expand, 1, 1);
            // Move outward in z
            const sign = r.position.z > 0 ? 1 : -1;
            const halfDepth = 0.75; // trackDepth / 2
            r.position.z = sign * (halfDepth - 0.04 + (halfDepth * expand - halfDepth));
          } else {
            r.scaling.set(1, 1, expand);
            // Move outward in x
            const sign = r.position.x > 0 ? 1 : -1;
            const halfWidth = 3; // trackWidth / 2
            r.position.x = sign * (halfWidth - 0.04 + (halfWidth * expand - halfWidth));
          }

          // Fade out
          const fadeStart = 0.5;
          if (progress > fadeStart) {
            r.material.alpha = (1 - (progress - fadeStart) / (1 - fadeStart)) * 0.5;
          }
        } else {
          this.scene.removeMesh(r);
          r.dispose();
          this.ripples.splice(i, 1);
        }
        continue;
      }

      if (ud.type === 'flash') {
        const progress = ud.age / ud.life;
        if (progress < 1) {
          const scale = 1 + progress * 3;
          r.scaling.set(scale, scale, scale);
          r.material.alpha = 1 - progress;
        } else {
          this.scene.removeMesh(r);
          r.dispose();
          this.ripples.splice(i, 1);
        }
        continue;
      }

      if (ud.type === 'spray') {
        r.position.x += ud.vx * dt;
        r.position.z += ud.vz * dt;
        r.position.y += ud.vy * dt;
        ud.vy -= 9.8 * dt;
        ud.vx *= 0.95;
        ud.vz *= 0.95;
        ud.life -= ud.decay * dt;
        r.material.alpha = Math.max(0, ud.life);
        if (ud.life <= 0 || r.position.y < -0.3) {
          this.scene.removeMesh(r);
          r.dispose();
          this.ripples.splice(i, 1);
        }
      }
    }
  }

  createSpeedBoostParticles() {
    this.clearSpeedBoostParticles();
    for (let i = 0; i < 30; i++) {
      const geo = MeshBuilder.CreateSphere('sbParticle', { diameter: 0.15, segments: 6 }, this.scene);
      const mat = new StandardMaterial('sbMat', this.scene);
      mat.emissiveColor = new Color3(1, 1, 1);
      mat.disableLighting = true;
      geo.material = mat;
      geo.position.set(
        this.ball.position.x + (Math.random() - 0.5) * 2,
        this.ball.position.y + (Math.random() - 0.5) * 1.5,
        this.ball.position.z + (Math.random() - 0.5) * 2
      );
      geo.userData = {
        offset: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.5,
        radius: 0.8 + Math.random() * 1.2,
        verticalSpeed: (Math.random() - 0.5) * 0.5
      };
      this.scene.addMesh(geo);
      this.speedBoostParticles.push(geo);
    }
  }

  updateSpeedBoostParticles(dt) {
    for (const p of this.speedBoostParticles) {
      const ud = p.userData;
      const angle = this.currentTime * ud.speed + ud.offset;
      p.position.x = this.ball.position.x + Math.cos(angle) * ud.radius;
      p.position.y = this.ball.position.y + Math.sin(this.currentTime * 2 + ud.offset) * 0.3 + ud.verticalSpeed;
      p.position.z = this.ball.position.z + Math.sin(angle) * ud.radius;
      p.material.alpha = 0.4 + Math.sin(this.currentTime * 5 + ud.offset) * 0.3;
    }
  }

  clearSpeedBoostParticles() {
    for (const p of this.speedBoostParticles) {
      this.scene.removeMesh(p);
      p.dispose();
    }
    this.speedBoostParticles = [];
  }

  createShatterEffect() {
    const color = this.ballMaterial.diffuseColor.clone();
    for (let i = 0; i < 50; i++) {
      const geo = MeshBuilder.CreateSphere('shatter', { diameter: 0.15, segments: 6 }, this.scene);
      const mat = new StandardMaterial('shatterMat', this.scene);
      mat.emissiveColor = color;
      mat.disableLighting = true;
      geo.material = mat;
      geo.position.copyFrom(this.ball.position);
      geo.userData = {
        velocity: new Vector3((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8),
        rotationSpeed: new Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4)
      };
      this.scene.addMesh(geo);
      this.shatterParticles.push(geo);
    }
  }

  updateShatter(dt) {
    this.shatterTime += dt;
    for (const p of this.shatterParticles) {
      const vel = p.userData.velocity;
      vel.y -= GRAVITY * dt;
      p.position.x += vel.x * dt;
      p.position.y += vel.y * dt;
      p.position.z += vel.z * dt;
      p.rotation.x += p.userData.rotationSpeed.x * dt;
      p.rotation.y += p.userData.rotationSpeed.y * dt;
      p.rotation.z += p.userData.rotationSpeed.z * dt;
      p.material.alpha = Math.max(0, 1 - this.shatterTime / this.shatterDuration);
      p.material.transparent = true;
    }
  }

  clearShatterParticles() {
    for (const p of this.shatterParticles) {
      this.scene.removeMesh(p);
      p.dispose();
    }
    this.shatterParticles = [];
  }

  clearRipples() {
    for (const r of this.ripples) {
      this.scene.removeMesh(r);
      r.dispose();
    }
    this.ripples = [];
  }

  clearAllEffects() {
    this.clearShatterParticles();
    this.clearSpeedBoostParticles();
    this.clearRipples();
    if (this.blackHole) {
      this.scene.removeMesh(this.blackHole);
      this.blackHole.dispose();
      this.blackHole = null;
    }
    this.blackHoleRings = [];
  }

  updateDistanceDisplay() {
    if (this.blackHoleActive && this.blackHole) {
      const initialGap = 30;
      const currentGap = Math.abs(this.blackHole.position.z - this.ball.position.z);
      const currentDistance = initialGap - currentGap;
      this.ui.currentDistance.textContent = Math.floor(currentDistance) + 'm';
      this.ui.targetDistance.textContent = '目标：' + Math.floor(currentGap) + 'm';
    } else {
      this.ui.currentDistance.textContent = Math.floor(this.collisionCount * 20) + 'm';
    }
  }

  onGameOver() {
    this.gameState = 'gameOver';
    this.shatterTime = 0;
    this.ball.visibility = 0;
    this.createShatterEffect();
    this.ui.continueCount.textContent = `剩余继续次数：${this.continueCount}`;
    this.ui.continueBtn.style.display = this.continueCount > 0 ? 'block' : 'none';
    this.ui.comboDisplay.style.display = 'none';
    setTimeout(() => { this.ui.gameOver.style.display = 'block'; }, this.shatterDuration * 1000);
  }

  continueGame() {
    if (this.continueCount <= 0) return;
    this.continueCount--;
    this.ui.gameOver.style.display = 'none';
    this.clearShatterParticles();
    this.ball.visibility = 1;
    const currentSeg = this.trackManager.segments[this.currentSegmentIndex];
    this.ball.position.set(0, BOUNCE_HEIGHT + SPHERE_RADIUS, currentSeg.mesh.position.z);
    this.ballMaterial.diffuseColor = this.ballColor;
    this.ballMaterial.emissiveColor = this.ballColor;
    this.ballMaterial.emissiveIntensity = 0.5;
    this.ballVY = 0;
    this.onGround = false;
    this.gameState = 'playing';
    this.speedBoostActive = false;
    this.speedBoostTimer = 0;
    this.glowLayer.intensity = 0.6;
    this.clearSpeedBoostParticles();
    this.ui.comboDisplay.style.display = 'none';
    if (this.comboTimeout) clearTimeout(this.comboTimeout);
    this.lastTime = performance.now();
  }

  returnToLevelSelect() {
    this.gameState = 'paused';
    this.ui.gameOver.style.display = 'none';
    this.ui.victory.style.display = 'none';
    this.clearAllEffects();
    this.showLevelSelect();
  }

  showLevelSelect() {
    this.gameState = 'paused';
    this.buildLevelList();
    this.ui.levelSelect.style.display = 'flex';
  }

  selectLevel(levelId) {
    if (!this.unlockedLevels.includes(levelId)) return;
    this.ui.levelSelect.style.display = 'none';
    this.startLevel(levelId);
  }

  nextLevel() {
    if (this.currentLevel < LEVELS.length) {
      this.startLevel(this.currentLevel + 1);
    } else {
      this.returnToLevelSelect();
    }
  }
}
