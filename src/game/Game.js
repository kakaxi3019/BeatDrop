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
  { id: 1, name: "Miller's Planet", nameCn: "第1关", trackTypes: ['straight', 'double'], jumpsToWin: 1 },
  { id: 2, name: "Mann's World", nameCn: "第2关", trackTypes: ['straight', 'double', 'triple'], jumpsToWin: 10 },
  { id: 3, name: "Echoes of Earth", nameCn: "第3关", trackTypes: ['straight', 'double', 'triple'], jumpsToWin: 'dynamic' }
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
uniform vec3 uColor2;
uniform vec3 uColor3;
varying vec2 vUv;
void main() {
  vec2 center = vUv - 0.5;
  float dist = length(center);
  
  // Clear event horizon boundary
  float eventHorizon = smoothstep(0.16, 0.15, dist);
  
  // Clean, elegant glowing accretion disk
  float innerGlow = smoothstep(0.15, 0.18, dist);
  float outerFade = smoothstep(0.40, 0.18, dist);
  float ring = innerGlow * outerFade;
  
  // Subtle rotation pulse for dynamism without clutter
  float angle = atan(center.y, center.x);
  float pulse = sin(angle * 2.0 - uTime * 3.0) * 0.15 + 0.85;
  
  // Mix colors
  vec3 color = mix(uColor2, uColor3, smoothstep(0.25, 0.15, dist));
  color *= ring * pulse * 2.5;
  
  // Pure black center
  color = mix(color, vec3(0.0), eventHorizon);
  
  // Alpha fading smoothly with the ring
  float alpha = ring + eventHorizon;
  if(alpha < 0.01) discard;
  
  gl_FragColor = vec4(color, alpha);
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
    this.unlockedLevels = [1, 2, 3, 4, 5];
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
    this.justLandedSegment = null;
    this.landingCooldown = 0;
    this.ballLeftGround = false;

    // Black hole
    this.blackHoleActive = false;
    this.blackHoleSucking = false;
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

    // Beatmap (Level 3)
    this.beatmap = null;
    this.audioElement = null;
    this.isLastSegmentApproaching = false;

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
    this.glowLayer = new GlowLayer('glow', this.scene, { mainTextureFixedSize: 1024, blurKernelSize: 16 });
    this.glowLayer.intensity = 0.8;

    this.pipeline = new DefaultRenderingPipeline('pipeline', true, this.scene, [this.camera]);
    this.pipeline.bloomEnabled = true;
    this.pipeline.bloomThreshold = 0.9;
    this.pipeline.bloomWeight = 0.1;
    this.pipeline.bloomKernel = 16;
    this.pipeline.bloomScale = 0.5;
    this.pipeline.imageProcessingEnabled = true;
    this.pipeline.imageProcessing.contrast = 1.1;
    this.pipeline.imageProcessing.exposure = 1.05;
    this.pipeline.imageProcessing.vignetteEnabled = true;
    this.pipeline.imageProcessing.vignetteWeight = 0.6;
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
      countdownDisplay: document.getElementById('countdownDisplay'),
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
    if (level.id === 1) return '训练关 · 直线 + 少量双色轨道 · 1跳';
    if (level.id === 2) return '训练关 · 直线 + 双色 + 三色轨道 · 10跳';
    if (level.id === 3) return '音乐驱动 · 根据重音生成轨道';
    return '混合轨道';
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

  async loadBeatmap() {
    try {
      const response = await fetch('./src/audio/beatmap-level3.json');
      this.beatmap = await response.json();
      this.collisionsToWin = this.beatmap.totalSegments;
      return true;
    } catch (e) {
      console.error('Failed to load beatmap:', e);
      return false;
    }
  }

  setupAudio() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }
    this.audioElement = new Audio('./music/BetweenWorlds.mp3');
    this.audioElement.loop = false;
  }

  async startLevel(levelId) {
    const level = LEVELS.find(l => l.id === levelId);
    if (!level) return;

    // 第3关：加载beatmap
    if (levelId === 3) {
      const loaded = await this.loadBeatmap();
      if (!loaded) {
        console.error('Failed to load beatmap for level 3');
        return;
      }
    }

    this.currentLevel = levelId;
    this.collisionCount = 0;
    this.collisionsToWin = level.jumpsToWin;
    this.continueCount = 3;
    this.speedBoostActive = false;
    this.speedBoostTimer = 0;
    this.blackHoleActive = false;
    this.blackHoleSucking = false;
    this.comboCount = 0;

    // Reset ball
    this.ballColor = new Color3(0.2, 0.6, 0.9);
    this.ballMaterial.diffuseColor = this.ballColor;
    this.ballMaterial.emissiveColor = this.ballColor.scale(0.2);
    this.ballMaterial.emissiveIntensity = 0;
    this.ball.visibility = 1;
    // 第3关特殊：球从高处落下
    if (levelId === 3) {
      this.ball.position = new Vector3(0, 8, 0); // 从y=8高处落下
      this.ballVY = 0;
      this.onGround = false;
      this.ballLeftGround = true;
    } else {
      this.ball.position = new Vector3(0, BOUNCE_HEIGHT + SPHERE_RADIUS, 0);
      this.ballVY = 0;
      this.onGround = true;
      this.justLandedSegment = null;
      this.landingCooldown = 0;
      this.ballLeftGround = true;
    }
    this.currentSegmentIndex = 0;
    this.sharedVelocity = 0;
    this.gameState = 'playing';

    // Clear effects
    this.clearAllEffects();

    // Init track
    this.trackManager.initialize(level, levelId === 3 ? this.beatmap : null);

    // Velocity
    // Initialize sharedVelocity to 0 so the track doesn't move until the ball first lands
    this.sharedVelocity = 0;

    // UI
    this.ui.levelNum.textContent = level.nameCn;
    this.ui.levelTitle.textContent = level.name;
    this.ui.currentDistance.textContent = '0m';
    this.ui.targetDistance.textContent = '???m';
    this.ui.gameOver.style.display = 'none';
    this.ui.victory.style.display = 'none';
    this.ui.comboDisplay.style.display = 'none';
    this.glowLayer.intensity = 0.8;
    this.lastTime = performance.now();

    // 第3关：启动音乐从28秒开始
    if (levelId === 3) {
      this.setupAudio();
      this.audioElement.currentTime = 28;
      this.audioElement.play();
    }
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

    // Mouse X control — allowed during countdown and playing
    if (!this.blackHoleSucking && (this.gameState === 'countdown' || this.gameState === 'playing')) {
      this.ball.position.x = Math.max(-2.9, Math.min(2.9, this.mouseX * this.mouseSensitivity));
    }

    if (this.gameState === 'countdown') return;

    if (this.gameState !== 'playing') return;

    // Decrement landing cooldown
    if (this.landingCooldown > 0) this.landingCooldown -= dt;

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
    if (!this.blackHoleSucking) {
    if (this.onGround) {
      this.ballVY = Math.sqrt(2 * currentGravity * BOUNCE_HEIGHT);
      this.onGround = false;
    }
    this.ballVY -= currentGravity * dt;
    this.ball.position.y += this.ballVY * dt;

    // Find the segment under the ball before moving (based on z position)
    const ballZ = 0; // Ball stays at z=0, segments move toward it
    const ballX = this.ball.position.x;
    let segmentUnderBall = null;
    let segmentUnderBallIndex = -1;

    let minZDist = Infinity;

    for (let i = 0; i < this.trackManager.segments.length; i++) {
      const seg = this.trackManager.segments[i];
      const segZ = seg.mesh.position.z;

      // Z boundary check: segment depth is 1.5, so half is 0.75
      const zDist = ballZ - segZ;
      if (Math.abs(zDist) > 0.75) continue;

      // X boundary check: straight is width 6 (half=3), double/triple have blocks
      // Use full track width for segment detection, then check individual block in handleLanding
      const segHalfW = 3.0;

      if (Math.abs(ballX) > segHalfW) continue;

      const dist = Math.abs(zDist);
      if (dist < minZDist) {
        minZDist = dist;
        segmentUnderBall = seg;
        segmentUnderBallIndex = i;
      }
    }

    // Ground collision - check if ball reached ground
    if (this.ball.position.y <= GROUND_Y + SPHERE_RADIUS) {
      this.ball.position.y = GROUND_Y + SPHERE_RADIUS;
      this.onGround = true;

      // Only trigger landing if ball has actually left the ground since last landing
      if (segmentUnderBall && this.ballLeftGround && this.landingCooldown <= 0) {
        this.ballLeftGround = false;
        this.landingCooldown = 0.5;
        this.handleLanding(segmentUnderBall, segmentUnderBallIndex, currentGravity);
      }

      // 第3关：检查是否跳完所有轨道
      if (this.currentLevel === 3 && this.collisionCount >= this.beatmap.totalSegments && !this.blackHoleActive) {
        this.blackHoleActive = true;
        this.blackHoleZ = -50;
        this.createBlackHole();
      }
    } else {
      this.justLandedSegment = null;
      // Ball is in the air: mark that it has left ground
      if (this.ballVY > 0) this.ballLeftGround = true;
    }

    this.ball.rotation.z -= 0.03;
    } // End physics check

    // Track segments — only move when playing (not during countdown)
    if (this.gameState === 'playing') {
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

    // 第3关：距离计数器
    if (this.currentLevel === 3 && this.beatmap) {
      const totalSegments = this.beatmap.totalSegments;
      const lastSegIndex = this.trackManager.segments.length - 1;
      const lastSeg = this.trackManager.segments[lastSegIndex];

      // 检查最后一个轨道是否已进入屏幕范围（Z > -5 且 Z < 15）
      if (lastSeg && !this.isLastSegmentApproaching) {
        if (lastSeg.mesh.position.z > -5 && lastSeg.mesh.position.z < 15) {
          this.isLastSegmentApproaching = true;
        }
      }

      if (this.isLastSegmentApproaching) {
        // 显示剩余距离
        const remaining = Math.max(0, lastSeg.mesh.position.z + 5);
        this.ui.targetDistance.textContent = Math.round(remaining) + 'm';
        this.ui.currentDistance.textContent = Math.round(this.sharedVelocity * this.currentTime) + 'm';
      }
    }
    }

    // Update effects
    this.updateRipples(dt);
    this.updateBlackHole(effectiveVelocity, dt);
    this.updateDistanceDisplay();
  }

  handleLanding(currentSeg, currentSegIndex, currentGravity) {
    // Trigger track ripple shader (handles the sinking/depression animation)
    currentSeg.triggerRipple(this.currentTime);

    if (currentSeg.type === 'straight') {
      this.ballColor = currentSeg.color.color.clone();
      this.ballMaterial.diffuseColor = this.ballColor;
      this.ballMaterial.emissiveColor = this.ballColor.scale(0.2);
      this.ballMaterial.emissiveIntensity = 0.2;
      this.pathColor = this.ballColor;
      currentSeg.triggerOuterRipple(0);
      this.onSurvived();

    } else if (currentSeg.type === 'speedBoost') {
      this.speedBoostActive = true;
      this.speedBoostTimer = this.speedBoostDuration;
      this.glowLayer.intensity = 1.2;
      this.createSpeedBoostParticles();
      this.onSurvived();

    } else if (currentSeg.type === 'double' || currentSeg.type === 'triple') {
      const ballX = this.ball.position.x;
      const blockIndex = this.getBlockIndex(ballX, currentSeg.type);

      if (blockIndex >= 0 && currentSeg.blocks && currentSeg.blocks[blockIndex]) {
        const blockColor = currentSeg.blocks[blockIndex].blockColor;
        if (blockColor && this.colorsMatch(this.ballColor, blockColor)) {
          // Trigger block press animation
          const block = currentSeg.blocks[blockIndex];
          block.pressing = true;
          block.pressTime = 0;
          currentSeg.triggerOuterRipple(blockIndex);
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

    // Find next segment (the one behind in Z since tracks start at negative Z and move to +Z)
    let nextSeg = null;
    let maxPrevZ = -Infinity;
    for (let i = 0; i < this.trackManager.segments.length; i++) {
      const seg = this.trackManager.segments[i];
      if (seg.mesh.position.z < currentSeg.mesh.position.z && seg.mesh.position.z > maxPrevZ) {
        maxPrevZ = seg.mesh.position.z;
        nextSeg = seg;
      }
    }

    // Calculate velocity based on distance to next segment
    if (nextSeg) {
      // Calculate distance relative to 0 (the ball's Z) to eliminate integration drift over time
      const distanceToZero = Math.abs(nextSeg.mesh.position.z);
      const bouncePeriod = 2 * Math.sqrt(2 * BOUNCE_HEIGHT / currentGravity);
      this.sharedVelocity = distanceToZero / bouncePeriod;
    } else {
      // No next segment found, use minimum forward velocity to keep ball moving
      const bouncePeriod = 2 * Math.sqrt(2 * BOUNCE_HEIGHT / currentGravity);
      this.sharedVelocity = (SEGMENT_LENGTH + SEGMENT_GAP) / bouncePeriod;
    }

    this.currentSegmentIndex = currentSegIndex;
  }

  getBlockIndex(ballX, segmentType) {
    const blockCount = segmentType === 'triple' ? 3 : 2;
    const blockWidth = segmentType === 'triple' ? 1.9 : 2.8;
    const spacing = segmentType === 'triple' ? 2.0 : 3.0;
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
    
    // Spawn at the very end of the current visible tracks
    let minZ = 0;
    for (const seg of this.trackManager.segments) {
      if (seg.mesh.position.z < minZ) minZ = seg.mesh.position.z;
    }
    
    
    this.blackHoleZ = minZ - SEGMENT_LENGTH;
    this.blackHoleInitialDist = Math.abs(this.blackHoleZ - this.ball.position.z);
    this.distanceAtSpawn = this.collisionCount * 20;

    this.createBlackHole(this.blackHoleZ);
  }

  createBlackHole(z) {
    try {
      // Use a flat plane facing the screen relative to standard view
      const coreGeo = MeshBuilder.CreatePlane('blackHoleCore', { width: 12, height: 12 }, this.scene);
      
      const shaderName = 'blackHole';
      Effect.ShadersStore[`${shaderName}VertexShader`] = blackHoleVertexShader;
      Effect.ShadersStore[`${shaderName}FragmentShader`] = blackHoleFragmentShader;

      const coreMat = new ShaderMaterial(shaderName, this.scene, {
        vertex: shaderName, fragment: shaderName
      }, {
        attributes: ['position', 'normal', 'uv'],
        uniforms: ['worldViewProjection', 'uTime', 'uColor2', 'uColor3'],
        needAlphaBlending: true
      });

      coreMat.setFloat('uTime', 0);
      coreMat.setColor3('uColor2', new Color3(0.1, 0.6, 1.0)); // Clean neon blue
      coreMat.setColor3('uColor3', new Color3(1.0, 1.0, 1.0)); // White core edge
      coreMat.backFaceCulling = false;
      coreMat.alphaMode = 1; // ALPHA_ADD
      coreMat.needAlphaBlending = () => true;

      coreGeo.material = coreMat;
      coreGeo.position.set(0, 3.5, z); // Floating a bit above ground
      // Face towards incoming track
      coreGeo.rotation.x = Math.PI / 8; // slight tilt
      coreGeo.isPickable = false;

      this.blackHoleRings = []; // removed inner rings to keep it clean

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

    // Slowly rotate the black hole effect
    this.blackHole.rotation.z += dt * 0.5;
    this.blackHole.position.z += effectiveVelocity * dt;

    const dist = Vector3.Distance(this.ball.position, this.blackHole.position);
    
    // Suck-in logic towards the direct center of the goal
    if (dist < 5) {
      this.blackHoleSucking = true;
    }

    if (this.blackHoleSucking) {
      // Move ball with the track movement so relative distance closes correctly
      this.ball.position.z += effectiveVelocity * dt;

      const pullStrength = dt * 5.0; 
      // Pull heavily towards center
      this.ball.position = Vector3.Lerp(this.ball.position, this.blackHole.position, pullStrength);
      
      // Visually shrink ball to look like it's getting sucked in
      const scaleDown = Math.max(0.01, dist / 5);
      this.ball.scaling.set(scaleDown, scaleDown, scaleDown);
    }
    
    // Victory trigger - more lenient distance or if ball is already tiny
    if (dist < 1.5 || (this.blackHoleSucking && this.ball.scaling.x < 0.1)) {
      this.triggerVictory();
      return;
    }
  }

  triggerVictory() {
    this.gameState = 'victory';
    this.ball.visibility = 0;
    this.ball.scaling.set(1,1,1); // reset for next play
    this.unlockNextLevel();
    const level = LEVELS[this.currentLevel - 1];
    const victoryTitle = document.querySelector('#victory h1');
    if (victoryTitle) victoryTitle.textContent = level.name;
    const victorySubtitle = document.querySelector('#victory p');
    if (victorySubtitle) victorySubtitle.textContent = this.currentLevel < LEVELS.length ? '关卡完成!' : '恭喜通关全部关卡!';
    this.ui.nextLevelBtn.style.display = this.currentLevel < LEVELS.length ? 'block' : 'none';
    this.ui.comboDisplay.style.display = 'none';
    this.ui.victory.style.display = 'block';
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }
  }

  unlockNextLevel() {
    const nextLevel = this.currentLevel + 1;
    if (nextLevel <= LEVELS.length && !this.unlockedLevels.includes(nextLevel)) {
      this.unlockedLevels.push(nextLevel);
    }
  }

  createRippleEffect(segment) {
    // Emptied: Visual effects removed, only track depression remains
  }

  updateRipples(dt) {
    // Emptied: Visual effects removed
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
      const currentGap = Math.abs(this.blackHole.position.z - this.ball.position.z);
      // How much the black hole has moved towards us from its spawn
      const traveledSinceSpawn = Math.max(0, this.blackHoleInitialDist - currentGap);
      const currentDistance = this.distanceAtSpawn + traveledSinceSpawn;
      
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
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }
  }

  continueGame() {
    if (this.continueCount <= 0) return;
    this.continueCount--;
    this.ui.gameOver.style.display = 'none';
    this.clearShatterParticles();
    this.ball.visibility = 1;
    this.ball.position.set(0, BOUNCE_HEIGHT + SPHERE_RADIUS, 0);
    this.ballMaterial.diffuseColor = this.ballColor;
    this.ballMaterial.emissiveColor = this.ballColor.scale(0.2);
    this.ballMaterial.emissiveIntensity = 0;
    this.sharedVelocity = 0;
    this.ballVY = 0;
    this.onGround = false;
    this.justLandedSegment = null;
    this.landingCooldown = 0;
    this.ballLeftGround = true;
    this.currentSegmentIndex = 0;
    this.gameState = 'countdown';
    this.speedBoostActive = false;
    this.speedBoostTimer = 0;
    this.glowLayer.intensity = 0.8;
    this.clearSpeedBoostParticles();
    this.ui.comboDisplay.style.display = 'none';
    if (this.comboTimeout) clearTimeout(this.comboTimeout);

    // Start countdown
    let count = 3;
    this.ui.countdownDisplay.style.display = 'block';
    this.ui.countdownDisplay.textContent = count;

    const countInterval = setInterval(() => {
      count--;
      if (count > 0) {
        this.ui.countdownDisplay.textContent = count;
      } else {
        clearInterval(countInterval);
        this.ui.countdownDisplay.style.display = 'none';
        this.gameState = 'playing';
        this.lastTime = performance.now();
      }
    }, 1000);
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
