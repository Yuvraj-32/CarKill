// ============================================================================
// main.js — Entry point: shows menu, creates Game on play
// ============================================================================
import { Game } from './Game.js';
import { HUD } from './HUD.js';

let game = null;

window.addEventListener('DOMContentLoaded', () => {
    const hud = new HUD();
    hud.showMenu();
    hud.hide(); // game HUD hidden until play

    // Set a random theme for the main menu
    const themes = ['wasteland', 'toxic', 'storm'];
    const randomTheme = themes[Math.floor(Math.random() * themes.length)];
    hud.setUITheme(randomTheme);

    hud.setupMenuHandlers((playerName, vehicleType) => {
        // Hide menu
        hud.hideMenu();

        // Create and start the game
        const container = document.getElementById('game-container');
        game = new Game(container, playerName, vehicleType);
    });
});
