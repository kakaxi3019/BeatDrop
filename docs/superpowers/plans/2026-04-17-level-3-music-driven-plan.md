# 第3关音乐驱动实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现第3关 - 根据音乐重音动态生成轨道，重音间隔决定轨道间距

**Architecture:**
- 创建 `scripts/audio/analyze-beats.js` 节拍分析脚本，输出重音时间和轨道类型数据
- 修改 `TrackManager.initialize()` 支持接收预计算的重音数据并生成对应间距的轨道
- 修改 `Game.js` 支持第3关的特殊逻辑：初始高处落下、28秒音乐起始、黑洞胜利、距离计数器动态切换

**Tech Stack:** Node.js, web-audio-beat-detector, audio-loader

---

## 文件结构

```
scripts/audio/analyze-beats.js          # 新增：节拍分析脚本
src/audio/beatmap-level3.json          # 新增：预生成的重音数据
src/game/Track.js                      # 修改：TrackManager支持自定义间距
src/game/Game.js                       # 修改：LEVELS添加第3关、支持第3关特殊逻辑
index.html                             # 修改：添加第3关按钮
```

---

## Task 1: 创建节拍分析脚本

**Files:**
- Create: `scripts/audio/analyze-beats.js`
- Run: `node scripts/audio/analyze-beats.js`

- [ ] **Step 1: 创建 scripts/audio 目录并编写分析脚本**

```javascript
// scripts/audio/analyze-beats.js
import fs from 'fs';
import { analyze } from 'web-audio-beat-detector';
import audioLoader from 'audio-loader';

const MUSIC_FILE = '../music/BetweenWorlds.mp3';
const START_OFFSET = 28; // 从第28秒开始

async function main() {
  console.log('Loading audio file...');
  const audioBuffer = await audioLoader(MUSIC_FILE);

  console.log('Analyzing beats from offset', START_OFFSET, '...');
  const allBeats = await analyze(audioBuffer);

  // 过滤只保留 START_OFFSET 之后的节拍
  const beats = allBeats.filter(t => t >= START_OFFSET);

  console.log('Total beats found:', beats.length);

  // 计算轨道类型（随机33% each）
  const segmentTypes = beats.map(() => {
    const r = Math.random();
    if (r < 0.333) return 'straight';
    if (r < 0.666) return 'double';
    return 'triple';
  });

  // 计算间距（以0.5秒为基准）
  const BASE_INTERVAL = 0.5;
  const BASE_SPACING = 8.3; // SEGMENT_LENGTH(8) + SEGMENT_GAP(0.3)
  const spacing = [];

  for (let i = 0; i < beats.length - 1; i++) {
    const interval = beats[i + 1] - beats[i];
    const spacingCoeff = Math.max(0.5, Math.min(3, interval / BASE_INTERVAL));
    spacing.push(BASE_SPACING * spacingCoeff);
  }
  // 最后一个轨道后面也需要间距（到黑洞）
  spacing.push(BASE_SPACING * 2);

  const output = {
    songName: 'BetweenWorlds',
    startOffset: START_OFFSET,
    beats: beats,
    segmentTypes: segmentTypes,
    spacing: spacing,
    totalSegments: beats.length
  };

  const outPath = '../src/audio/beatmap-level3.json';
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log('Beatmap saved to', outPath);
  console.log('Total segments:', output.totalSegments);
}

main().catch(console.error);
```

- [ ] **Step 2: 安装音频分析依赖**

Run: `npm install web-audio-beat-detector audio-loader`

- [ ] **Step 3: 运行分析脚本**

Run: `node scripts/audio/analyze-beats.js`
Expected: 生成 `src/audio/beatmap-level3.json` 文件

- [ ] **Step 4: 提交**

```bash
git add scripts/audio/analyze-beats.js src/audio/beatmap-level3.json package.json package-lock.json
git commit -m "feat(level3): Add beat analysis script for music-driven track generation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
"
```

---

## Task 2: 添加第3关到 LEVELS 配置

**Files:**
- Modify: `src/game/Game.js:23-26`

- [ ] **Step 1: 添加第3关配置到 LEVELS 数组**

```javascript
const LEVELS = [
  { id: 1, name: "Miller's Planet", nameCn: "第1关", trackTypes: ['straight', 'double'], jumpsToWin: 1 },
  { id: 2, name: "Mann's World", nameCn: "第2关", trackTypes: ['straight', 'double', 'triple'], jumpsToWin: 10 },
  { id: 3, name: "Echoes of Earth", nameCn: "第3关", trackTypes: ['straight', 'double', 'triple'], jumpsToWin: 'dynamic' }
];
```

- [ ] **Step 2: 更新 getLevelDescription 添加第3关描述**

```javascript
getLevelDescription(level) {
  if (level.id === 1) return '训练关 · 直线 + 少量双色轨道 · 1跳';
  if (level.id === 2) return '训练关 · 直线 + 双色 + 三色轨道 · 10跳';
  if (level.id === 3) return '音乐驱动 · 根据重音生成轨道';
  return '混合轨道';
}
```

- [ ] **Step 3: 提交**

```bash
git add src/game/Game.js
git commit -m "feat(level3): Add level 3 configuration

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
"
```

---

## Task 3: 修改 TrackManager 支持自定义间距和轨道数据

**Files:**
- Modify: `src/game/Track.js:362-450`
- Input: `src/audio/beatmap-level3.json`

- [ ] **Step 1: 修改 initialize 方法支持可选的beatmap数据**

```javascript
initialize(levelConfig, beatmap = null) {
  this.clear();
  this.levelConfig    = levelConfig;
  this.availableTypes = levelConfig.trackTypes;
  this.pathColor      = null;
  this.blocksSinceLastStraight = 0;
  this.beatmap = beatmap;
  this.beatmapIndex = 0;

  const firstColor = this.randomColor();
  this.pathColor   = firstColor.color;

  if (beatmap) {
    // 音乐驱动模式：使用beatmap数据生成轨道
    this.generateFromBeatmap(firstColor);
  } else {
    // 原有模式：固定数量轨道
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
}
```

- [ ] **Step 2: 添加 generateFromBeatmap 方法**

```javascript
generateFromBeatmap(firstColor) {
  const beatmap = this.beatmap;

  // 第一个轨道
  this.segments.push(this.createSegment('straight', 0, firstColor));

  let currentZ = SEGMENT_LENGTH + this.segmentGap;

  for (let i = 0; i < beatmap.segmentTypes.length; i++) {
    const type = beatmap.segmentTypes[i];
    const spacing = beatmap.spacing[i];

    let segColor;
    if (type === 'straight') {
      segColor = this.randomColor();
      this.pathColor = segColor.color;
    } else {
      segColor = { key: null, color: this.pathColor };
    }

    this.segments.push(this.createSegment(type, -currentZ, segColor));
    currentZ += spacing;
  }
}
```

- [ ] **Step 3: 添加 recycleSegment 的音乐驱动支持**

```javascript
recycleSegment(index, newZ) {
  this.segments[index].dispose();

  if (!this.beatmap) {
    // 原有模式
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
  } else {
    // 音乐驱动模式：不再回收，因为轨道数量固定
    return null;
  }
}
```

- [ ] **Step 4: 提交**

```bash
git add src/game/Track.js
git commit -m "feat(level3): TrackManager supports beatmap-driven track generation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
"
```

---

## Task 4: 修改 Game.js 支持第3关特殊逻辑

**Files:**
- Modify: `src/game/Game.js`
- Input: `src/audio/beatmap-level3.json`

- [ ] **Step 1: 添加 beatmap 数据导入和音频控制相关属性**

在 constructor 中添加：
```javascript
this.beatmap = null;
this.audioElement = null;
this.isLastSegmentApproaching = false;
```

- [ ] **Step 2: 添加 loadBeatmap 方法**

```javascript
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
```

- [ ] **Step 3: 修改 startLevel 方法支持第3关**

在 `startLevel` 方法开头添加 beatmap 加载逻辑：
```javascript
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

  // ... 其余现有代码保持不变 ...
}
```

- [ ] **Step 4: 添加 startLevel 中的第3关特殊初始化**

在 `startLevel` 方法中，重置 ball 位置后添加：
```javascript
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
```

- [ ] **Step 5: 添加 setupAudio 方法**

```javascript
setupAudio() {
  if (this.audioElement) {
    this.audioElement.pause();
    this.audioElement = null;
  }
  this.audioElement = new Audio('./music/BetweenWorlds.mp3');
  this.audioElement.loop = false;
}
```

- [ ] **Step 6: 在 startLevel 中添加音频启动逻辑**

在 UI 更新代码后添加：
```javascript
// 第3关：启动音乐从28秒开始
if (levelId === 3) {
  this.setupAudio();
  this.audioElement.currentTime = 28;
  this.audioElement.play();
}
```

- [ ] **Step 7: 修改 update 方法添加距离计数器逻辑**

在 `update` 方法的 playing 状态处理中，找到位置更新逻辑后添加：

```javascript
// 第3关：距离计数器
if (this.currentLevel === 3 && this.beatmap) {
  const totalSegments = this.beatmap.totalSegments;
  const lastSegIndex = this.segments.length - 1;
  const lastSeg = this.segments[lastSegIndex];

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
```

- [ ] **Step 8: 添加黑洞胜利逻辑**

在 `update` 方法中，在 `handleLanding` 调用后添加：

```javascript
// 第3关：检查是否跳完所有轨道
if (this.currentLevel === 3 && this.collisionCount >= this.beatmap.totalSegments && !this.blackHoleActive) {
  this.blackHoleActive = true;
  this.blackHoleZ = -50;
  this.createBlackHole();
}
```

- [ ] **Step 9: 在游戏结束时停止音乐**

找到 `gameOver` 或 `victory` 状态设置的位置，添加：

```javascript
if (this.audioElement) {
  this.audioElement.pause();
  this.audioElement = null;
}
```

- [ ] **Step 10: 提交**

```bash
git add src/game/Game.js
git commit -m "feat(level3): Game.js supports music-driven level 3 with audio sync and victory

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
"
```

---

## Task 5: 添加第3关关卡按钮到 HTML

**Files:**
- Modify: `index.html` (通过 JS 动态添加)

- [ ] **Step 1: 第3关已在 buildLevelList 中动态生成，无需修改 HTML**

实际上无需修改，buildLevelList 会自动读取 LEVELS 数组生成按钮。

- [ ] **Step 2: 提交（无变更，跳过）**

---

## Task 6: 测试和验证

**Files:**
- Test: `npm run dev`

- [ ] **Step 1: 启动开发服务器**

Run: `npm run dev`
Expected: Vite 开发服务器启动，无报错

- [ ] **Step 2: 测试第3关加载**

1. 打开浏览器访问 http://localhost:5173
2. 选择第3关
3. 验证：
   - [ ] 球从高处(y=8)落下
   - [ ] 音乐从28秒位置开始播放
   - [ ] 轨道数量与 beatmap 一致
   - [ ] 重音间隔长的地方轨道间距变大
   - [ ] double/triple 轨道颜色逻辑正确

- [ ] **Step 3: 测试终点临近逻辑**

1. 等待游戏进行到最后一个轨道出现
2. 验证：
   - [ ] 右上角从 "???m" 变为剩余距离
   - [ ] 距离实时刷新

- [ ] **Step 4: 测试胜利流程**

1. 跳完所有轨道
2. 验证：
   - [ ] 黑洞出现
   - [ ] 球被吸入
   - [ ] 胜利界面显示
   - [ ] 音乐停止

---

## 验收标准检查

1. [ ] `scripts/audio/analyze-beats.js` 成功分析音乐并生成 `beatmap-level3.json`
2. [ ] 第3关出现在关卡选择界面
3. [ ] 球从 y=8 高处自然落下到第一个轨道
4. [ ] 音乐从第28秒开始播放
5. [ ] 轨道数量与检测到的重音数量一致
6. [ ] 重音间隔越长，轨道间距越大
7. [ ] double 轨道保证至少一个颜色与 pathColor 匹配
8. [ ] 最后一个轨道出现后，右上角显示剩余距离
9. [ ] 跳完所有轨道后黑洞出现并触发胜利
10. [ ] 游戏结束时音乐停止
