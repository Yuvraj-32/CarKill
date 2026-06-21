// ============================================================
// index.js — ClashWars main server entry point
// Express static file server + Socket.io real-time game server
// ============================================================

const path    = require('path');
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const GameRoom = require('./GameRoom');

// --- Express + HTTP setup ---
const app    = express();
const server = http.createServer(app);

// Serve the client/ directory (one level up from server/)
app.use(express.static(path.join(__dirname, '..', 'client')));

// --- Socket.io setup with wide-open CORS for dev ---
const io = new Server(server, {
    cors: { origin: '*' }
});

// --- Single global game room ---
const room = new GameRoom();

// ============================================================
// Socket event handling
// ============================================================
io.on('connection', (socket) => {
    console.log(`[Connect] Socket ${socket.id} connected`);

    // ----------------------------------------------------------
    // playerJoin — A new player enters the arena
    // ----------------------------------------------------------
    socket.on('playerJoin', (data) => {
        const name        = data.name || 'Anonymous';
        const vehicleType = data.vehicleType || 'car';

        const player = room.addPlayer(socket.id, name, vehicleType);
        console.log(`[Join] ${player.name} (${player.vehicleType}) joined — ${room.getPlayerCount()} players online`);

        // Tell everyone (including sender) about the new player
        io.emit('playerJoined', player);

        // Send the full game state only to the joining player
        socket.emit('currentPlayers', room.getGameState());

        // Send map config and current match timer to joining player
        socket.emit('mapConfig', room.getMapConfig());
        socket.emit('matchTimer', { timeLeft: room.matchTimeLeft, state: room.matchState });

        // Broadcast updated leaderboard
        io.emit('leaderboard', room.getLeaderboard());
    });

    // ----------------------------------------------------------
    // playerMove — Client-authoritative position update
    // ----------------------------------------------------------
    socket.on('playerMove', (data) => {
        room.updatePlayerPosition(socket.id, data);
    });

    // ----------------------------------------------------------
    // collision — Ram / crash event between two vehicles
    // ----------------------------------------------------------
    socket.on('collision', (data) => {
        const result = room.handleCollision(socket.id, data.targetId, data.force);

        if (!result.valid) return;

        // Notify the target that they took damage
        io.to(data.targetId).emit('playerHit', {
            damage: result.damage,
            force: data.force,
            attackerX: result.attackerX,
            attackerY: result.attackerY
        });

        // --- If the target was killed ---
        if (result.killed) {
            // Broadcast death to all clients
            io.emit('playerDied', {
                killerId:   result.killer.id,
                killerName: result.killer.name,
                victimId:   result.victim.id,
                victimName: result.victim.name
            });

            // No auto-respawn — client sends 'requestRespawn'

            // Update leaderboard after a kill
            io.emit('leaderboard', room.getLeaderboard());
        }
    });

    // ----------------------------------------------------------
    // pitFall — Player fell into a pit hole
    // ----------------------------------------------------------
    socket.on('pitFall', () => {
        const victim = room.handlePitFall(socket.id);
        if (!victim) return;

        io.emit('playerDied', {
            killerId:   null,
            killerName: '💀 The Pit',
            victimId:   socket.id,
            victimName: victim.name
        });

        // No auto-respawn — client sends 'requestRespawn'

        io.emit('leaderboard', room.getLeaderboard());
    });

    // ----------------------------------------------------------
    // collectCoin — Player picked up a coin from the ground
    // ----------------------------------------------------------
    socket.on('collectCoin', (data) => {
        const player = room.players.get(socket.id);
        if (!player) return;
        player.coins += (data.value || 1);
        socket.emit('coinCollected', { coins: player.coins });
    });

    // ----------------------------------------------------------
    // riverFall — Player fell into the river
    // ----------------------------------------------------------
    socket.on('riverFall', () => {
        const victim = room.handleRiverFall(socket.id);
        if (!victim) return;

        io.emit('playerDied', {
            killerId:   null,
            killerName: '🌊 The River',
            victimId:   socket.id,
            victimName: victim.name
        });

        // No auto-respawn — client sends 'requestRespawn'

        io.emit('leaderboard', room.getLeaderboard());
    });

    // ----------------------------------------------------------
    // requestRespawn — Player clicked respawn (with optional upgrade)
    // ----------------------------------------------------------
    socket.on('requestRespawn', (data) => {
        const vehicleType = (data && data.vehicleType) || 'car';
        const player = room.respawnWithUpgrade(socket.id, vehicleType);
        if (!player) return;

        const respawned = room.getGameState().find((p) => p.id === socket.id);
        if (respawned) {
            io.emit('playerRespawned', respawned);
        }
        // Send updated coin count to the player
        socket.emit('coinCollected', { coins: player.coins });
        io.emit('leaderboard', room.getLeaderboard());
    });

    // ----------------------------------------------------------
    // disconnect — Player leaves (tab close, network drop, etc.)
    // ----------------------------------------------------------
    socket.on('disconnect', () => {
        const removed = room.removePlayer(socket.id);
        if (removed) {
            console.log(`[Disconnect] ${removed.name} left — ${room.getPlayerCount()} players online`);
        }

        // Tell remaining clients to remove this player
        io.emit('playerLeft', { id: socket.id });

        // Broadcast updated leaderboard
        io.emit('leaderboard', room.getLeaderboard());
    });
});

// ============================================================
// Server tick loop — 20 Hz (every 50 ms)
// Broadcasts authoritative game state to all connected clients
// ============================================================
setInterval(() => {
    io.emit('gameState', room.getGameState());
}, 50);

// ============================================================
// Match timer loop — runs every 1 second
// ============================================================
setInterval(() => {
    if (room.matchState !== 'playing') return;

    room.matchTimeLeft = Math.max(0, room.matchTimeLeft - 1);
    io.emit('matchTimer', { timeLeft: room.matchTimeLeft, state: room.matchState });

    if (room.matchTimeLeft <= 0) {
        // Round over — find winner and enter celebration phase
        room.matchState = 'celebrating';
        const winner = room.getWinner();

        io.emit('matchEnd', {
            winnerId:   winner ? winner.id   : null,
            winnerName: winner ? winner.name : 'No one',
            kills:      winner ? winner.kills : 0
        });

        console.log(`[Match] Round over! Winner: ${winner ? winner.name : 'No one'} with ${winner ? winner.kills : 0} kills`);

        // After 10 seconds of celebration, start a new round
        setTimeout(() => {
            room.startNewRound();
            io.emit('matchStart', room.getMapConfig());
            // Respawn all players with the fresh round state
            const newState = room.getGameState();
            io.emit('roundReset', newState);
            io.emit('leaderboard', room.getLeaderboard());
            console.log(`[Match] New round started! Theme: ${room.mapTheme}, Seed: ${room.mapSeed}`);
        }, 10000);
    }
}, 1000);

// ============================================================
// Start listening
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[ClashWars] Server running on port ${PORT}`);
});
