import { Game } from './game/Game.js';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('renderCanvas');

  // Create and start the game
  const game = new Game(canvas);
  game.start();

  // Handle window resize
  window.addEventListener('resize', () => {
    game.resize();
  });
});
