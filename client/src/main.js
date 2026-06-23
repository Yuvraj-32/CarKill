// ============================================================================
// main.js — Entry point: shows menu, creates Game on play
// ============================================================================
import { Game } from './Game.js';
import { HUD } from './HUD.js';
import { MobileControls } from './MobileControls.js';
import { AudioManager } from './AudioManager.js';

let game = null;
let audioManager = new AudioManager();

window.addEventListener('DOMContentLoaded', () => {
    const hud = new HUD();
    hud.showMenu();
    hud.hide(); // game HUD hidden until play

    // Set a random theme for the main menu
    const themes = ['wasteland', 'toxic', 'storm'];
    const randomTheme = themes[Math.floor(Math.random() * themes.length)];
    hud.setUITheme(randomTheme);

    // Initialize mobile controls on the menu screen too (touch devices only)
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) {
        // Use a dummy keys object — inputs don't matter on menu, just need the panel
        const dummyKeys = {};
        const menuControls = new MobileControls(dummyKeys);
        menuControls.bindPanelEvents();
        // Show cog button on menu
        const cogBtn = document.getElementById('ctrl-settings-btn');
        if (cogBtn) cogBtn.style.display = 'flex';
    }

    hud.setupMenuHandlers((playerName, vehicleType) => {
        // Hide menu
        hud.hideMenu();

        // Start audio context upon user interaction
        audioManager.init();

        // Create and start the game
        const container = document.getElementById('game-container');
        game = new Game(container, playerName, vehicleType, audioManager);
    });
});
