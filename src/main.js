import { TrainingGame } from './game/TrainingGame.js';
import { BeatmapGame } from './game/BeatmapGame.js';
import { LEVELS } from './config/levels.js';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('renderCanvas');

  let currentGame = new TrainingGame(canvas);

  // Handle game switching
  window.addEventListener('gameSwitch', (e) => {
    currentGame = e.detail.game;
    window.onresize = () => { currentGame.resize(); };
  });

  const originalSelectLevel = currentGame.selectLevel.bind(currentGame);
  currentGame.selectLevel = (levelId) => {
    const level = LEVELS.find(l => l.id === levelId);
    if (!level) return;
    if (level.isTraining) {
      originalSelectLevel(levelId);
    } else {
      currentGame.stopRenderLoop();
      currentGame = new BeatmapGame(canvas);
      window.onresize = () => { currentGame.resize(); };
      currentGame.selectLevel(levelId);
    }
  };

  currentGame.start();
  window.onresize = () => { currentGame.resize(); };
});
