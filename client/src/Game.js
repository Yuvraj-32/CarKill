// ============================================================================
// Game.js — Core 3D game: renderer, scene, camera, loop, networking, combat
// ============================================================================
import * as THREE from 'three';
import { World, ARENA_SIZE } from './World.js';
import { Car, VEHICLE_CONFIGS, colorHexToIndex } from './Car.js';
import { Network, toServer } from './Network.js';
import { HUD } from './HUD.js';
import { ParticleSystem } from './Particles.js';
import { MobileControls } from './MobileControls.js';

export class Game {
    constructor(container, playerName, vehicleType) {
        this.playerName = playerName;
        this.vehicleType = vehicleType;
        this.isDead = false;
        this.isInvulnerable = false;
        this.remotePlayers = {};     // id -> Car
        this.lastCollisionTime = {}; // id -> timestamp
        this.shakeAmount = 0;
        this.flashAlpha = 0;
        this.coins = 0;
        this.rampBoostY = 0;        // current Y boost from ramp
        this.celebratingWinner = false;
        this._worldReady = false; // wait for server mapConfig before building world

        // ---- Renderer ----
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        const isMobile = window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const maxPixelRatio = isMobile ? 1 : 1.5;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        container.appendChild(this.renderer.domElement);

        // ---- Scene ----
        this.scene = new THREE.Scene();

        // ---- Camera ----
        this.camera = new THREE.PerspectiveCamera(
            70, window.innerWidth / window.innerHeight, 0.5, 600
        );

        // ---- World (placeholder — rebuilt with server seed when mapConfig arrives) ----
        this.world = new World(this.scene, 'wasteland', 0);

        // ---- Local player car ----
        const spawnX = 30 + Math.random() * (ARENA_SIZE - 60);
        const spawnZ = 30 + Math.random() * (ARENA_SIZE - 60);
        this.player = new Car(this.scene, spawnX, spawnZ, vehicleType, 0, true);
        this.player.setNameTag(playerName);

        // ---- Particles ----
        this.particles = new ParticleSystem(this.scene);
        window.particleSystem = this.particles;

        // ---- HUD ----
        this.hud = new HUD();
        this.hud.show();
        const cfg = VEHICLE_CONFIGS[vehicleType] || VEHICLE_CONFIGS.car;
        this.hud.setVehicleLabel(vehicleType);
        this.hud.updateHealth(cfg.maxHealth, cfg.maxHealth);
        this.hud.updateCoins(0);

        // ---- Respawn callback from death shop ----
        this.hud.onRespawnCallback = (chosenVehicle) => {
            this.network.requestRespawn(chosenVehicle);
        };

        // ---- Input ----
        this.keys = {};
        this._setupInput();

        // ---- Networking ----
        this.network = new Network();
        this._setupNetwork();
        this.network.connect();
        this.network.joinGame(playerName, vehicleType);

        // ---- Position broadcast (20 Hz) ----
        this._broadcastInterval = setInterval(() => this._sendPosition(), 50);

        // ---- Clock ----
        this.clock = new THREE.Clock();
        this.running = true;

        // ---- Resize handler ----
        this._onResize = () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', this._onResize);

        // ---- Start game loop ----
        this._animate();

        // Request fullscreen when game starts
        const requestFS = document.documentElement.requestFullscreen
            || document.documentElement.webkitRequestFullscreen
            || document.documentElement.mozRequestFullScreen;
        if (requestFS) {
            requestFS.call(document.documentElement).catch(() => {
                // Silently ignore if user blocks fullscreen
            });
        }
    }

    // ========================================================================
    // Game Loop
    // ========================================================================

    _animate() {
        if (!this.running) return;
        requestAnimationFrame(() => this._animate());

        const delta = this.clock.getDelta();

        // 1. Input → physics (local car)
        if (!this.isDead) {
            const input = {
                forward:  this.keys['KeyW'] || this.keys['ArrowUp'],
                backward: this.keys['KeyS'] || this.keys['ArrowDown'],
                left:     this.keys['KeyA'] || this.keys['ArrowLeft'],
                right:    this.keys['KeyD'] || this.keys['ArrowRight'],
                drift:    this.keys['Space']
            };
            this.player.updatePhysics(input, delta);

            // Clamp to arena
            this.world.clampToArena(this.player.group.position);

            // Obstacle collision
            const push = this.world.checkObstacleCollision(
                this.player.group.position, this.player.getRadius()
            );
            if (push) {
                this.player.group.position.x += push.x;
                this.player.group.position.z += push.z;
                this.player.speed *= 0.5;
            }

            // Pit collision — fall in = death + lose points
            const pit = this.world.checkPitCollision(this.player.group.position);
            if (pit) {
                this.network.sendPitFall();
                this.player.speed = 0;
            }

            // River collision — fall in = death (unless on bridge or flying over)
            if (this.player.group.position.y <= 0.1 && this.world.checkRiverCollision(this.player.group.position)) {
                this.network.sendRiverFall();
                this.player.speed = 0;
            }

            // Ramp boost & Air physics
            const rampH = this.world.checkRamp(this.player.group.position);
            if (rampH > 0) {
                this.player.group.position.y = Math.max(this.player.group.position.y, rampH);
                this.player.velocityY = Math.max(10, Math.abs(this.player.speed) * 0.4);
                
                // Speed boost on ramp
                if (Math.abs(this.player.speed) > 5) {
                    this.player.speed *= 1 + delta * 0.5;
                }
            } else {
                if (this.player.group.position.y > 0) {
                    this.player.velocityY = (this.player.velocityY || 0) - 40 * delta; // Gravity
                    this.player.group.position.y += this.player.velocityY * delta;
                    if (this.player.group.position.y < 0) {
                        this.player.group.position.y = 0;
                        this.player.velocityY = 0;
                    }
                } else {
                    this.player.group.position.y = 0;
                    this.player.velocityY = 0;
                }
            }

            // Coin collection
            const collected = this.particles.collectCoins(this.player.getPosition());
            if (collected.length > 0) {
                const total = collected.reduce((a, b) => a + b, 0);
                this.coins += total;
                this.hud.updateCoins(this.coins);
                this.network.sendCollectCoin(total);
            }
        }

        // 2. Interpolate remote players & apply air physics
        for (const id in this.remotePlayers) {
            const remote = this.remotePlayers[id];
            remote.interpolate(0.15);

            // Remote ramp physics
            const rh = this.world.checkRamp(remote.group.position);
            if (rh > 0) {
                remote.group.position.y = Math.max(remote.group.position.y, rh);
                remote.velocityY = Math.max(10, Math.abs(remote.speed || 30) * 0.4);
            } else {
                if (remote.group.position.y > 0) {
                    remote.velocityY = (remote.velocityY || 0) - 40 * delta;
                    remote.group.position.y += remote.velocityY * delta;
                    if (remote.group.position.y < 0) {
                        remote.group.position.y = 0;
                        remote.velocityY = 0;
                    }
                } else {
                    remote.group.position.y = 0;
                    remote.velocityY = 0;
                }
            }
        }

        // 3. Check local-vs-remote collisions
        if (!this.isDead && !this.isInvulnerable) {
            this._checkCollisions();
        }

        // 4. Update camera
        this._updateCamera(delta);

        // 5. Particles
        this.particles.update(delta);

        // 6. World animation (water flow)
        this.world.update(delta);

        // 7. HUD updates
        this.hud.updateHealth(this.player.health, this.player.maxHealth);
        this.hud.updateSpeed(this.player.speed);

        // 8. Screen shake decay
        if (this.shakeAmount > 0) {
            this.shakeAmount *= 0.9;
            if (this.shakeAmount < 0.01) this.shakeAmount = 0;
        }

        // 9. Flash overlay decay
        if (this.flashAlpha > 0) {
            this.flashAlpha -= delta * 5;
            if (this.flashAlpha < 0) this.flashAlpha = 0;
            this._updateFlashOverlay();
        }

        // 10. Render
        this.renderer.render(this.scene, this.camera);
    }

    // ========================================================================
    // Camera
    // ========================================================================

    _updateCamera(delta) {
        // During winner celebration: orbit camera around winner's car
        if (this.celebratingWinner && this._celebrationTarget) {
            this._celebrationAngle = (this._celebrationAngle || 0) + delta * 0.8;
            const target = this._celebrationTarget.getPosition();
            const radius = 18;
            this.camera.position.set(
                target.x + Math.sin(this._celebrationAngle) * radius,
                target.y + 8,
                target.z + Math.cos(this._celebrationAngle) * radius
            );
            this.camera.lookAt(target.x, target.y + 1.5, target.z);
            return;
        }

        if (!this.player.cameraGoal) return;

        const goalPos = new THREE.Vector3();
        this.player.cameraGoal.getWorldPosition(goalPos);

        const lookPos = new THREE.Vector3();
        this.player.cameraLookTarget.getWorldPosition(lookPos);

        // Speed-based camera pull-back: faster = wider view, feels more intense
        const speedRatio = Math.abs(this.player.speed) / (this.player.cfg ? this.player.cfg.maxSpeed : 80);
        const pullBack = speedRatio * 6; // up to +6 units further back at top speed
        const pullUp   = speedRatio * 1.5; // slight upward shift at speed
        goalPos.y += pullUp;

        // Drift: slight sideways camera shift for extra feel
        if (this.player.isDrifting && Math.abs(this.player._smoothSteer || 0) > 0.1) {
            const sideShift = this.player._smoothSteer * -3 * speedRatio;
            goalPos.x += Math.cos(this.player.angle) * sideShift;
            goalPos.z -= Math.sin(this.player.angle) * sideShift;
        }

        // Lerp — slightly slower for smoother camera, faster lerp for tight control
        const lerpFactor = 1 - Math.pow(0.015, delta);
        this.camera.position.lerp(goalPos, lerpFactor);
        this.camera.lookAt(lookPos);

        // Screen shake
        if (this.shakeAmount > 0) {
            this.camera.position.x += (Math.random() - 0.5) * this.shakeAmount;
            this.camera.position.y += (Math.random() - 0.5) * this.shakeAmount * 0.5;
            this.camera.position.z += (Math.random() - 0.5) * this.shakeAmount;
        }
    }

    // ========================================================================
    // Input
    // ========================================================================

    _setupInput() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            // Prevent Space from scrolling the page
            if (e.code === 'Space') e.preventDefault();
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Mobile touch controls
        const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        if (isTouch) {
            this.mobileControls = new MobileControls(this.keys);
            this.mobileControls.show();
            this.mobileControls.bindPanelEvents();
        }
    }

    // ========================================================================
    // Collision detection (local vs remotes)
    // ========================================================================

    _checkCollisions() {
        const myPos = this.player.getPosition();
        const myRadius = this.player.getRadius();
        const now = Date.now();

        for (const id in this.remotePlayers) {
            const remote = this.remotePlayers[id];
            const rPos = remote.getPosition();
            const rRadius = remote.getRadius();

            const dx = myPos.x - rPos.x;
            const dz = myPos.z - rPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const minDist = myRadius + rRadius;

            if (dist < minDist) {
                // Debounce (300ms)
                const lastTime = this.lastCollisionTime[id] || 0;
                if (now - lastTime < 300) continue;
                this.lastCollisionTime[id] = now;

                // Calculate impact force — INCREASED for stronger hits
                const impactSpeed = Math.abs(this.player.speed);
                if (impactSpeed < 3) continue; // ignore very slow contacts

                const force = Math.min(impactSpeed, 50);

                // Send to server
                this.network.sendCollision(id, force);

                // Visual feedback
                this.shakeAmount = force * 0.1;
                const collisionPos = new THREE.Vector3(
                    (myPos.x + rPos.x) / 2,
                    0.5,
                    (myPos.z + rPos.z) / 2
                );
                this.particles.spawnCollision(collisionPos, force / 20);

                // Bounce back physically (Elastic collision effect)
                const overlap = minDist - dist;
                if (overlap > 0 && dist > 0.001) {
                    // Instant push out to prevent sticking
                    this.player.group.position.x += (dx / dist) * overlap * 1.1;
                    this.player.group.position.z += (dz / dist) * overlap * 1.1;

                    // Add massive physical bounce velocity based on impact force
                    const bounceStrength = Math.max(30, force * 1.5);
                    this.player.bounce.x = (dx / dist) * bounceStrength;
                    this.player.bounce.z = (dz / dist) * bounceStrength;
                }

                // Reverse speed and reduce it 
                this.player.speed *= -0.5;
            }
        }
    }

    // ========================================================================
    // Networking
    // ========================================================================

    _setupNetwork() {
        const net = this.network;

        net.on('currentPlayers', (players) => {
            players.forEach(p => {
                if (p.id !== net.id) {
                    this._addRemote(p);
                } else {
                    this.player.group.position.set(p.x3d, 0, p.z3d);
                    this.player.health = p.health;
                    this.coins = p.coins || 0;
                    this.hud.updateCoins(this.coins);
                }
            });
        });

        net.on('playerJoined', (p) => {
            if (p.id !== net.id) {
                this._addRemote(p);
                this.hud.addSystemMessage(p.name + ' joined the arena', 'join');
            }
        });

        net.on('playerLeft', (data) => {
            this._removeRemote(data.id);
        });

        net.on('gameState', (players) => {
            const activeIds = new Set();
            players.forEach(p => {
                activeIds.add(p.id);
                if (p.id === net.id) {
                    // Sync coins from server
                    if (p.coins !== undefined) {
                        this.coins = p.coins;
                        this.hud.updateCoins(this.coins);
                    }
                    return;
                }

                if (this.remotePlayers[p.id]) {
                    this.remotePlayers[p.id].updateFromServer(p.x3d, p.z3d, p.angle);
                    this.remotePlayers[p.id].health = p.health;
                } else {
                    this._addRemote(p);
                }
            });

            // Remove stale remotes
            for (const id in this.remotePlayers) {
                if (!activeIds.has(id)) this._removeRemote(id);
            }
        });

        net.on('playerHit', (data) => {
            if (!this.isDead) {
                this.player.takeDamage(data.damage);
                this.shakeAmount = 0.8;
                this.flashAlpha = 0.5;

                // Spark effect at player position
                this.particles.spawnCollision(this.player.getPosition(), 0.5);

                // Apply physical bounce if attacker coordinates are provided
                if (data.attackerX !== undefined && data.attackerY !== undefined) {
                    const sx = data.attackerX / 10;
                    const sz = data.attackerY / 10;
                    
                    const dx = this.player.group.position.x - sx;
                    const dz = this.player.group.position.z - sz;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    
                    if (dist > 0.001) {
                        const bounceStrength = Math.max(30, (data.force || 20) * 1.5);
                        this.player.bounce.x = (dx / dist) * bounceStrength;
                        this.player.bounce.z = (dz / dist) * bounceStrength;
                    }
                }
            }
        });

        net.on('playerDied', (data) => {
            this.hud.addKill(data.killerName, data.victimName);

            // Explosion + coins at death location
            const victimCar = data.victimId === net.id
                ? this.player
                : this.remotePlayers[data.victimId];

            if (victimCar) {
                const deathPos = victimCar.getPosition().clone();
                deathPos.y = 0.5;
                this.particles.spawnExplosion(deathPos);
                this.particles.spawnCoins(deathPos, 5);
            }

            if (data.victimId === net.id) {
                this._onDeath(data.killerName);
            }

            // Hide remote victim
            if (this.remotePlayers[data.victimId]) {
                this.remotePlayers[data.victimId].group.visible = false;
            }
        });

        net.on('playerRespawned', (p) => {
            if (p.id === net.id) {
                this._onRespawn(p.x3d, p.z3d, p.vehicleType);
            } else if (this.remotePlayers[p.id]) {
                const remote = this.remotePlayers[p.id];
                remote.group.visible = true;
                remote.health = p.health;
                remote.updateFromServer(p.x3d, p.z3d, 0);
            }
        });

        net.on('leaderboard', (data) => {
            this.hud.updateLeaderboard(data, net.id);
        });

        net.on('coinCollected', (data) => {
            this.coins = data.coins;
            this.hud.updateCoins(this.coins);
        });

        // ---- Match system events ----
        net.on('mapConfig', (data) => {
            // Rebuild world with the AUTHORITATIVE server seed — same for all clients
            this.world.destroy();
            this.world = new World(this.scene, data.theme, data.seed);
            this._worldReady = true;
            this.hud.showThemeLabel(data.theme);
            this.hud.setUITheme(data.theme);
        });

        net.on('matchTimer', (data) => {
            this.hud.updateMatchTimer(data.timeLeft);
        });

        net.on('matchEnd', (data) => {
            this.celebratingWinner = true;
            this.hud.showWinnerBanner(data.winnerName, data.kills);
            // Try to focus camera on winner
            if (data.winnerId && this.remotePlayers[data.winnerId]) {
                this._celebrationTarget = this.remotePlayers[data.winnerId];
            } else if (data.winnerId === net.id) {
                this._celebrationTarget = this.player;
            }
        });

        net.on('matchStart', (data) => {
            // Rebuild world with new theme
            this.hud.hideWinnerBanner();
            this.celebratingWinner = false;
            this._celebrationTarget = null;
            this.world.destroy();
            this.world = new World(this.scene, data.theme, data.seed);
            this.hud.showThemeLabel(data.theme);
            this.hud.setUITheme(data.theme);
        });

        net.on('roundReset', (players) => {
            // Respawn all players
            players.forEach(p => {
                if (p.id === net.id) {
                    this._onRespawn(p.x3d, p.z3d, p.vehicleType);
                } else if (this.remotePlayers[p.id]) {
                    const remote = this.remotePlayers[p.id];
                    remote.group.visible = true;
                    remote.health = p.health;
                    remote.updateFromServer(p.x3d, p.z3d, 0);
                }
            });
        });
    }

    _addRemote(playerData) {
        if (this.remotePlayers[playerData.id]) return;

        const colorIdx = colorHexToIndex(playerData.color);
        const remote = new Car(
            this.scene,
            playerData.x3d, playerData.z3d,
            playerData.vehicleType || 'car',
            colorIdx, false
        );
        remote.id = playerData.id;
        remote.health = playerData.health || remote.maxHealth;
        remote.setNameTag(playerData.name || 'Player');
        remote.updateFromServer(playerData.x3d, playerData.z3d, playerData.angle || 0);

        this.remotePlayers[playerData.id] = remote;
    }

    _removeRemote(id) {
        const remote = this.remotePlayers[id];
        if (!remote) return;
        remote.destroy();
        delete this.remotePlayers[id];
    }

    // ========================================================================
    // Position broadcast (20 Hz)
    // ========================================================================

    _sendPosition() {
        if (!this.network || !this.player || this.isDead) return;
        const pos = this.player.getPosition();
        this.network.sendPosition(pos.x, pos.z, this.player.angle, this.player.speed);
    }

    // ========================================================================
    // Death & Respawn
    // ========================================================================

    _onDeath(killerName) {
        this.isDead = true;
        this.player.speed = 0;
        this.player.group.visible = false;
        this.hud.showDeath(killerName, this.coins);
        this.shakeAmount = 2.0;
        this.flashAlpha = 1.0;
    }

    _onRespawn(x, z, newVehicleType) {
        this.isDead = false;
        this.rampBoostY = 0;

        // If vehicle type changed, rebuild the car
        if (newVehicleType && newVehicleType !== this.vehicleType) {
            this.vehicleType = newVehicleType;
            this.player.destroy();
            this.player = new Car(this.scene, x, z, newVehicleType, 0, true);
            this.player.setNameTag(this.playerName);
            this.hud.setVehicleLabel(newVehicleType);
        } else {
            this.player.respawn(x, z);
        }

        this.player.group.visible = true;
        this.hud.hideDeath();

        // Brief invulnerability (2s) with flashing
        this.isInvulnerable = true;
        let flashCount = 0;
        const flashInterval = setInterval(() => {
            flashCount++;
            this.player.group.visible = flashCount % 2 === 0;
        }, 100);

        setTimeout(() => {
            clearInterval(flashInterval);
            this.isInvulnerable = false;
            this.player.group.visible = true;
        }, 2000);
    }

    // ========================================================================
    // Red flash overlay
    // ========================================================================

    _updateFlashOverlay() {
        const el = document.getElementById('damage-flash');
        if (el) {
            el.style.opacity = this.flashAlpha;
        }
    }

    // ========================================================================
    // Cleanup
    // ========================================================================

    destroy() {
        this.running = false;
        clearInterval(this._broadcastInterval);
        window.removeEventListener('resize', this._onResize);
        this.network.disconnect();
        this.renderer.dispose();
    }
}
