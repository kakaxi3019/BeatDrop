import fs from 'fs';
import audioDecode from 'audio-decode';

const MUSIC_FILE = '/home/centos/mypro/github/BeatDrop/music/BetweenWorlds.mp3';
const START_OFFSET = 28;

async function main() {
  const fileBuffer = fs.readFileSync(MUSIC_FILE);
  const audioBuffer = await audioDecode(fileBuffer);
  const left = audioBuffer.channelData[0];
  const right = audioBuffer.channelData[1];

  const mono = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) {
    mono[i] = (left[i] + right[i]) / 2;
  }

  const sampleRate = audioBuffer.sampleRate;

  // 计算短时能量
  const windowSize = Math.floor(sampleRate * 0.01);
  const hopSize = Math.floor(windowSize / 2);

  const energy = [];
  for (let i = 0; i < mono.length - windowSize; i += hopSize) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      sum += mono[i + j] * mono[i + j];
    }
    energy.push({ e: sum / windowSize, t: i / sampleRate });
  }

  // 计算 flux
  const flux = [];
  for (let i = 1; i < energy.length; i++) {
    const diff = Math.max(0, energy[i].e - energy[i - 1].e);
    flux.push({ v: diff, t: energy[i].t });
  }

  // 检测所有候选项（用较低的阈值保留足够的选择余地）
  const allFlux = flux.map(f => f.v).sort((a, b) => a - b);
  const threshold = allFlux[Math.floor(allFlux.length * 0.85)];

  // 最小间隔0.65s（接近bounce周期0.693s）
  const MIN_INTERVAL = 0.65;

  let candidates = [];
  for (let i = 3; i < flux.length - 3; i++) {
    const curr = flux[i].v;
    let isLocalMax = true;
    for (let j = i - 3; j <= i + 3; j++) {
      if (j !== i && flux[j].v >= curr) {
        isLocalMax = false;
        break;
      }
    }
    if (isLocalMax && curr > threshold) {
      const t = flux[i].t;
      if (candidates.length === 0 || t - candidates[candidates.length - 1].t >= MIN_INTERVAL) {
        candidates.push({ t, v: curr });
      }
    }
  }

  candidates = candidates.filter(c => c.t >= START_OFFSET);

  // 按时间段分组，每段只保留最强的N个onset
  // bounce周期0.693s，理想间距8.3m，velocity=12时
  // 每段时间内onset数量要控制，避免轨道过密
  const TIME_WINDOW = 15; // 每15秒一段
  const MAX_PER_WINDOW = 8; // 每段最多8个（~2秒一个onset）

  const onsets = [];
  for (let windowStart = START_OFFSET; windowStart < 300; windowStart += TIME_WINDOW) {
    const windowEnd = windowStart + TIME_WINDOW;
    const inWindow = candidates
      .filter(c => c.t >= windowStart && c.t < windowEnd)
      .sort((a, b) => b.v - a.v) // 按强度降序
      .slice(0, MAX_PER_WINDOW)   // 只保留最强的MAX_PER_WINDOW个
      .sort((a, b) => a.t - b.t); // 按时间排序
    onsets.push(...inWindow.map(c => c.t));
  }

  console.log('Total onsets:', onsets.length);
  for (let start = 28; start < 324; start += 30) {
    const count = onsets.filter(t => t >= start && t < start + 30).length;
    console.log(`${start}s-${start + 30}s: ${count} onsets`);
  }

  // 计算每个onset对应的能量值
  const onsetEnergies = onsets.map(onsetTime => {
    // 在energy数组中找到对应时间的能量值
    const idx = energy.findIndex(e => e.t >= onsetTime);
    if (idx === -1) return energy[energy.length - 1].e;
    return energy[idx].e;
  });

  // 归一化能量值到0-1范围
  const minEnergy = Math.min(...onsetEnergies);
  const maxEnergy = Math.max(...onsetEnergies);
  const rangeEnergy = maxEnergy - minEnergy;

  // 轨道类型：根据能量强度决定
  // 低能量（安静部分）→ 大部分直轨
  // 高能量（高潮部分）→ 更多双轨和三轨
  const segmentTypes = onsets.map((_, i) => {
    const normEnergy = rangeEnergy > 0 ? (onsetEnergies[i] - minEnergy) / rangeEnergy : 0;

    // 前30%的onset（音乐开头部分）主要用直轨，简化难度
    const isEarlyPhase = i < onsets.length * 0.3;

    if (isEarlyPhase) {
      // 开头的音乐：80%直轨，15%双轨，5%三轨
      const r = Math.random();
      if (r < 0.80) return 'straight';
      if (r < 0.95) return 'double';
      return 'triple';
    } else {
      // 中后期：根据能量决定
      // 低于中位能量：直轨为主
      // 高于中位能量：双轨和三轨为主
      if (normEnergy < 0.4) {
        const r = Math.random();
        if (r < 0.70) return 'straight';
        if (r < 0.90) return 'double';
        return 'triple';
      } else if (normEnergy < 0.7) {
        const r = Math.random();
        if (r < 0.30) return 'straight';
        if (r < 0.70) return 'double';
        return 'triple';
      } else {
        const r = Math.random();
        if (r < 0.15) return 'straight';
        if (r < 0.50) return 'double';
        return 'triple';
      }
    }
  });

  console.log('\nSegment type distribution:');
  const counts = { straight: 0, double: 0, triple: 0 };
  segmentTypes.forEach(t => counts[t]++);
  console.log(`  straight: ${counts.straight} (${(counts.straight / segmentTypes.length * 100).toFixed(1)}%)`);
  console.log(`  double: ${counts.double} (${(counts.double / segmentTypes.length * 100).toFixed(1)}%)`);
  console.log(`  triple: ${counts.triple} (${(counts.triple / segmentTypes.length * 100).toFixed(1)}%)`);

  // 按时间分段统计
  console.log('\nSegment types by time period:');
  for (let start = 28; start < 324; start += 30) {
    const inRange = segmentTypes.filter((_, i) => onsets[i] >= start && onsets[i] < start + 30);
    if (inRange.length > 0) {
      const s = inRange.filter(t => t === 'straight').length;
      const d = inRange.filter(t => t === 'double').length;
      const tr = inRange.filter(t => t === 'triple').length;
      console.log(`  ${start}s-${start + 30}s: straight=${s}, double=${d}, triple=${tr}`);
    }
  }

  // 计算间距
  // bouncePeriod = 2 * sqrt(2 * 1.5 / 25) = 0.693s
  // bounce距离 = 8.3m（velocity=12时）
  // 目标：spacing = onset_interval × TARGET_VELOCITY
  // TARGET_VELOCITY = 12，使得interval=0.693s时spacing=8.3m（理想）
  // interval=0.5s时spacing=6m（偏小），interval=1s时spacing=12m（偏大）
  const TARGET_VELOCITY = 12;
  const MIN_SPACING = 6.5; // 防止过密（保证不重叠）
  const MAX_SPACING = 13;  // 防止过大

  const spacing = [];
  for (let i = 0; i < onsets.length - 1; i++) {
    const interval = onsets[i + 1] - onsets[i];
    let s = interval * TARGET_VELOCITY;
    s = Math.max(MIN_SPACING, Math.min(MAX_SPACING, s));
    spacing.push(s);
  }
  spacing.push(15); // 最后一个到黑洞的间距

  console.log('\nFirst 10 spacing:', spacing.slice(0, 10).map(s => s.toFixed(1)));

  const output = {
    songName: 'BetweenWorlds',
    startOffset: START_OFFSET,
    onsets: onsets,
    segmentTypes: segmentTypes,
    spacing: spacing,
    totalSegments: onsets.length
  };

  fs.writeFileSync('/home/centos/mypro/github/BeatDrop/src/audio/beatmap-level3.json', JSON.stringify(output, null, 2));
  console.log('Saved.');
}

main().catch(console.error);
