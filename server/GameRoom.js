// ============================================================
// GameRoom.js — Authoritative game room managing all players
// Owns the canonical player map and processes combat events
// ============================================================

const PlayerManager = require('./PlayerManager');

class GameRoom {
    constructor() {
        /** @type {Map<string, object>} Socket id → player state */
        this.players = new Map();
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
        const attacker = this.players.get(attackerId);
        const target   = this.players.get(targetId);

        // --- Validate both players exist ---
        if (!attacker || !target) {
            return { valid: false, damage: 0, killed: false, killer: null, victim: null };
        }

        // --- Distance check (must be within 150px) ---
        const dx   = attacker.x - target.x;
        const dy   = attacker.y - target.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= 150) {
            return { valid: false, damage: 0, killed: false, killer: null, victim: null };
        }

        // --- Cap force and compute damage ---
        const cappedForce = Math.min(force, 50);
        const damage      = cappedForce / 5;

        // --- Apply damage ---
        target.health -= damage;
        let killed = false;

        if (target.health <= 0) {
            target.health = 0;
            killed = true;
            attacker.kills  += 1;
            target.deaths   += 1;
        }

        return {
            valid:  true,
            damage: damage,
            killed: killed,
            killer: attacker,
            victim: target
        };
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
                kills:       player.kills
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
            vehicleType: p.vehicleType
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
