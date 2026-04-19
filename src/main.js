import { TrainingGame } from './game/TrainingGame.js';
import { BeatmapGame } from './game/BeatmapGame.js';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('renderCanvas');

  let currentGame = new TrainingGame(canvas);

  // Handle game switching
  window.addEventListener('gameSwitch', (e) => {
    currentGame = e.detail.game;
    window.onresize = () => { currentGame.resize(); };
  });

  // Override selectLevel to handle level 3
  const originalSelectLevel = currentGame.selectLevel.bind(currentGame);
  currentGame.selectLevel = (levelId) => {
    if (levelId === 3) {
      // Switch to BeatmapGame
      currentGame = new BeatmapGame(canvas);
      window.onresize = () => { currentGame.resize(); };
      currentGame.selectLevel(3);
    } else {
      originalSelectLevel(levelId);
    }
  };

  currentGame.start();
  window.onresize = () => { currentGame.resize(); };
});
