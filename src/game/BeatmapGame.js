import { Game, BOUNCE_HEIGHT, SPHERE_RADIUS, SEGMENT_LENGTH, SEGMENT_GAP, GRAVITY } from './Game.js';
import { BeatmapTrackManager } from './BeatmapTrackManager.js';
import { TrainingGame } from './TrainingGame.js';

const { Color3, Vector3 } = BABYLON;

const ALL_LEVELS = [
  { id: 1, name: "Miller's Planet", nameCn: "训练关 1", trackTypes: ['straight'], jumpsToWin: 5, isTraining: true },
  { id: 2, name: "Mann's World", nameCn: "训练关 2", trackTypes: ['straight', 'double', 'triple'], jumpsToWin: 8, isTraining: true },
  { id: 3, name: "Echoes of Earth", nameCn: "第3关", trackTypes: ['straight', 'double', 'triple'], jumpsToWin: 'dynamic', isTraining: false }
];

export class BeatmapGame extends Game {
  constructor(canvas) {
    super(canvas);
    this.beatmap = null;
    this.audioElement = null;
    this.savedAudioTime = 0;
    this.isLastSegmentApproaching = false;
  }

  setupTrack() {
    this.trackManager = new BeatmapTrackManager(this.scene);
  }

  getLevelDescription(level) {
    return '音乐驱动 · 根据重音生成轨道';
  }

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
    if (levelId !== 3) {
      // Switch to TrainingGame for non-level-3
      const trainingGame = new TrainingGame(this.canvas);
      trainingGame.unlockedLevels = this.unlockedLevels;
      trainingGame.start();
      trainingGame.selectLevel(levelId);
      window.dispatchEvent(new CustomEvent('gameSwitch', { detail: { game: trainingGame } }));
      return;
    }

    const loaded = await this.loadBeatmap();
    if (!loaded) {
      console.error('Failed to load beatmap for level 3');
      return;
    }

    const level = ALL_LEVELS.find(l => l.id === levelId);
    if (!level) return;

    this.currentLevel = levelId;
    this.collisionCount = 0;
    this.collisionsToWin = this.beatmap.totalSegments;
    this.continueCount = 3;
    this.speedBoostActive = false;
    this.speedBoostTimer = 0;
    this.blackHoleActive = false;
    this.blackHoleSucking = false;
    this.comboCount = 0;
    this.isLastSegmentApproaching = false;

    // Reset ball - level 3 starts with ball dropping from height
    this.ballColor = new Color3(0.2, 0.6, 0.9);
    this.ballMaterial.diffuseColor = this.ballColor;
    this.ballMaterial.emissiveColor = this.ballColor.scale(0.2);
    this.ballMaterial.emissiveIntensity = 0;
    this.ball.visibility = 1;
    this.ball.position = new Vector3(0, 8, 0);
    this.ballVY = 0;
    this.onGround = false;
    this.ballLeftGround = true;
    this.currentSegmentIndex = 0;
    this.sharedVelocity = 0;
    this.lastLandedSegIndex = -1;
    this.currentBounceSegIndex = -1;
    this.gameState = 'playing';

    // Clear effects
    this.clearAllEffects();

    // Init track
    this.trackManager.initialize(level, this.beatmap);

    // Start audio at 28 seconds
    this.setupAudio();
    this.audioElement.currentTime = 28;
    this.audioElement.play();

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
        // Resume audio
        if (this.audioElement) {
          this.audioElement.currentTime = this.savedAudioTime || 28;
          this.audioElement.play();
        }
      }
    }, 1000);
  }

  buildLevelList() {
    this.ui.levelList.innerHTML = '';
    for (const level of ALL_LEVELS) {
      const btn = document.createElement('button');
      const isLocked = !this.unlockedLevels.includes(level.id);
      btn.className = 'level-btn' + (isLocked ? ' locked' : '') + (level.isTraining ? ' training' : '');
      const trainingTag = level.isTraining ? '<span class="training-tag">训练关</span>' : '<span class="music-tag">音乐关</span>';
      btn.innerHTML = `${trainingTag}<span class="level-num">${level.nameCn}</span><span class="level-name">${level.name}</span><span class="level-desc">${this.getLevelDescription(level)}</span><span class="lock-icon">🔒</span>`;
      btn.onclick = () => this.selectLevel(level.id);
      this.ui.levelList.appendChild(btn);
    }
  }

  getLevelDescription(level) {
    if (level.id === 1) return '直轨道 · 学习基础弹跳';
    if (level.id === 2) return '双轨/三轨 · 学习颜色匹配';
    if (level.id === 3) return '音乐驱动 · 根据重音生成轨道';
    return '混合轨道';
  }

  selectLevel(levelId) {
    if (levelId === 3) {
      // Stay in BeatmapGame
      if (!this.unlockedLevels.includes(levelId)) return;
      this.ui.levelSelect.style.display = 'none';
      this.startLevel(levelId);
    } else {
      // Switch to TrainingGame
      if (!this.unlockedLevels.includes(levelId)) return;
      this.ui.levelSelect.style.display = 'none';
      // Create TrainingGame and start the level
      const trainingGame = new TrainingGame(this.canvas);
      trainingGame.unlockedLevels = this.unlockedLevels;
      trainingGame.start();
      trainingGame.selectLevel(levelId);
      // Replace current game reference in main.js would be needed
      // For now, dispatch a custom event
      window.dispatchEvent(new CustomEvent('gameSwitch', { detail: { game: trainingGame } }));
    }
  }

  triggerVictory() {
    this.gameState = 'victory';
    this.ball.visibility = 0;
    this.ball.scaling.set(1, 1, 1);
    this.unlockNextLevel();
    const level = ALL_LEVELS[this.currentLevel - 1];
    const victoryTitle = document.querySelector('#victory h1');
    if (victoryTitle) victoryTitle.textContent = level.name;
    const victorySubtitle = document.querySelector('#victory p');
    if (victorySubtitle) victorySubtitle.textContent = this.currentLevel < ALL_LEVELS.length ? '关卡完成!' : '恭喜通关全部关卡!';
    this.ui.nextLevelBtn.style.display = this.currentLevel < ALL_LEVELS.length ? 'block' : 'none';
    this.ui.comboDisplay.style.display = 'none';
    this.ui.victory.style.display = 'block';
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
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
      this.savedAudioTime = this.audioElement.currentTime;
      this.audioElement.pause();
    }
  }
}
