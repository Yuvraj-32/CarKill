// ============================================================================
// Network.js — Socket.io networking with coordinate transforms
// Server uses (x,y) in [0,3000]. Three.js uses (x,z) in [0,300].
// ============================================================================

const SCALE = 10; // server units per 3D unit

export function toServer(x3d, z3d, angle, speed) {
    return {
        x:     Math.round(x3d * SCALE),
        y:     Math.round(z3d * SCALE),
        angle: angle,
        speed: Math.round(speed * SCALE)
    };
}

export function fromServer(sx, sy) {
    return { x: sx / SCALE, z: sy / SCALE };
}

export class Network {
    constructor() {
        this.socket = null;
        this.callbacks = {};
    }

    connect() {
        // `io` is a global from the Socket.io client script
        this.socket = io();
        this._setupListeners();
    }

    joinGame(name, vehicleType) {
        this.socket.emit('playerJoin', { name, vehicleType });
    }

    sendPosition(x3d, z3d, angle, speed) {
        if (!this.socket) return;
        this.socket.emit('playerMove', toServer(x3d, z3d, angle, speed));
    }

    sendCollision(targetId, force) {
        if (!this.socket) return;
        this.socket.emit('collision', { targetId, force });
    }

    sendPitFall() {
        if (!this.socket) return;
        this.socket.emit('pitFall');
    }

    sendRiverFall() {
        if (!this.socket) return;
        this.socket.emit('riverFall');
    }

    sendCollectCoin(value) {
        if (!this.socket) return;
        this.socket.emit('collectCoin', { value });
    }

    get id() {
        return this.socket ? this.socket.id : null;
    }

    on(event, callback) {
        this.callbacks[event] = callback;
    }

    disconnect() {
        if (this.socket) this.socket.disconnect();
    }

    // ---- Internal ----

    _setupListeners() {
        const s = this.socket;

        s.on('currentPlayers', (players) => {
            const mapped = players.map(p => this._mapPlayer(p));
            this._emit('currentPlayers', mapped);
        });

        s.on('playerJoined', (p) => {
            this._emit('playerJoined', this._mapPlayer(p));
        });

        s.on('playerLeft', (data) => {
            this._emit('playerLeft', data);
        });

        s.on('gameState', (players) => {
            const mapped = players.map(p => this._mapPlayer(p));
            this._emit('gameState', mapped);
        });

        s.on('playerHit', (data) => {
            this._emit('playerHit', data);
        });

        s.on('playerDied', (data) => {
            this._emit('playerDied', data);
        });

        s.on('playerRespawned', (p) => {
            this._emit('playerRespawned', this._mapPlayer(p));
        });

        s.on('leaderboard', (data) => {
            this._emit('leaderboard', data);
        });

        s.on('coinCollected', (data) => {
            this._emit('coinCollected', data);
        });
    }

    _mapPlayer(p) {
        const pos = fromServer(p.x, p.y);
        return {
            ...p,
            x3d: pos.x,
            z3d: pos.z,
            angle: p.angle
        };
    }

    _emit(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event](data);
        }
    }
}
