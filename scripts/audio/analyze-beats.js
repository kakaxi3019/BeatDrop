import fs from 'fs';
import audioDecode from 'audio-decode';

const MUSIC_FILE = '../../music/BetweenWorlds.mp3';
const START_OFFSET = 28; // 从第28秒开始
const SAMPLE_RATE = 44100;

// 简化版重音检测：计算频谱质心变化
function detectProminentOnsets(samples, sampleRate) {
  const windowSize = 2048;
  const hopSize = 1024;

  // 第一步：计算每帧的频谱质心和能量
  const frames = [];
  for (let i = 0; i < samples.length - windowSize; i += hopSize) {
    const frame = samples.slice(i, i + windowSize);

    // 计算频谱（简化的功率谱）
    let energy = 0;
    let weightedFreq = 0;
    for (let j = 0; j < windowSize; j++) {
      energy += frame[j] * frame[j];
    }
    energy = energy / windowSize;

    // 计算频谱质心的简版（用零点交叉率作为频率估计）
    let zeroCrossings = 0;
    for (let j = 1; j < windowSize; j++) {
      if ((frame[j-1] >= 0 && frame[j] < 0) || (frame[j-1] < 0 && frame[j] >= 0)) {
        zeroCrossings++;
      }
    }
    const zcr = zeroCrossings / windowSize;

    frames.push({
      energy,
      zcr,
      time: (i + windowSize/2) / sampleRate
    });
  }

  // 第二步：计算能量变化率
  const energyChanges = [];
  for (let i = 1; i < frames.length; i++) {
    const change = (frames[i].energy - frames[i-1].energy) / (frames[i-1].energy + 1e-10);
    energyChanges.push({
      change,
      time: frames[i].time,
      energy: frames[i].energy
    });
  }

  // 第三步：找到显著的能量爆发点
  // 使用全局统计：只保留超过平均值+2.5*标准差的点（更严格的阈值）
  const changes = energyChanges.map(f => f.change);
  const mean = changes.reduce((a,b) => a+b, 0) / changes.length;
  const std = Math.sqrt(changes.reduce((a,b) => a+(b-mean)**2, 0) / changes.length);
  const threshold = mean + 2.5 * std;

  // 第四步：聚类相邻的重音点
  const rawOnsets = [];
  for (let i = 0; i < energyChanges.length; i++) {
    if (energyChanges[i].change > threshold) {
      // 检查是否是局部最大值
      if (i > 0 && i < energyChanges.length - 1) {
        if (energyChanges[i].change > energyChanges[i-1].change &&
            energyChanges[i].change > energyChanges[i+1].change) {
          rawOnsets.push(energyChanges[i].time);
        }
      }
    }
  }

  return rawOnsets;
}

async function main() {
  console.log('Loading audio file...');
  const fileBuffer = fs.readFileSync(MUSIC_FILE);
  const audioBuffer = await audioDecode(fileBuffer);

  console.log('Audio decoded. Sample rate:', audioBuffer.sampleRate, 'Duration:', audioBuffer.duration.toFixed(2), 's');

  // Get channel data and create mono mix
  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel = audioBuffer.getChannelData(1);
  const mono = new Float32Array(leftChannel.length);
  for (let i = 0; i < leftChannel.length; i++) {
    mono[i] = (leftChannel[i] + rightChannel[i]) / 2;
  }

  console.log('Detecting prominent onsets from offset', START_OFFSET, '...');

  // 检测显著重音
  const rawOnsets = detectProminentOnsets(mono, audioBuffer.sampleRate);
  console.log('Raw onsets found:', rawOnsets.length);

  // 过滤只保留 START_OFFSET 之后的
  let onsets = rawOnsets.filter(t => t >= START_OFFSET);

  // 第五步：合并距离太近的重音（500ms内只保留最强的）
  const minGap = 0.5; // 最小间隔500ms
  const mergedOnsets = [];
  let clusterStart = -1;
  let clusterMax = 0;
  let clusterMaxTime = 0;

  for (let i = 0; i < onsets.length; i++) {
    if (clusterStart < 0) {
      clusterStart = onsets[i];
      clusterMax = onsets[i];
      clusterMaxTime = onsets[i];
    } else if (onsets[i] - clusterStart < minGap) {
      // 同一cluster，保留能量最大的
      if (onsets[i] > clusterMax) {
        clusterMax = onsets[i];
        clusterMaxTime = onsets[i];
      }
    } else {
      // 新cluster，保存之前的
      mergedOnsets.push(clusterMaxTime);
      clusterStart = onsets[i];
      clusterMax = onsets[i];
      clusterMaxTime = onsets[i];
    }
  }
  if (clusterStart >= 0) {
    mergedOnsets.push(clusterMaxTime);
  }
  onsets = mergedOnsets;

  console.log('After merging close onsets:', onsets.length);

  // Calculate segment types (random 33% each)
  const segmentTypes = onsets.map(() => {
    const r = Math.random();
    if (r < 0.333) return 'straight';
    if (r < 0.666) return 'double';
    return 'triple';
  });

  // Calculate spacing based on onset intervals
  const BASE_SPACING = 8.3; // SEGMENT_LENGTH(8) + SEGMENT_GAP(0.3)
  const spacing = [];

  for (let i = 0; i < onsets.length - 1; i++) {
    const interval = onsets[i + 1] - onsets[i];
    // 间隔越大，轨道间距越大
    const spacingCoeff = Math.max(0.8, Math.min(4, interval / 0.5));
    spacing.push(BASE_SPACING * spacingCoeff);
  }
  // Last track needs spacing to black hole
  spacing.push(BASE_SPACING * 3);

  const output = {
    songName: 'BetweenWorlds',
    startOffset: START_OFFSET,
    onsets: onsets,
    segmentTypes: segmentTypes,
    spacing: spacing,
    totalSegments: onsets.length
  };

  const outPath = '../../src/audio/beatmap-level3.json';
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log('Beatmap saved to', outPath);
  console.log('Total segments:', output.totalSegments);

  // 打印一些统计信息
  if (onsets.length > 1) {
    const intervals = [];
    for (let i = 1; i < Math.min(20, onsets.length); i++) {
      intervals.push(onsets[i] - onsets[i-1]);
    }
    const avg = intervals.reduce((a,b) => a+b, 0) / intervals.length;
    console.log('First', intervals.length, 'intervals avg:', avg.toFixed(3), 's');
  }
}

main().catch(console.error);
