// ============================================================================
// Particles.js — Collision & dust particle effects
// ============================================================================
import * as THREE from 'three';

const PARTICLE_COLORS = [0xff6600, 0xffaa00, 0xff3300, 0xffff00, 0xff8800];

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.bursts = []; // active burst arrays
    }

    /** Spawn a collision burst at a world position */
    spawnCollision(position, intensity = 1) {
        const count = Math.floor(12 + intensity * 8);
        const particles = [];

        for (let i = 0; i < count; i++) {
            const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
            const size = 0.08 + Math.random() * 0.15;
            const geo = new THREE.SphereGeometry(size, 4, 4);
            const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
            const mesh = new THREE.Mesh(geo, mat);

            mesh.position.set(
                position.x + (Math.random() - 0.5) * 1.5,
                position.y + 0.5 + Math.random() * 0.5,
                position.z + (Math.random() - 0.5) * 1.5
            );

            const speed = 3 + Math.random() * 8 * intensity;
            mesh.userData.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * speed,
                Math.random() * speed * 0.7 + 2,
                (Math.random() - 0.5) * speed
            );
            mesh.userData.lifetime = 0.4 + Math.random() * 0.4;
            mesh.userData.age = 0;

            this.scene.add(mesh);
            particles.push(mesh);
        }

        this.bursts.push(particles);
    }

    /** Spawn dust puff behind a moving car */
    spawnDust(position, direction, speed) {
        if (speed < 15) return; // only at higher speeds
        const count = 2;
        const particles = [];

        for (let i = 0; i < count; i++) {
            const geo = new THREE.SphereGeometry(0.1 + Math.random() * 0.1, 4, 4);
            const mat = new THREE.MeshBasicMaterial({
                color: 0x888888, transparent: true, opacity: 0.4
            });
            const mesh = new THREE.Mesh(geo, mat);

            mesh.position.set(
                position.x + (Math.random() - 0.5) * 0.8,
                0.15,
                position.z + (Math.random() - 0.5) * 0.8
            );

            mesh.userData.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                Math.random() * 1.5 + 0.5,
                (Math.random() - 0.5) * 2
            );
            mesh.userData.lifetime = 0.5 + Math.random() * 0.3;
            mesh.userData.age = 0;

            this.scene.add(mesh);
            particles.push(mesh);
        }

        this.bursts.push(particles);
    }

    /** Spawn a massive explosion at a death position */
    spawnExplosion(position) {
        const count = 45;
        const particles = [];
        const explosionColors = [0xff2200, 0xff5500, 0xff8800, 0xffcc00, 0xffff00, 0xff0000, 0xffa500];

        for (let i = 0; i < count; i++) {
            const color = explosionColors[Math.floor(Math.random() * explosionColors.length)];
            const size = 0.15 + Math.random() * 0.35;
            const geo = new THREE.SphereGeometry(size, 5, 5);
            const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
            const mesh = new THREE.Mesh(geo, mat);

            mesh.position.set(
                position.x + (Math.random() - 0.5) * 2,
                position.y + 0.5 + Math.random() * 1,
                position.z + (Math.random() - 0.5) * 2
            );

            const speed = 5 + Math.random() * 15;
            mesh.userData.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * speed,
                Math.random() * speed * 0.8 + 4,
                (Math.random() - 0.5) * speed
            );
            mesh.userData.lifetime = 0.6 + Math.random() * 0.8;
            mesh.userData.age = 0;

            this.scene.add(mesh);
            particles.push(mesh);
        }

        // Smoke particles (gray, slower, linger longer)
        for (let i = 0; i < 15; i++) {
            const size = 0.3 + Math.random() * 0.4;
            const geo = new THREE.SphereGeometry(size, 4, 4);
            const gray = Math.floor(60 + Math.random() * 40);
            const mat = new THREE.MeshBasicMaterial({
                color: new THREE.Color(`rgb(${gray}, ${gray}, ${gray})`),
                transparent: true, opacity: 0.6
            });
            const mesh = new THREE.Mesh(geo, mat);

            mesh.position.set(
                position.x + (Math.random() - 0.5) * 2,
                position.y + 0.8,
                position.z + (Math.random() - 0.5) * 2
            );

            mesh.userData.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 3,
                1 + Math.random() * 3,
                (Math.random() - 0.5) * 3
            );
            mesh.userData.lifetime = 1.0 + Math.random() * 1.0;
            mesh.userData.age = 0;

            this.scene.add(mesh);
            particles.push(mesh);
        }

        this.bursts.push(particles);
    }

    /** Spawn bouncing gold coins from a death position */
    spawnCoins(position, coinCount = 5) {
        const particles = [];
        this.coins = this.coins || []; // track active coin meshes for collection

        for (let i = 0; i < coinCount; i++) {
            const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12);
            const mat = new THREE.MeshStandardMaterial({
                color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 0.4,
                metalness: 0.9, roughness: 0.2
            });
            const coin = new THREE.Mesh(geo, mat);

            coin.position.set(
                position.x + (Math.random() - 0.5) * 2,
                1 + Math.random() * 2,
                position.z + (Math.random() - 0.5) * 2
            );
            coin.rotation.x = Math.PI / 2; // flat like a coin

            const speed = 3 + Math.random() * 6;
            coin.userData.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * speed,
                3 + Math.random() * 5,
                (Math.random() - 0.5) * speed
            );
            coin.userData.lifetime = 15; // coins last 15 seconds
            coin.userData.age = 0;
            coin.userData.isCoin = true;
            coin.userData.value = 1;
            coin.userData.spinSpeed = 3 + Math.random() * 3;
            coin.userData.settled = false;

            this.scene.add(coin);
            particles.push(coin);
            this.coins.push(coin);
        }

        this.bursts.push(particles);
    }

    /** Check if player position is near any coin, return collected coins */
    collectCoins(playerPos, collectRadius = 3) {
        if (!this.coins) return [];
        const collected = [];

        for (let i = this.coins.length - 1; i >= 0; i--) {
            const coin = this.coins[i];
            if (!coin.userData.settled) continue; // can't collect mid-air coins

            const dx = playerPos.x - coin.position.x;
            const dz = playerPos.z - coin.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < collectRadius) {
                collected.push(coin.userData.value);
                this.scene.remove(coin);
                coin.geometry.dispose();
                coin.material.dispose();
                this.coins.splice(i, 1);
                // Also remove from burst arrays
                for (const burst of this.bursts) {
                    const idx = burst.indexOf(coin);
                    if (idx !== -1) burst.splice(idx, 1);
                }
            }
        }
        return collected;
    }

    /** Update all active particles — call each frame */
    update(delta) {
        for (let b = this.bursts.length - 1; b >= 0; b--) {
            const particles = this.bursts[b];
            let allDead = true;

            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.userData.age += delta;

                if (p.userData.age >= p.userData.lifetime) {
                    this.scene.remove(p);
                    p.geometry.dispose();
                    p.material.dispose();
                    particles.splice(i, 1);
                    // Also remove from coins array if it's a coin
                    if (p.userData.isCoin && this.coins) {
                        const ci = this.coins.indexOf(p);
                        if (ci !== -1) this.coins.splice(ci, 1);
                    }
                    continue;
                }

                allDead = false;

                if (p.userData.isCoin) {
                    // Coin-specific behavior — bounce then settle
                    if (!p.userData.settled) {
                        p.position.x += p.userData.velocity.x * delta;
                        p.position.y += p.userData.velocity.y * delta;
                        p.position.z += p.userData.velocity.z * delta;
                        p.userData.velocity.y -= 12 * delta; // gravity

                        if (p.position.y < 0.35) {
                            p.position.y = 0.35;
                            if (Math.abs(p.userData.velocity.y) < 1) {
                                p.userData.settled = true;
                                p.userData.velocity.set(0, 0, 0);
                            } else {
                                p.userData.velocity.y *= -0.4;
                                p.userData.velocity.x *= 0.6;
                                p.userData.velocity.z *= 0.6;
                            }
                        }
                    }

                    // Spin the coin
                    p.rotation.z += p.userData.spinSpeed * delta;

                    // Pulsing glow when settled
                    if (p.userData.settled) {
                        const pulse = 0.3 + Math.sin(p.userData.age * 4) * 0.15;
                        p.material.emissiveIntensity = pulse;
                        // Fade out in last 3 seconds
                        if (p.userData.lifetime - p.userData.age < 3) {
                            p.material.opacity = (p.userData.lifetime - p.userData.age) / 3;
                            p.material.transparent = true;
                        }
                    }
                } else {
                    // Regular particle behavior
                    const t = p.userData.age / p.userData.lifetime;

                    p.position.x += p.userData.velocity.x * delta;
                    p.position.y += p.userData.velocity.y * delta;
                    p.position.z += p.userData.velocity.z * delta;

                    p.userData.velocity.y -= 15 * delta;

                    if (p.position.y < 0.05) {
                        p.position.y = 0.05;
                        p.userData.velocity.y *= -0.3;
                    }

                    p.material.opacity = 1 - t;
                    const scale = 1 - t * 0.5;
                    p.scale.set(scale, scale, scale);
                }
            }

            if (allDead || particles.length === 0) {
                this.bursts.splice(b, 1);
            }
        }
    }
}
