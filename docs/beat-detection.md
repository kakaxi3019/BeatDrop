# 音乐节拍检测与轨道生成

## 目标
将音乐的重音/节拍位置转换为游戏的轨道距离数据，使球的跳跃节奏与音乐节拍同步。

---

## 方案对比

### 方案A：实时音频分析（不推荐）
- **方式**：游戏运行时使用 Web Audio API 实时分析
- **问题**：音频解码有延迟，浏览器性能不稳定，可能检测不准
- **效果**：节拍与音乐容易不同步

### 方案B：预分析 + JSON 导入（推荐）
- **方式**：游戏启动前用 Node.js 脚本分析音乐，生成 beat 数据 JSON
- **优点**：准确、可预览、可调参
- **效果**：节拍与音乐完美同步

### 方案C：手动标记
- **方式**：用 Audacity 标记节拍点，导出 CSV
- **优点**：最准确
- **缺点**：耗时，需要手动处理每首歌
- **适用**：短音乐或要求极高精度时

---

## 推荐方案：Node.js 预分析

### 工具选择

| 工具 | 语言 | 精度 | 难度 | 备注 |
|------|------|------|------|------|
| `web-audio-beat-detector` | Node.js | 高 | 低 | 专用于节拍检测 |
| `audiolib` | Node.js | 中 | 中 | 通用音频处理 |
| `librosa` | Python | 最高 | 高 | 学术级音频分析 |

**推荐使用 `web-audio-beat-detector`**，因为它专门解决节拍检测问题。

---

## 实现步骤

### 第一步：安装依赖

```bash
npm install web-audio-beat-detector audio-loader fs
```

### 第二步：创建分析脚本 `analyze-beats.js`

```javascript
const fs = require('fs');
const { analyze } = require('web-audio-beat-detector');
const audioLoader = require('audio-loader');

// 加载音乐文件
const audioBuffer = await audioLoader('./your-song.mp3');

// 分析节拍
const beats = await analyze(audioBuffer);

// beats 数组包含每个节拍的时间戳（秒）
console.log('检测到节拍数量:', beats.length);
console.log('节拍位置（秒）:', beats);

// 转换为轨道距离数据
// 假设基础速度为 6 单位/秒
const trackSpeed = 6;
const distances = beats.map(time => time * trackSpeed);

// 输出结果
const output = {
  songName: 'Your Song',
  bpm: Math.round(60 / (beats[1] - beats[0])), // 估算 BPM
  totalBeats: beats.length,
  duration: audioBuffer.duration,
  beatDistances: distances,  // 每个节拍对应的轨道距离
  beatTimes: beats           // 每个节拍对应的时间戳
};

fs.writeFileSync('./beat-data.json', JSON.stringify(output, null, 2));
console.log('已生成 beat-data.json');
```

### 第三步：在游戏加载 beat 数据

```javascript
// 加载预分析的数据
async function loadBeatData() {
  const response = await fetch('./beat-data.json');
  return await response.json();
}

// 在游戏中使用
function initWithMusic() {
  const beatData = loadBeatData();
  const beatDistances = beatData.beatDistances;

  // 生成轨道，使得球在每个节拍位置落地
  // 轨道间距 = 连续两个节拍的距离差
  for (let i = 0; i < beatDistances.length - 1; i++) {
    const segmentDistance = beatDistances[i + 1] - beatDistances[i];
    createSegment(segmentDistance);
  }
}
```

---

## 进阶方案：节拍检测参数调优

`web-audio-beat-detector` 支持自定义参数：

```javascript
const options = {
  // 最小节拍间隔（秒），用于过滤噪音
  minInterval: 0.2,

  // 能量阈值（0-1），高于此值认为是节拍
  threshold: 0.5,

  // 预测未来多少秒
  lookahead: 0.1
};

const beats = await analyze(audioBuffer, options);
```

---

## 备选方案：手动标记（最高精度）

### 工具：Audacity
1. 用 Audacity 打开音乐
2. 使用 "Beat Finder" 工具（Analyze > Beat Finder）
3. 调整 Threshold 参数直到标记准确
4. 选中标记，Export Selection as CSV

### 导出格式转换脚本

```javascript
const fs = require('fs');
const csv = require('csv-parse');

// 读取 Audacity 导出的 CSV
const csvData = fs.readFileSync('./beats.csv', 'utf-8');

// 解析 CSV（格式：时间戳, 空）
csv(csvData, { columns: false }, (err, rows) => {
  const beats = rows
    .map(row => parseFloat(row[0]))
    .filter(t => !isNaN(t));

  const output = { beatTimes: beats };
  fs.writeFileSync('./beat-data.json', JSON.stringify(output));
});
```

---

## 游戏同步策略

### 核心思路
球弹跳的周期由 `bouncePeriod = 2 * sqrt(2 * bounceHeight / gravity)` 决定。

要让球在节拍点落地，需要：
1. 根据音乐 BPM 调整游戏速度
2. 或者根据希望的目标 BPM 调整 `bounceHeight`

### 计算公式

```
目标 BPM = 60 / bouncePeriod

如果音乐 BPM = 120
则 bouncePeriod = 0.5 秒

bouncePeriod = 2 * sqrt(2 * bounceHeight / gravity)
0.5 = 2 * sqrt(2 * bounceHeight / 25)
bounceHeight = 0.39
```

### 自动调整脚本

```javascript
function calculateBounceHeightForBPM(targetBPM) {
  const targetPeriod = 60 / targetBPM;
  const bounceHeight = (targetPeriod / 2) ** 2 * gravity / 2;
  return bounceHeight;
}

// 如果音乐是 120 BPM
const bounceHeight = calculateBounceHeightForBPM(120);
console.log('需要的高度:', bounceHeight, '米');
```

---

## 文件输出格式

```json
{
  "songName": "星际穿越 OST",
  "bpm": 120,
  "totalBeats": 245,
  "duration": 122.5,
  "beatTimes": [
    0.0,
    0.5,
    1.0,
    ...
  ],
  "beatDistances": [
    0,
    3,
    6,
    ...
  ]
}
```

---

## 实施建议

1. **先用短音乐测试**：选择 30 秒左右的音乐
2. **可视化预览**：用 `audiowaveform` 生成波形图，对比节拍检测结果
3. **游戏内微调**：提供滑块让玩家调整 beat offset（提前/推迟节拍）
4. **Fallback 方案**：如果检测效果差，使用固定 BPM 的均匀轨道

---

## 下一步

1. 确认使用哪首音乐
2. 决定采用自动检测还是手动标记
3. 运行分析并生成 beat-data.json
4. 集成到游戏代码中
