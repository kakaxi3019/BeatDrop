# BeatDrop 关卡数据隔离设计

## 目标

将第 1、2 关（训练关）与第 3 关及未来第 4、5 关（音乐关）的数据完全隔离，使每个音乐关拥有独立的音乐文件和 beatmap JSON，新增关卡不影响现有关卡。

## 现状问题

- `LEVELS` 配置重复定义于 `TrainingGame.js` 和 `BeatmapGame.js` 两处
- `BeatmapGame` 的音频路径和 beatmap 路径硬编码为 `./music/BetweenWorlds.mp3` 和 `./src/audio/beatmap-level3.json`
- `main.js` 中存在 `if (levelId === 3)` 硬编码判断，新增第 4、5 关需改此处代码

## 设计方案：扩展关卡配置（方案 A）

### 1. 统一 LEVELS 配置

新建 `src/config/levels.js`，内容：

```javascript
export const LEVELS = [
  { id: 1, name: "Miller's Planet", nameCn: "训练关 1", trackTypes: ['straight'], jumpsToWin: 5, isTraining: true },
  { id: 2, name: "Mann's World", nameCn: "训练关 2", trackTypes: ['straight', 'double', 'triple'], jumpsToWin: 8, isTraining: true },
  { id: 3, name: "Echoes of Earth", nameCn: "第3关", trackTypes: ['straight', 'double', 'triple'], jumpsToWin: 'dynamic', isTraining: false, audioFile: './music/BetweenWorlds.mp3', beatmapFile: './src/audio/beatmap-level3.json', startOffset: 28 },
];
```

训练关 1-2 无 `audioFile`、`beatmapFile`、`startOffset` 字段（值为 undefined）。

### 2. BeatmapGame 改造

**setupAudio()**：从 `levelConfig.audioFile` 读取，不再硬编码。

**loadBeatmap()**：从 `levelConfig.beatmapFile` 读取，不再硬编码。

### 3. main.js 简化

移除 `if (levelId === 3)` 硬编码，改为通用判断：

```javascript
selectLevel(levelId) {
  const levelConfig = LEVELS.find(l => l.id === levelId);
  if (levelConfig.isTraining) {
    // 使用 TrainingGame（当前 game 实例不变）
    currentGame.startLevel(levelId);
  } else {
    // 使用 BeatmapGame
    currentGame = new BeatmapGame(canvas);
    window.onresize = () => { currentGame.resize(); };
    currentGame.selectLevel(levelId);
  }
}
```

### 4. BeatmapGame.selectLevel() 改造

当用户从音乐关内选择返回训练关时，`BeatmapGame.selectLevel()` 也需同步改造：

```javascript
selectLevel(levelId) {
  const levelConfig = LEVELS.find(l => l.id === levelId);
  if (levelConfig.isTraining) {
    const trainingGame = new TrainingGame(this.canvas);
    trainingGame.unlockedLevels = this.unlockedLevels;
    trainingGame.start();
    trainingGame.selectLevel(levelId);
    window.dispatchEvent(new CustomEvent('gameSwitch', { detail: { game: trainingGame } }));
  } else {
    this.startLevel(levelId);  // 留在 BeatmapGame
  }
}
```

### 5. 后续新增关卡流程

新增第 4 关（音乐关）只需：

1. 在 `levels.js` 添加配置：`{ id: 4, name: "...", audioFile: './music/xxx.mp3', beatmapFile: './src/audio/beatmap-level4.json', startOffset: X, ... }`
2. 提供音乐文件和 `beatmap-level4.json`
3. **零代码逻辑改动**

## 改动文件清单

| 文件 | 改动 |
|------|------|
| `src/config/levels.js` | 新建，统一 LEVELS 导出 |
| `src/game/TrainingGame.js` | 删除本地 LEVELS，改为 import `{ LEVELS }` |
| `src/game/BeatmapGame.js` | 删除本地 LEVELS，改为 import；setupAudio/loadBeatmap 从配置读 |
| `src/main.js` | selectLevel 硬编码判断改为 `levelConfig.isTraining` 通用判断 |

## 隔离保障

- 音乐文件和 beatmap JSON 完全按关卡独立
- 一个关卡的数据损坏（文件缺失/JSON 格式错误）不影响其他关卡
- 仅训练关和 BeatmapGame 共享 TrainingGame 类，音乐关之间仅共享 BeatmapGame 代码逻辑（不共享数据）