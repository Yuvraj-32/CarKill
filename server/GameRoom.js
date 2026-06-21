// ============================================================
// GameRoom.js — Authoritative game room managing all players
// Owns the canonical player map and processes combat events
// ============================================================

const PlayerManager = require('./PlayerManager');

class GameRoom {
    constructor() {
        /** @type {Map<string, object>} Socket id → player state */
        this.players = new Map();

        // Match timing & state
        this.matchDuration  = 10 * 60;                                           // 10 minutes in seconds
        this.matchTimeLeft  = 10 * 60;
        this.matchState     = 'playing';                                          // 'playing' | 'celebrating'

        // Map generation — randomised each round
        this.mapSeed  = Math.floor(Math.random() * 1000000);
        this.mapTheme = ['wasteland', 'toxic', 'storm'][Math.floor(Math.random() * 3)];
    }

    // ----------------------------------------------------------
    // Player lifecycle
    // ----------------------------------------------------------

    /**
     * addPlayer — Create and register a new player in the room.
     * @param {string} id          - Socket id
     * @param {string} name        - Display name
     * @param {string} vehicleType - Vehicle key (car/pickup/van/tank)
     * @returns {object} The newly created player object
     */
    addPlayer(id, name, vehicleType) {
        const player = PlayerManager.createPlayer(id, name, vehicleType);
        this.players.set(id, player);
        return player;
    }

    /**
     * removePlayer — Delete a player from the room.
     * @param {string} id - Socket id
     * @returns {object|null} The removed player, or null if not found
     */
    removePlayer(id) {
        const player = this.players.get(id);
        if (!player) return null;
        this.players.delete(id);
        return player;
    }

    // ----------------------------------------------------------
    // Movement
    // ----------------------------------------------------------

    /**
     * updatePlayerPosition — Patch a player's motion state.
     * Only writes if the player exists; silently ignores unknown ids
     * (e.g. a late packet arriving after disconnect).
     */
    updatePlayerPosition(id, data) {
        const player = this.players.get(id);
        if (!player) return;

        player.x     = data.x;
        player.y     = data.y;
        player.angle = data.angle;
        player.speed = data.speed;
    }

    // ----------------------------------------------------------
    // Combat
    // ----------------------------------------------------------

    /**
     * handleCollision — Process a ram/collision between two players.
     *
     * Validation:
     *   1. Both attacker and target must exist.
     *   2. Distance between them must be < 150 px.
     *   3. Force is capped at 50; damage = force / 5 (max 10 per hit).
     *
     * @param {string} attackerId - Socket id of the ramming player
     * @param {string} targetId  - Socket id of the target player
     * @param {number} force     - Raw collision force from the client
     * @returns {object} Result: { valid, damage, killed, killer, victim }
     */
    handleCollision(attackerId, targetId, force) {
        // Block all damage while the celebration phase is active
        if (this.matchState === 'celebrating') {
            return { valid: false, damage: 0, killed: false, killer: null, victim: null };
        }

        const attacker = this.players.get(attackerId);
        const target   = this.players.get(targetId);

        if (!attacker || !target) {
            return { valid: false, damage: 0, killed: false, killer: null, victim: null };
        }

        // Distance check — increased to 400 for 3D coordinate sync tolerance
        const dx   = attacker.x - target.x;
        const dy   = attacker.y - target.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= 400) {
            return { valid: false, damage: 0, killed: false, killer: null, victim: null };
        }

        // Damage: force * 0.4, minimum 10 — ~5 strong hits kills a car (80 HP)
        const cappedForce = Math.min(force, 50);
        const damage      = Math.max(cappedForce * 0.4, 10);

        target.health -= damage;
        let killed = false;

        if (target.health <= 0) {
            target.health = 0;
            killed = true;
            attacker.kills += 1;
            attacker.coins += 5;  // reward coins for kill
            target.deaths  += 1;
        }

        return {
            valid:  true,
            damage: damage,
            killed: killed,
            killer: attacker,
            victim: target,
            attackerX: attacker.x,
            attackerY: attacker.y
        };
    }

    // ----------------------------------------------------------
    // Match management
    // ----------------------------------------------------------

    /**
     * startNewRound — Generate a fresh map seed/theme, reset the
     * match timer, and respawn every player with zeroed stats.
     */
    startNewRound() {
        this.mapSeed       = Math.floor(Math.random() * 1000000);
        this.mapTheme      = ['wasteland', 'toxic', 'storm'][Math.floor(Math.random() * 3)];
        this.matchTimeLeft = this.matchDuration;
        this.matchState    = 'playing';

        // Reset all player scores and respawn at new positions
        this.players.forEach(player => {
            player.kills  = 0;
            player.deaths = 0;
            player.coins  = 0;
            const spawn   = require('./PlayerManager').getRandomSpawnPoint();
            player.health = player.maxHealth;
            player.x      = spawn.x;
            player.y      = spawn.y;
            player.speed  = 0;
        });
    }

    /**
     * getWinner — Return the player with the highest kill count.
     * Returns null if the room is empty.
     */
    getWinner() {
        let winner = null;
        this.players.forEach(player => {
            if (!winner || player.kills > winner.kills) winner = player;
        });
        return winner;
    }

    /**
     * getMapConfig — Return the current map seed and theme.
     * @returns {{ seed: number, theme: string }}
     */
    getMapConfig() {
        return { seed: this.mapSeed, theme: this.mapTheme };
    }

    // ----------------------------------------------------------
    // Respawn
    // ----------------------------------------------------------

    /**
     * respawnPlayer — Reset a dead player to full health at a new
     * random spawn point, with zero speed.
     */
    respawnPlayer(id) {
        const player = this.players.get(id);
        if (!player) return;

        const spawn   = PlayerManager.getRandomSpawnPoint();
        player.health = player.maxHealth;
        player.x      = spawn.x;
        player.y      = spawn.y;
        player.speed  = 0;
    }

    /**
     * respawnWithUpgrade — Respawn with a new vehicle type if affordable.
     * Vehicle prices: car=0, pickup=10, van=25, tank=50
     */
    respawnWithUpgrade(id, newVehicleType) {
        const player = this.players.get(id);
        if (!player) return null;
        if (player.health > 0) return null; // not dead

        const prices = { car: 0, pickup: 10, van: 25, tank: 50 };
        const type = PlayerManager.VEHICLE_TYPES[newVehicleType] ? newVehicleType : player.vehicleType;
        const cost = prices[type] || 0;

        if (player.coins < cost) return null; // can't afford
        player.coins -= cost;

        // Upgrade vehicle stats
        if (type !== player.vehicleType) {
            const stats = PlayerManager.VEHICLE_TYPES[type];
            player.vehicleType = type;
            player.maxHealth = stats.maxHealth;
        }

        // Respawn at new location
        const spawn = PlayerManager.getRandomSpawnPoint();
        player.health = player.maxHealth;
        player.x = spawn.x;
        player.y = spawn.y;
        player.speed = 0;

        return player;
    }

    /**
     * handlePitFall — Player fell into a pit. Increment deaths,
     * decrement kills (min 0), and set health to 0.
     */
    handlePitFall(id) {
        const player = this.players.get(id);
        if (!player) return null;
        if (player.health <= 0) return null; // already dead

        player.health  = 0;
        player.deaths += 1;
        if (player.kills > 0) player.kills -= 1;

        return player;
    }

    /**
     * handleRiverFall — Player fell into the river. Same as pit fall.
     */
    handleRiverFall(id) {
        return this.handlePitFall(id);
    }

    // ----------------------------------------------------------
    // Serialization / queries
    // ----------------------------------------------------------

    /**
     * getGameState — Snapshot of every player, suitable for
     * broadcasting to all clients each server tick.
     */
    getGameState() {
        const state = [];
        this.players.forEach((player) => {
            state.push({
                id:          player.id,
                name:        player.name,
                x:           player.x,
                y:           player.y,
                angle:       player.angle,
                speed:       player.speed,
                health:      player.health,
                maxHealth:   player.maxHealth,
                vehicleType: player.vehicleType,
                color:       player.color,
                kills:       player.kills,
                coins:       player.coins
            });
        });
        return state;
    }

    /**
     * getLeaderboard — Top 10 players ranked by kills (desc).
     */
    getLeaderboard() {
        const sorted = Array.from(this.players.values())
            .sort((a, b) => b.kills - a.kills)
            .slice(0, 10);

        return sorted.map((p) => ({
            id:          p.id,
            name:        p.name,
            kills:       p.kills,
            deaths:      p.deaths,
            vehicleType: p.vehicleType,
            coins:       p.coins
        }));
    }

    /**
     * getPlayerCount — How many players are currently in the room.
     */
    getPlayerCount() {
        return this.players.size;
    }
}

module.exports = GameRoom;
