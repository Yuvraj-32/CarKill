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
                    continue;
                }

                allDead = false;
                const t = p.userData.age / p.userData.lifetime;

                // Move
                p.position.x += p.userData.velocity.x * delta;
                p.position.y += p.userData.velocity.y * delta;
                p.position.z += p.userData.velocity.z * delta;

                // Gravity
                p.userData.velocity.y -= 15 * delta;

                // Don't go below ground
                if (p.position.y < 0.05) {
                    p.position.y = 0.05;
                    p.userData.velocity.y *= -0.3;
                }

                // Fade out
                p.material.opacity = 1 - t;

                // Shrink
                const scale = 1 - t * 0.5;
                p.scale.set(scale, scale, scale);
            }

            if (allDead || particles.length === 0) {
                this.bursts.splice(b, 1);
            }
        }
    }
}
