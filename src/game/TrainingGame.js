import { Game, BOUNCE_HEIGHT, SPHERE_RADIUS, SEGMENT_LENGTH, SEGMENT_GAP, GRAVITY } from './Game.js';
import { TrainingTrackManager } from './TrainingTrackManager.js';

const { Color3, Vector3 } = BABYLON;

const LEVELS = [
  { id: 1, name: "Miller's Planet", nameCn: "训练关 1", trackTypes: ['straight'], jumpsToWin: 5, isTraining: true, trainingDesc: "落到直轨道上，球会变成轨道的颜色" },
  { id: 2, name: "Mann's World", nameCn: "训练关 2", trackTypes: ['straight', 'double', 'triple'], jumpsToWin: 8, isTraining: true, trainingDesc: "双轨/三轨轨道上，球色必须与轨道色匹配" },
  { id: 3, name: "Echoes of Earth", nameCn: "第3关", trackTypes: ['straight', 'double', 'triple'], jumpsToWin: 'dynamic', isTraining: false }
];

export class TrainingGame extends Game {
  setupTrack() {
    this.trackManager = new TrainingTrackManager(this.scene);
  }

  getLevelDescription(level) {
    if (level.id === 1) return '直轨道 · 学习基础弹跳';
    if (level.id === 2) return '双轨/三轨 · 学习颜色匹配';
    if (level.id === 3) return '音乐驱动 · 根据重音生成轨道';
    return '混合轨道';
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
    this.blackHoleSucking = false;
    this.blackHoleClosestSegIndex = -1;
    this.comboCount = 0;

    // Reset ball - training levels start with ball on ground
    this.ballColor = new Color3(0.2, 0.6, 0.9);
    this.ballMaterial.diffuseColor = this.ballColor;
    this.ballMaterial.emissiveColor = this.ballColor.scale(0.2);
    this.ballMaterial.emissiveIntensity = 0;
    this.ball.visibility = 1;
    this.ball.position = new Vector3(0, BOUNCE_HEIGHT + SPHERE_RADIUS, 0);
    this.ballVY = 0;
    this.onGround = true;
    this.justLandedSegment = null;
    this.landingCooldown = 0;
    this.ballLeftGround = true;
    this.currentSegmentIndex = 0;
    this.sharedVelocity = 0;
    this.lastLandedSegIndex = -1;
    this.currentBounceSegIndex = -1;
    this.gameState = 'playing';

    // Clear effects
    this.clearAllEffects();

    // Init track
    this.trackManager.initialize(level);

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
  }

  activateBlackHole() {
    super.activateBlackHole();
    // 记录黑洞激活时，离黑洞最近的轨道索引
    // 球跳过这个轨道后才会被黑洞吸取
    let minZ = Infinity;
    this.blackHoleClosestSegIndex = -1;
    for (let i = 0; i < this.trackManager.segments.length; i++) {
      const seg = this.trackManager.segments[i];
      if (seg.mesh.position.z < minZ) {
        minZ = seg.mesh.position.z;
        this.blackHoleClosestSegIndex = i;
      }
    }
  }

  triggerVictory() {
    this.gameState = 'victory';
    this.ball.visibility = 0;
    this.ball.scaling.set(1, 1, 1);
    this.unlockNextLevel();
    const level = LEVELS.find(l => l.id === this.currentLevel);
    const victoryTitle = document.querySelector('#victory h1');
    if (victoryTitle) victoryTitle.textContent = level ? level.name : '';
    const victorySubtitle = document.querySelector('#victory p');
    if (victorySubtitle) victorySubtitle.textContent = '关卡完成!';
    this.ui.nextLevelBtn.style.display = this.currentLevel < LEVELS.length ? 'block' : 'none';
    this.ui.comboDisplay.style.display = 'none';
    this.ui.victory.style.display = 'block';
  }

  unlockNextLevel() {
    const nextLevel = this.currentLevel + 1;
    if (nextLevel <= 3 && !this.unlockedLevels.includes(nextLevel)) {
      this.unlockedLevels.push(nextLevel);
    }
  }

  nextLevel() {
    const nextLevel = this.currentLevel + 1;
    if (nextLevel <= 3) {
      this.startLevel(nextLevel);
    } else {
      this.showLevelSelect();
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

    // 训练关：球跳过黑洞前最后一个轨道后才被吸取
    // 最后轨道 = 黑洞激活时离黑洞最近的轨道
    if (this.blackHoleActive && !this.blackHoleSucking) {
      // 检查球是否已经跳上黑洞前的最后一个轨道
      if (this.blackHoleClosestSegIndex >= 0 &&
          this.lastLandedSegIndex === this.blackHoleClosestSegIndex) {
        this.blackHoleSucking = true;
      }
    }

    if (this.blackHoleSucking) {
      // Stop normal ball physics - take over movement
      this.onGround = false;
      this.ballVY = 0;

      // Move ball with the track movement so relative distance closes correctly
      this.ball.position.z += effectiveVelocity * dt;

      const pullStrength = dt * 3.0;
      // Pull towards black hole
      this.ball.position = Vector3.Lerp(this.ball.position, this.blackHole.position, pullStrength);

      // Visually shrink ball to look like it's getting sucked in
      const scaleDown = Math.max(0.01, dist / 8);
      this.ball.scaling.set(scaleDown, scaleDown, scaleDown);
    }

    // Victory trigger - close enough or ball is tiny
    if ((this.blackHoleSucking && dist < 1.0) || (this.blackHoleSucking && this.ball.scaling.x < 0.1)) {
      this.triggerVictory();
      return;
    }
  }

  continueGame() {
    if (this.continueCount <= 0) return;
    this.continueCount--;
    this.blackHoleSucking = false;
    this.blackHoleActive = false;
    if (this.blackHole) {
      try {
        this.blackHole.dispose();
      } catch (e) { console.error('blackHole dispose error:', e); }
      this.blackHole = null;
    }
    this.ball.scaling.set(1, 1, 1);
    this.ball.visibility = 1;
    this.clearShatterParticles();
    this.ui.gameOver.style.display = 'none';
    this.ball.position.set(0, BOUNCE_HEIGHT + SPHERE_RADIUS, 0);
    this.ballMaterial.diffuseColor = this.ballColor;
    this.ballMaterial.emissiveColor = this.ballColor.scale(0.2);
    this.ballMaterial.emissiveIntensity = 0;
    this.sharedVelocity = 0;
    this.ballVY = 0;
    this.onGround = true;
    this.ballLeftGround = true;
    this.justLandedSegment = null;
    this.landingCooldown = 0;
    for (let i = 0; i < this.trackManager.segments.length; i++) {
      const seg = this.trackManager.segments[i];
      if (seg.mesh.position.z > 2) {
        seg.landed = false;
      }
    }
    this.lastLandedSegIndex = -1;
    this.currentBounceSegIndex = -1;
    this.justBounced = false;
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
        const bouncePeriod = 2 * Math.sqrt(2 * BOUNCE_HEIGHT / GRAVITY);
        const normalSpeed = (SEGMENT_LENGTH + SEGMENT_GAP) / bouncePeriod;
        let nearestSegDist = Infinity;
        for (let i = 0; i < this.trackManager.segments.length; i++) {
          const segZ = this.trackManager.segments[i].mesh.position.z;
          if (segZ <= 2) {
            nearestSegDist = Math.min(nearestSegDist, Math.abs(segZ));
          }
        }
        if (nearestSegDist === Infinity) nearestSegDist = SEGMENT_LENGTH + SEGMENT_GAP;
        if (nearestSegDist < 4) {
          this.sharedVelocity = normalSpeed;
        } else {
          const calculatedSpeed = nearestSegDist / bouncePeriod;
          this.sharedVelocity = Math.min(calculatedSpeed, normalSpeed * 2);
        }
      }
    }, 1000);
  }

  buildLevelList() {
    this.ui.levelList.innerHTML = '';
    for (const level of LEVELS) {
      const btn = document.createElement('button');
      const isLocked = !this.unlockedLevels.includes(level.id);
      btn.className = 'level-btn' + (isLocked ? ' locked' : '') + (level.isTraining ? ' training' : '');
      const trainingTag = level.isTraining ? '<span class="training-tag">训练关</span>' : '<span class="music-tag">音乐关</span>';
      btn.innerHTML = `${trainingTag}<span class="level-num">${level.nameCn}</span><span class="level-name">${level.name}</span><span class="level-desc">${this.getLevelDescription(level)}</span><span class="lock-icon">🔒</span>`;
      btn.onclick = () => this.selectLevel(level.id);
      this.ui.levelList.appendChild(btn);
    }
  }
}
