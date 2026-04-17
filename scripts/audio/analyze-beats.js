import fs from 'fs';
import audioDecode from 'audio-decode';

const MUSIC_FILE = '../../music/BetweenWorlds.mp3';
const START_OFFSET = 28;

// 检测能量突增（Attack Detection）
function detectEnergyAttacks(samples, sampleRate) {
  // 1. 计算短时能量
  const windowSize = Math.floor(sampleRate * 0.02); // 20ms窗口
  const hopSize = Math.floor(windowSize / 4);

  const energy = [];
  for (let i = 0; i < samples.length - windowSize; i += hopSize) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      sum += samples[i + j] * samples[i + j];
    }
    energy.push(sum / windowSize);
  }

  // 2. 计算能量比值（当前帧 / 局部均值）- 捕捉突增
  const localWindow = Math.floor(sampleRate / hopSize * 0.1); // 100ms局部窗口
  const attackRatio = [];

  for (let i = localWindow; i < energy.length - localWindow; i++) {
    // 计算局部均值（排除当前帧）
    let localSum = 0;
    for (let j = -localWindow; j <= localWindow; j++) {
      if (j !== 0) localSum += energy[i + j];
    }
    const localMean = localSum / (2 * localWindow);

    // 当前帧与局部均值的比值
    const ratio = localMean > 0 ? energy[i] / localMean : 0;
    attackRatio.push({
      ratio,
      t: (i * hopSize) / sampleRate,
      energy: energy[i]
    });
  }

  // 3. 找显著的突增：比值超过阈值的局部最大值
  // 使用对数阈值，更符合人耳感知
  const ratios = attackRatio.map(a => a.ratio).sort((a, b) => a - b);
  const ratioMedian = ratios[Math.floor(ratios.length / 2)];
  const ratioQ75 = ratios[Math.floor(ratios.length * 0.75)];
  const ratioQ90 = ratios[Math.floor(ratios.length * 0.90)];

  console.log('Ratio stats: median =', ratioMedian.toFixed(3), ', Q75 =', ratioQ75.toFixed(3), ', Q90 =', ratioQ90.toFixed(3));

  // 使用Q75作为基础阈值，只捕捉明显突增
  const baseThreshold = ratioQ75;

  const onsets = [];
  const minFramesBetween = Math.floor(sampleRate / hopSize * 0.15); // 150ms最小间隔
  const lookbackWindow = Math.floor(sampleRate / hopSize * 0.05); // 50ms回溯窗口

  for (let i = 5; i < attackRatio.length - 5; i++) {
    const current = attackRatio[i];

    // 是局部最大值（5帧窗口内）
    let isLocalMax = true;
    for (let j = i - 5; j <= i + 5; j++) {
      if (j !== i && attackRatio[j].ratio > current.ratio) {
        isLocalMax = false;
        break      }
    }

    // 超过阈值
    if (isLocalMax && current.ratio > baseThreshold) {
      // 在之前的50ms窗口内是否有更强的峰值？
      let hasStrongerBefore = false;
      for (let j = i - lookbackWindow; j < i; j++) {
        if (j >= 0 && attackRatio[j].ratio > current.ratio * 0.8) {
          hasStrongerBefore = true;
          break;
        }
      }

      if (!hasStrongerBefore) {
        // 检查与上一个onset的间隔
        const lastOnsetIdx = onsets.length > 0 ? onsets[onsets.length - 1] : -1;

        if (lastOnsetIdx < 0 || i - lastOnsetIdx >= minFramesBetween) {
          onsets.push(i);
        }
      }
    }
  }

  // 转换为时间
  return onsets.map(idx => attackRatio[idx].t);
}

async function main() {
  console.log('Loading audio file...');
  const fileBuffer = fs.readFileSync(MUSIC_FILE);
  const audioBuffer = await audioDecode(fileBuffer);

  console.log('Audio decoded. Duration:', (audioBuffer.channelData[0].length / audioBuffer.sampleRate).toFixed(2), 's');

  // Get channel data and create mono mix
  const leftChannel = audioBuffer.channelData[0];
  const rightChannel = audioBuffer.channelData[1];
  const mono = new Float32Array(leftChannel.length);
  for (let i = 0; i < leftChannel.length; i++) {
    mono[i] = (leftChannel[i] + rightChannel[i]) / 2;
  }

  console.log('Detecting energy attacks...');
  let onsets = detectEnergyAttacks(mono, audioBuffer.sampleRate);

  // 过滤 START_OFFSET 之后
  onsets = onsets.filter(t => t >= START_OFFSET);

  console.log('Total onsets after filtering:', onsets.length);

  // Calculate segment types (random 33% each)
  const segmentTypes = onsets.map(() => {
    const r = Math.random();
    if (r < 0.333) return 'straight';
    if (r < 0.666) return 'double';
    return 'triple';
  });

  // Calculate spacing
  const BASE_SPACING = 8.3;
  const spacing = [];

  for (let i = 0; i < onsets.length - 1; i++) {
    const interval = onsets[i + 1] - onsets[i];
    const spacingCoeff = Math.max(0.6, Math.min(5, interval / 0.4));
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
  console.log('Beatmap saved. Total segments:', output.totalSegments);

  // 打印各时间段分布
  if (onsets.length > 1) {
    const ranges = [
      [28, 60],
      [60, 120],
      [120, 180],
      [180, 240],
      [240, 324]
    ];

    console.log('\nOnsets per time range:');
    for (const [start, end] of ranges) {
      const count = onsets.filter(t => t >= start && t < end).length;
      const pct = (count / onsets.length * 100).toFixed(1);
      console.log(`  ${start}s - ${end}s:`, count, `onsets (${pct}%)`);
    }

    // 间隔统计
    const intervals = [];
    for (let i = 1; i < Math.min(onsets.length, 100); i++) {
      intervals.push(onsets[i] - onsets[i-1]);
    }
    intervals.sort((a, b) => a - b);
    console.log('\nFirst 100 intervals: min =', intervals[0].toFixed(2), 's, median =', intervals[Math.floor(intervals.length/2)].toFixed(2), 's, max =', intervals[intervals.length-1].toFixed(2), 's');
  }
}

main().catch(console.error);
