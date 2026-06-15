// ============================================================
// PlayerManager.js — Player data factory and vehicle definitions
// Handles player creation, spawn points, and vehicle type stats
// ============================================================

// --- Vehicle type definitions with combat/physics stats ---
const VEHICLE_TYPES = {
    car:    { maxSpeed: 400, maxHealth:  80, turnSpeed: 220, drag: 300, width: 40, height: 20 },
    pickup: { maxSpeed: 320, maxHealth: 120, turnSpeed: 180, drag: 350, width: 48, height: 24 },
    van:    { maxSpeed: 250, maxHealth: 180, turnSpeed: 140, drag: 400, width: 56, height: 28 },
    tank:   { maxSpeed: 180, maxHealth: 280, turnSpeed: 100, drag: 500, width: 64, height: 36 }
};

// --- Arena dimensions ---
const ARENA_WIDTH  = 3000;
const ARENA_HEIGHT = 3000;

// --- Bright color palette for player vehicles ---
const BRIGHT_COLORS = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
    '#e67e22', '#1abc9c', '#fd79a8', '#00cec9', '#6c5ce7'
];

/**
 * getRandomColor()
 * Returns a random bright hex color from the palette.
 */
function getRandomColor() {
    return BRIGHT_COLORS[Math.floor(Math.random() * BRIGHT_COLORS.length)];
}

/**
 * getRandomSpawnPoint()
 * Returns {x, y} within the arena bounds, with a 200px safety margin
 * on all sides to prevent spawning at the very edges.
 */
function getRandomSpawnPoint() {
    const MARGIN = 200;
    return {
        x: MARGIN + Math.random() * (ARENA_WIDTH  - MARGIN * 2),
        y: MARGIN + Math.random() * (ARENA_HEIGHT - MARGIN * 2)
    };
}

/**
 * createPlayer(id, name, vehicleType)
 * Factory function — builds a fresh player object with random spawn
 * and color, using the stats from the chosen vehicle type.
 *
 * @param {string} id          - Unique socket / player id
 * @param {string} name        - Display name chosen by the player
 * @param {string} vehicleType - Key into VEHICLE_TYPES (e.g. 'car', 'tank')
 * @returns {object} Complete player state object
 */
function createPlayer(id, name, vehicleType) {
    // Default to 'car' if an invalid type is provided
    const type = VEHICLE_TYPES[vehicleType] ? vehicleType : 'car';
    const stats = VEHICLE_TYPES[type];
    const spawn = getRandomSpawnPoint();

    return {
        id:          id,
        name:        name,
        x:           spawn.x,
        y:           spawn.y,
        angle:       0,
        speed:       0,
        health:      stats.maxHealth,
        maxHealth:   stats.maxHealth,
        kills:       0,
        deaths:      0,
        vehicleType: type,
        color:       getRandomColor(),
        coins:       0
    };
}

// --- Public API ---
module.exports = {
    VEHICLE_TYPES,
    ARENA_WIDTH,
    ARENA_HEIGHT,
    createPlayer,
    getRandomColor,
    getRandomSpawnPoint
};
