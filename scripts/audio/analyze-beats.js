import fs from 'fs';
import audioDecode from 'audio-decode';

const MUSIC_FILE = '../../music/BetweenWorlds.mp3';
const START_OFFSET = 28; // 从第28秒开始

// 使用局部自适应阈值的 onset 检测
function detectOnsetsWithLocalThreshold(samples, sampleRate) {
  const windowSize = 2048;
  const hopSize = 512;
  const localWindowFrames = Math.floor(sampleRate / hopSize * 0.5); // 500ms 局部窗口

  // 第一步：计算每帧的能量
  const energies = [];
  for (let i = 0; i < samples.length - windowSize; i += hopSize) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) {
      energy += samples[i + j] * samples[i + j];
    }
    energies.push(energy / windowSize);
  }

  // 第二步：计算能量变化率（一阶差分，只取正向）
  const flux = [];
  for (let i = 1; i < energies.length; i++) {
    const diff = energies[i] - energies[i - 1];
    flux.push(Math.max(0, diff));
  }

  // 第三步：使用局部自适应阈值检测重音
  const onsets = [];
  const minFramesBetweenOnsets = Math.floor(sampleRate / hopSize * 0.15); // 150ms 最小间隔

  for (let i = localWindowFrames; i < flux.length - localWindowFrames; i++) {
    // 计算局部窗口的统计量
    let sum = 0;
    let count = 0;
    for (let j = -localWindowFrames; j <= localWindowFrames; j++) {
      if (j !== 0) { // 排除当前帧
        sum += flux[i + j];
        count++;
      }
    }
    const localMean = sum / count;

    // 计算局部标准差
    let varianceSum = 0;
    for (let j = -localWindowFrames; j <= localWindowFrames; j++) {
      if (j !== 0) {
        varianceSum += (flux[i + j] - localMean) ** 2;
      }
    }
    const localStd = Math.sqrt(varianceSum / count);

    // 局部阈值：mean + 2.5 * std（更更严格）
    const threshold = localMean + 2.5 * localStd;

    // 检测是否为局部最大值且超过阈值
    if (flux[i] > threshold) {
      const isLocalMax = flux[i] >= flux[i-1] && flux[i] >= flux[i+1];

      if (isLocalMax) {
        const time = (i * hopSize) / sampleRate;

        // 检查与上一个重音的间隔
        const lastOnset = onsets.length > 0 ? onsets[onsets.length - 1] : -1;
        const minInterval = 0.15; // 150ms 最小间隔

        if (lastOnset < 0 || time - lastOnset >= minInterval) {
          onsets.push(time);
        }
      }
    }
  }

  return onsets;
}

// 二次检测：补充第一轮遗漏的较弱重音（用于密集段）
function detectSecondaryOnsets(samples, sampleRate, primaryOnsets) {
  const windowSize = 2048;
  const hopSize = 512;
  const localWindowFrames = Math.floor(sampleRate / hopSize * 0.3); // 300ms 窗口

  // 计算能量
  const energies = [];
  for (let i = 0; i < samples.length - windowSize; i += hopSize) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) {
      energy += samples[i + j] * samples[i + j];
    }
    energies.push(energy / windowSize);
  }

  const flux = [];
  for (let i = 1; i < energies.length; i++) {
    const diff = energies[i] - energies[i - 1];
    flux.push(Math.max(0, diff));
  }

  const secondaryOnsets = [];

  for (let i = localWindowFrames; i < flux.length - localWindowFrames; i++) {
    const time = (i * hopSize) / sampleRate;

    // 只考虑已经被 primary onsets 占据的时段附近
    // 在每个 primary onset 周围 200ms 范围内寻找次级峰值
    const nearPrimary = primaryOnsets.some(p => Math.abs(time - p) < 0.2);

    if (nearPrimary) {
      // 计算局部阈值
      let sum = 0;
      for (let j = -localWindowFrames; j <= localWindowFrames; j++) {
        if (j !== 0) sum += flux[i + j];
      }
      const localMean = sum / (2 * localWindowFrames);

      // 次级阈值更低
      if (flux[i] > localMean + 0.5 * Math.sqrt(localMean)) {
        const isLocalMax = flux[i] >= flux[i-1] && flux[i] >= flux[i+1];
        if (isLocalMax) {
          secondaryOnsets.push(time);
        }
      }
    }
  }

  return secondaryOnsets;
}

async function main() {
  console.log('Loading audio file...');
  const fileBuffer = fs.readFileSync(MUSIC_FILE);
  const audioBuffer = await audioDecode(fileBuffer);

  console.log('Audio decoded. Duration:', audioBuffer.duration.toFixed(2), 's');

  // Get channel data and create mono mix
  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel = audioBuffer.getChannelData(1);
  const mono = new Float32Array(leftChannel.length);
  for (let i = 0; i < leftChannel.length; i++) {
    mono[i] = (leftChannel[i] + rightChannel[i]) / 2;
  }

  console.log('Detecting onsets with local adaptive threshold...');

  // 第一轮检测：主要重音
  let onsets = detectOnsetsWithLocalThreshold(mono, audioBuffer.sampleRate);
  console.log('Primary onsets:', onsets.length);

  // 过滤 START_OFFSET 之后
  onsets = onsets.filter(t => t >= START_OFFSET);
  console.log('After offset filter:', onsets.length);

  // 第二轮检测：补充次级重音（仅在密集段）
  const secondary = detectSecondaryOnsets(mono, audioBuffer.sampleRate, onsets);
  const filteredSecondary = secondary.filter(t => t >= START_OFFSET);
  console.log('Secondary onsets:', filteredSecondary.length);

  // 合并：保留 primary，在稀疏段补充 secondary
  const allOnsets = [...onsets];
  for (const s of filteredSecondary) {
    // 只添加与已有 onset 间隔至少 100ms 的
    const tooClose = allOnsets.some(p => Math.abs(s - p) < 0.1);
    if (!tooClose) {
      allOnsets.push(s);
    }
  }
  onsets = allOnsets.sort((a, b) => a - b);

  console.log('Total merged onsets:', onsets.length);

  // Calculate segment types (random 33% each)
  const segmentTypes = onsets.map(() => {
    const r = Math.random();
    if (r < 0.333) return 'straight';
    if (r < 0.666) return 'double';
    return 'triple';
  });

  // Calculate spacing based on onset intervals
  const BASE_SPACING = 8.3;
  const spacing = [];

  for (let i = 0; i < onsets.length - 1; i++) {
    const interval = onsets[i + 1] - onsets[i];
    const spacingCoeff = Math.max(0.6, Math.min(5, interval / 0.3));
    spacing.push(BASE_SPACING * spacingCoeff);
  }
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

  // 打印间隔分布统计
  if (onsets.length > 1) {
    const intervals = [];
    for (let i = 1; i < onsets.length; i++) {
      intervals.push(onsets[i] - onsets[i-1]);
    }
    intervals.sort((a, b) => a - b);
    const min = intervals[0];
    const max = intervals[intervals.length - 1];
    const median = intervals[Math.floor(intervals.length / 2)];
    const q1 = intervals[Math.floor(intervals.length * 0.25)];
    const q3 = intervals[Math.floor(intervals.length * 0.75)];
    console.log('Interval stats: min=', min.toFixed(2), 's, Q1=', q1.toFixed(2), 's, median=', median.toFixed(2), 's, Q3=', q3.toFixed(2), 's, max=', max.toFixed(2), 's');

    // 统计密集段和稀疏段
    const dense = intervals.filter(i => i < 0.4).length;
    const medium = intervals.filter(i => i >= 0.4 && i < 1.0).length;
    const sparse = intervals.filter(i => i >= 1.0).length;
    console.log('Dense (<0.4s):', dense, ', Medium (0.4-1.0s):', medium, ', Sparse (>1.0s):', sparse);
  }
}

main().catch(console.error);
