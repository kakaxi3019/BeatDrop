import fs from 'fs';
import audioDecode from 'audio-decode';
import MusicTempo from 'music-tempo';

const MUSIC_FILE = '../../music/BetweenWorlds.mp3';
const START_OFFSET = 28; // 从第28秒开始

async function main() {
  console.log('Loading audio file...');
  const fileBuffer = fs.readFileSync(MUSIC_FILE);
  const audioBuffer = await audioDecode(fileBuffer);

  console.log('Audio decoded. Sample rate:', audioBuffer.sampleRate, 'Duration:', audioBuffer.duration.toFixed(2), 's');

  console.log('Analyzing beats from offset', START_OFFSET, '...');

  // Get channel data and create mono mix
  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel = audioBuffer.getChannelData(1);
  const mono = new Float32Array(leftChannel.length);
  for (let i = 0; i < leftChannel.length; i++) {
    mono[i] = (leftChannel[i] + rightChannel[i]) / 2;
  }

  // Detect beats using music-tempo
  const mt = new MusicTempo(mono);
  const allBeats = mt.beats; // beats in seconds

  // Filter to only keep beats after START_OFFSET
  const beats = allBeats.filter(t => t >= START_OFFSET);

  console.log('Total beats found:', beats.length, '(BPM:', Number(mt.tempo).toFixed(1), ')');

  // Calculate segment types (random 33% each)
  const segmentTypes = beats.map(() => {
    const r = Math.random();
    if (r < 0.333) return 'straight';
    if (r < 0.666) return 'double';
    return 'triple';
  });

  // Calculate spacing (based on 0.5 second interval)
  const BASE_INTERVAL = 0.5;
  const BASE_SPACING = 8.3; // SEGMENT_LENGTH(8) + SEGMENT_GAP(0.3)
  const spacing = [];

  for (let i = 0; i < beats.length - 1; i++) {
    const interval = beats[i + 1] - beats[i];
    const spacingCoeff = Math.max(0.5, Math.min(3, interval / BASE_INTERVAL));
    spacing.push(BASE_SPACING * spacingCoeff);
  }
  // Last track needs spacing to black hole
  spacing.push(BASE_SPACING * 2);

  const output = {
    songName: 'BetweenWorlds',
    startOffset: START_OFFSET,
    bpm: mt.tempo,
    beats: beats,
    segmentTypes: segmentTypes,
    spacing: spacing,
    totalSegments: beats.length
  };

  const outPath = '../../src/audio/beatmap-level3.json';
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log('Beatmap saved to', outPath);
  console.log('Total segments:', output.totalSegments);
}

main().catch(console.error);
