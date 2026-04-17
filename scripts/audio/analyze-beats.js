import fs from 'fs';
import audioDecode from 'audio-decode';

const MUSIC_FILE = '../../music/BetweenWorlds.mp3';
const START_OFFSET = 28;

// 简化的频谱通量 onset 检测
function spectralFluxOnsetDetection(samples, sampleRate) {
  const windowSize = 1024;
  const hopSize = 512;

  // 预加重滤波器系数
  const preEmphasis = 0.95;

  // 计算每帧的频谱能量
  const frames = [];
  let prevSpectrumSum = 0;

  for (let i = 0; i < samples.length - windowSize; i += hopSize) {
    // 简化的频谱计算（使用均值替代FFT的近似）
    let sum = 0;
    let prevSum = 0;

    for (let j = 0; j < windowSize; j++) {
      const sample = samples[i + j];
      const prevSample = i > 0 ? samples[i + j - hopSize] : 0;
      sum += sample * sample;

      const diff = sample - preEmphasis * prevSample;
      prevSum += diff * diff;
    }

    const spectrum = sum / windowSize;
    const prevSpectrum = prevSpectrumSum / windowSize;

    // 频谱通量：当前帧与前一帧的频谱差异
    const flux = Math.max(0, spectrum - prevSpectrum);

    frames.push({
      flux,
      spectrum,
      time: (i + windowSize / 2) / sampleRate
    });

    prevSpectrumSum = spectrum;
  }

  // 使用全局中位数作为阈值（完全由音乐数据决定）
  const allFlux = frames.map(f => f.flux).sort((a, b) => a - b);
  const median = allFlux[Math.floor(allFlux.length / 2)];
  const mad = allFlux.map(v => Math.abs(v - median)).sort((a, b) => a - b)[Math.floor(allFlux.length / 2)];
  const threshold = median + 3 * mad; // 3倍中位绝对偏差

  // 检测 onset：找频谱通量超过阈值的局部最大值
  const onsets = [];

  for (let i = 1; i < frames.length - 1; i++) {
    const f = frames[i];

    // 是局部最大值
    const isLocalMax = f.flux >= frames[i - 1].flux && f.flux >= frames[i + 1].flux;

    // 超过阈值
    const exceedsThreshold = f.flux > threshold;

    if (isLocalMax && exceedsThreshold) {
      // 最小间隔 250ms（400ms对应约150 BPM的一半，250ms更合理）
      const tooClose = onsets.length > 0 && f.time - onsets[onsets.length - 1] < 0.25;

      if (!tooClose) {
        onsets.push(f.time);
      }
    }
  }

  return onsets;
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

  console.log('Detecting onsets using spectral flux...');
  let onsets = spectralFluxOnsetDetection(mono, audioBuffer.sampleRate);

  // 过滤 START_OFFSET 之后
  onsets = onsets.filter(t => t >= START_OFFSET);

  console.log('Total onsets:', onsets.length);

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

  // 打印间隔统计
  if (onsets.length > 1) {
    const intervals = [];
    for (let i = 1; i < onsets.length; i++) {
      intervals.push(onsets[i] - onsets[i-1]);
    }
    intervals.sort((a, b) => a - b);
    console.log('Interval range:', intervals[0].toFixed(2), 's -', intervals[intervals.length - 1].toFixed(2), 's');
    console.log('Interval median:', intervals[Math.floor(intervals.length / 2)].toFixed(2), 's');
  }
}

main().catch(console.error);
