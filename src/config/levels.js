// src/config/levels.js
export const LEVELS = [
  {
    id: 1,
    name: "Miller's Planet",
    nameCn: "训练关 1",
    trackTypes: ['straight'],
    jumpsToWin: 5,
    isTraining: true,
    trainingDesc: "落到直轨道上，球会变成轨道的颜色"
  },
  {
    id: 2,
    name: "Mann's World",
    nameCn: "训练关 2",
    trackTypes: ['straight', 'double', 'triple'],
    jumpsToWin: 8,
    isTraining: true,
    trainingDesc: "双轨/三轨轨道上，球色必须与轨道色匹配"
  },
  {
    id: 3,
    name: "Echoes of Earth",
    nameCn: "第3关",
    trackTypes: ['straight', 'double', 'triple'],
    jumpsToWin: 'dynamic',
    isTraining: false,
    audioFile: './music/BetweenWorlds.mp3',
    beatmapFile: './src/audio/beatmap-level3.json',
    startOffset: 28
  }
];
