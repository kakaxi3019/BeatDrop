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
  GlowLayer,
  DefaultRenderingPipeline
} from '@babylonjs/core';

import { TrackManager } from './Track.js';

// Level configurations
const LEVELS = [
  {
    id: 1,
    name: "Miller's Planet",
    nameCn: "第1关",
    trackTypes: ['straight'],
    jumpsToWin: 1
  },
  {
    id: 2,
    name: "Mann's World",
    nameCn: "第2关",
    trackTypes: ['straight', 'double', 'speedBoost'],
    jumpsToWin: 10
  },
  {
    id: 3,
    name: "Edmunds' Planet",
    nameCn: "第3关",
    trackTypes: ['straight', 'double', 'triple', 'speedBoost'],
    jumpsToWin: 20
  },
  {
    id: 4,
    name: "Gargantua's Edge",
    nameCn: "第4关",
    trackTypes: ['straight', 'double', 'triple', 'speedBoost'],
    jumpsToWin: 200
  },
  {
    id: 5,
    name: "The Tesseract",
    nameCn: "第5关",
    trackTypes: ['straight', 'double', 'triple', 'speedBoost'],
    jumpsToWin: 1000
  }
];

// Physics constants
const GRAVITY = 25;
const BOUNCE_HEIGHT = 1.5;
const GROUND_Y = 0;
const SPHERE_RADIUS = 0.9;
const SEGMENT_LENGTH = 8;
const SEGMENT_GAP = 0.3;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;

    // Create Babylon.js engine
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true
    });

    // Create scene
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0, 0, 0, 1);

    // Game state
    this.currentLevel = 1;
    this.unlockedLevels = [1];
    this.continueCount = 3;
    this.collisionCount = 0;
    this.gameState = 'paused'; // 'playing', 'paused', 'gameOver', 'victory'

    // Ball physics
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

    // Track state
    this.currentSegmentIndex = 0;
    this.sharedVelocity = 0;

    // Mouse control
    this.mouseX = 0;
    this.mouseSensitivity = 6;

    // Combo
    this.comboCount = 0;
    this.comboTimeout = null;

    // Black hole
    this.blackHoleActive = false;
    this.blackHole = null;

    // Timing
    this.lastTime = performance.now();
    this.currentTime = 0;

    this.setupScene();
    this.setupCamera();
    this.setupLights();
    this.setupEffects();
    this.setupBall();
    this.setupTrack();
    this.setupUI();
    this.setupEventListeners();
  }

  setupScene() {
    // Babylon.js handles depth by default
  }

  setupCamera() {
    this.camera = new ArcRotateCamera(
      'camera',
      Math.PI / 2,  // alpha
      Math.PI / 3,  // beta
      20,           // radius
      new Vector3(0, 2, 0),
      this.scene
    );

    // Lock camera position for this game
    this.camera.inputs.clear();

    // We don't need orbit controls - camera is fixed
    this.camera.position = new Vector3(0, 8, 18);
    this.camera.setTarget(new Vector3(0, 0, -5));
  }

  setupLights() {
    // Ambient light
    const ambient = new HemisphericLight(
      'ambient',
      new Vector3(0, 1, 0),
      this.scene
    );
    ambient.intensity = 0.4;

    // Main point light
    const point1 = new PointLight(
      'point1',
      new Vector3(5, 5, 5),
      this.scene
    );
    point1.diffuse = new Color3(0.2, 0.6, 0.9);
    point1.intensity = 0.8;

    // Accent light
    const point2 = new PointLight(
      'point2',
      new Vector3(-5, -3, -5),
      this.scene
    );
    point2.diffuse = new Color3(0.9, 0.3, 0.3);
    point2.intensity = 0.5;
  }

  setupEffects() {
    // Glow layer for emissive effects
    this.glowLayer = new GlowLayer('glow', this.scene, {
      mainTextureFixedSize: 512,
      blurKernelSize: 64
    });
    this.glowLayer.intensity = 0.6;

    // Post-processing pipeline
    this.pipeline = new DefaultRenderingPipeline(
      'pipeline',
      true,
      this.scene,
      [this.camera]
    );

    // Bloom for HDR-like glow
    this.pipeline.bloomEnabled = true;
    this.pipeline.bloomThreshold = 0.3;
    this.pipeline.bloomWeight = 0.4;
    this.pipeline.bloomKernel = 64;
    this.pipeline.bloomScale = 0.5;

    // Chromatic aberration
    this.pipeline.chromaticAberrationEnabled = true;
    this.pipeline.chromaticAberration.aberrationAmount = 15;

    // Vignette
    this.pipeline.imageProcessingEnabled = true;
    this.pipeline.imageProcessing.vignetteEnabled = true;
    this.pipeline.imageProcessing.vignetteWeight = 1.5;
    this.pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);
    this.pipeline.imageProcessing.vignetteStretch = 0;
  }

  setupBall() {
    // Create sphere
    this.ball = MeshBuilder.CreateSphere('ball', {
      diameter: SPHERE_RADIUS * 2,
      segments: 32
    }, this.scene);

    // Material
    this.ballMaterial = new StandardMaterial('ballMat', this.scene);
    this.ballMaterial.diffuseColor = this.ballColor;
    this.ballMaterial.specularColor = new Color3(0.3, 0.3, 0.3);
    this.ballMaterial.emissiveColor = this.ballColor.scale(0.2);
    this.ball.material = this.ballMaterial;

    // Initial position
    this.ball.position = new Vector3(0, BOUNCE_HEIGHT + SPHERE_RADIUS, 0);
  }

  setupTrack() {
    this.trackManager = new TrackManager(this.scene);
  }

  setupUI() {
    // Get UI elements
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

    // Build level list
    this.buildLevelList();
  }

  buildLevelList() {
    this.ui.levelList.innerHTML = '';

    for (const level of LEVELS) {
      const btn = document.createElement('button');
      btn.className = 'level-btn' + (this.unlockedLevels.includes(level.id) ? '' : ' locked');
      btn.innerHTML = `
        <span class="level-num">${level.nameCn}</span>
        <span class="level-name">${level.name}</span>
        <span class="level-desc">${this.getLevelDescription(level)}</span>
        <span class="lock-icon">🔒</span>
      `;
      btn.onclick = () => this.selectLevel(level.id);
      this.ui.levelList.appendChild(btn);
    }
  }

  getLevelDescription(level) {
    const descs = {
      'straight': '全部直线轨道',
      'double': '直线 + 双色块 + 加速轨道',
      'triple': '直线 + 双色块 + 三色块 + 加速轨道'
    };

    if (level.jumpsToWin >= 200) return '混合轨道 · 200跳通关';
    if (level.jumpsToWin >= 1000) return '混合轨道 · 1000跳通关';

    const type = level.trackTypes[level.trackTypes.length - 1];
    return descs[type] || '混合轨道';
  }

  setupEventListeners() {
    // Mouse move
    this.canvas.addEventListener('mousemove', (e) => {
      this.mouseX = (e.clientX / this.canvas.clientWidth - 0.5) * 2;
    });

    // Touch move
    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        this.mouseX = (e.touches[0].clientX / this.canvas.clientWidth - 0.5) * 2;
      }
    });

    // Buttons
    this.ui.continueBtn.onclick = () => this.continueGame();
    this.ui.restartBtn.onclick = () => this.returnToLevelSelect();
    this.ui.victoryBtn.onclick = () => this.returnToLevelSelect();
    this.ui.nextLevelBtn.onclick = () => this.nextLevel();
    this.ui.menuBtn.onclick = () => this.showLevelSelect();
  }

  start() {
    // Initialize first level
    this.startLevel(1);

    // Show level select
    this.showLevelSelect();

    // Start render loop
    this.engine.runRenderLoop(() => {
      this.update();
      this.scene.render();
    });
  }

  resize() {
    this.engine.resize();
  }

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

    // Reset ball
    this.ball.position = new Vector3(0, BOUNCE_HEIGHT + SPHERE_RADIUS, 0);
    this.ballColor = new Color3(0.2, 0.6, 0.9);
    this.ballMaterial.diffuseColor = this.ballColor;
    this.ballMaterial.emissiveColor = this.ballColor.scale(0.2);

    this.ballVY = 0;
    this.onGround = true;
    this.currentSegmentIndex = 0;
    this.sharedVelocity = 0;
    this.gameState = 'playing';

    // Initialize track
    this.trackManager.initialize(level);

    // Calculate initial velocity
    const distance = SEGMENT_LENGTH + 0.3;
    const bouncePeriod = 2 * Math.sqrt(2 * BOUNCE_HEIGHT / GRAVITY);
    this.sharedVelocity = distance / bouncePeriod;

    // Update UI
    this.ui.levelNum.textContent = level.nameCn;
    this.ui.levelTitle.textContent = level.name;
    this.ui.currentDistance.textContent = '0m';
    this.ui.targetDistance.textContent = '???m';

    // Hide overlays
    this.ui.gameOver.style.display = 'none';
    this.ui.victory.style.display = 'none';
    this.ui.comboDisplay.style.display = 'none';

    this.lastTime = performance.now();
  }

  update() {
    if (this.gameState !== 'playing') return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.currentTime += dt;

    // Update speed boost
    if (this.speedBoostActive) {
      this.speedBoostTimer -= dt;
      if (this.speedBoostTimer <= 0) {
        this.speedBoostActive = false;
        this.speedBoostTimer = 0;
      }
    }

    // Calculate current gravity
    const currentGravity = this.speedBoostActive
      ? GRAVITY * this.speedBoostGravityMultiplier
      : GRAVITY;

    // Calculate effective velocity
    const effectiveVelocity = this.sharedVelocity *
      (this.speedBoostActive ? this.speedBoostVelocityMultiplier : 1);

    // Ball physics
    if (this.onGround) {
      this.ballVY = Math.sqrt(2 * currentGravity * BOUNCE_HEIGHT);
      this.onGround = false;
    }

    this.ballVY -= currentGravity * dt;
    this.ball.position.y += this.ballVY * dt;

    // Ground collision
    if (this.ball.position.y <= GROUND_Y + SPHERE_RADIUS) {
      this.ball.position.y = GROUND_Y + SPHERE_RADIUS;
      this.onGround = true;

      this.handleLanding(currentGravity);
    }

    // Horizontal movement
    this.ball.position.x = Math.max(-3, Math.min(3, this.mouseX * this.mouseSensitivity));

    // Ball rotation
    this.ball.rotation.z -= 0.03;

    // Update track segments - move toward camera
    for (let i = 0; i < this.trackManager.segments.length; i++) {
      const seg = this.trackManager.segments[i];
      seg.mesh.position.z += effectiveVelocity * dt;

      // Update ripple shader time
      seg.update(this.currentTime);

      // Recycle segment if past camera
      if (seg.mesh.position.z > 30) {
        // Find furthest back segment
        let minZ = Infinity;
        for (const s of this.trackManager.segments) {
          if (s.mesh.position.z < minZ) minZ = s.mesh.position.z;
        }

        const newZ = minZ - SEGMENT_LENGTH - 0.3;
        this.trackManager.recycleSegment(i, newZ);
      }
    }

    // Update combo display position (follows ball roughly)
    if (this.ui.comboDisplay.style.display !== 'none') {
      // Combo display follows ball in screen space - handled by CSS
    }
  }

  handleLanding(currentGravity) {
    const currentSeg = this.trackManager.segments[this.currentSegmentIndex];
    const nextIndex = (this.currentSegmentIndex + 1) % this.trackManager.segments.length;
    const nextSeg = this.trackManager.segments[nextIndex];

    // Trigger ripple effect on track
    currentSeg.triggerRipple(this.currentTime);

    // Check segment type
    if (currentSeg.type === 'straight') {
      // Change ball color to track color
      this.ballColor = currentSeg.color.color;
      this.ballMaterial.diffuseColor = this.ballColor;
      this.ballMaterial.emissiveColor = this.ballColor.scale(0.3);
      this.pathColor = this.ballColor;

      this.onSurvived();
    } else if (currentSeg.type === 'speedBoost') {
      // Activate speed boost
      this.speedBoostActive = true;
      this.speedBoostTimer = this.speedBoostDuration;

      // Glow effect
      this.glowLayer.intensity = 1.2;

      this.onSurvived();
    } else if (currentSeg.type === 'double' || currentSeg.type === 'triple') {
      // Check if ball landed on correct block based on X position
      const ballX = this.ball.position.x;
      const blockIndex = this.getBlockIndex(ballX, currentSeg.type);

      if (blockIndex >= 0) {
        // Check color match
        const blockColors = this.getBlockColors(currentSeg);
        const blockColor = blockColors[blockIndex];

        if (this.colorsMatch(this.ballColor, blockColor)) {
          this.onSurvived();
        } else {
          this.onGameOver();
        }
      } else {
        // Didn't land on a block
        this.onGameOver();
      }
    }

    // Calculate next velocity and advance segment
    const distance = Math.abs(nextSeg.mesh.position.z - currentSeg.mesh.position.z);
    const bouncePeriod = 2 * Math.sqrt(2 * BOUNCE_HEIGHT / currentGravity);
    this.sharedVelocity = distance / bouncePeriod;

    this.currentSegmentIndex = nextIndex;
  }

  getBlockIndex(ballX, segmentType) {
    const blockCount = segmentType === 'triple' ? 3 : 2;
    const blockWidth = 2.0;
    const spacing = segmentType === 'triple' ? 2.2 : 2.5;
    const startX = -(blockCount - 1) * spacing / 2;

    for (let i = 0; i < blockCount; i++) {
      const blockX = startX + i * spacing;
      if (ballX >= blockX - blockWidth / 2 && ballX <= blockX + blockWidth / 2) {
        return i;
      }
    }

    return -1;
  }

  getBlockColors(segment) {
    // For now, use random colors like the original
    const colors = [];
    for (let i = 0; i < (segment.type === 'triple' ? 3 : 2); i++) {
      const key = ['pink', 'yellow', 'blue'][i % 3];
      colors.push(COLORS[key]);
    }
    return colors;
  }

  colorsMatch(c1, c2) {
    const threshold = 0.1;
    return Math.abs(c1.r - c2.r) < threshold &&
           Math.abs(c1.g - c2.g) < threshold &&
           Math.abs(c1.b - c2.b) < threshold;
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

    // Update glow color
    const colorHex = '#' +
      Math.floor(this.ballColor.r * 255).toString(16).padStart(2, '0') +
      Math.floor(this.ballColor.g * 255).toString(16).padStart(2, '0') +
      Math.floor(this.ballColor.b * 255).toString(16).padStart(2, '0');
    this.ui.comboDisplay.style.setProperty('--glow-color', colorHex);
    this.ui.comboDisplay.style.display = 'block';

    // Clear existing timeout
    if (this.comboTimeout) clearTimeout(this.comboTimeout);

    // Hide after delay
    this.comboTimeout = setTimeout(() => {
      this.ui.comboDisplay.style.display = 'none';
    }, 800);
  }

  activateBlackHole() {
    this.blackHoleActive = true;
    // Black hole creation would go here
  }

  onGameOver() {
    this.gameState = 'gameOver';

    // Update continue count display
    this.ui.continueCount.textContent = `剩余继续次数：${this.continueCount}`;
    this.ui.continueBtn.style.display = this.continueCount > 0 ? 'block' : 'none';

    setTimeout(() => {
      this.ui.gameOver.style.display = 'block';
    }, 500);
  }

  continueGame() {
    if (this.continueCount <= 0) return;

    this.continueCount--;
    this.ui.gameOver.style.display = 'none';

    // Reset ball position above current segment
    const currentSeg = this.trackManager.segments[this.currentSegmentIndex];
    this.ball.position = new Vector3(
      0,
      BOUNCE_HEIGHT + SPHERE_RADIUS,
      currentSeg.mesh.position.z
    );

    // Reset physics
    this.ballVY = 0;
    this.onGround = false;
    this.gameState = 'playing';

    // Reset speed boost
    this.speedBoostActive = false;
    this.speedBoostTimer = 0;
    this.glowLayer.intensity = 0.6;

    // Reset combo
    this.ui.comboDisplay.style.display = 'none';
    if (this.comboTimeout) clearTimeout(this.comboTimeout);

    this.lastTime = performance.now();
  }

  returnToLevelSelect() {
    this.gameState = 'paused';
    this.ui.gameOver.style.display = 'none';
    this.ui.victory.style.display = 'none';
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
