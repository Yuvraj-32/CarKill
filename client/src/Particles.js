// ============================================================================
// Particles.js — Pooled GPU point-sprite particle system (single draw call)
// ============================================================================
import * as THREE from 'three';

const MAX_PARTICLES   = 800;  // absolute hard cap — all types combined
const MAX_COINS       = 30;   // coins use separate mesh array (need physics/collect)

// ---- Particle types ----
const TYPE_COLLISION  = 0;
const TYPE_DUST       = 1;
const TYPE_EXHAUST    = 2;
const TYPE_EXPLOSION  = 3;

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;

        // ---- GPU point sprites ----
        this._positions  = new Float32Array(MAX_PARTICLES * 3);
        this._colors     = new Float32Array(MAX_PARTICLES * 3);
        this._sizes      = new Float32Array(MAX_PARTICLES);
        this._alphas     = new Float32Array(MAX_PARTICLES);  // for shader

        // CPU-side state (no per-particle mesh objects)
        this._vx = new Float32Array(MAX_PARTICLES);
        this._vy = new Float32Array(MAX_PARTICLES);
        this._vz = new Float32Array(MAX_PARTICLES);
        this._age      = new Float32Array(MAX_PARTICLES);
        this._lifetime = new Float32Array(MAX_PARTICLES);
        this._active   = new Uint8Array(MAX_PARTICLES);       // 0=free, 1=active
        this._type     = new Uint8Array(MAX_PARTICLES);
        this._count    = 0; // next-free hint

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
        geo.setAttribute('color',    new THREE.BufferAttribute(this._colors,    3));
        geo.setAttribute('size',     new THREE.BufferAttribute(this._sizes,     1));

        const mat = new THREE.PointsMaterial({
            size: 0.5,
            vertexColors: true,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            sizeAttenuation: true,
        });

        this._points = new THREE.Points(geo, mat);
        this._points.frustumCulled = false;
        scene.add(this._points);

        // ---- Coins: still individual meshes (need physics + collection) ----
        this.coins  = [];
        this.bursts = []; // kept for coin compat only
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    _alloc() {
        // Find a free slot — linear scan with wrap
        const n = MAX_PARTICLES;
        for (let i = 0; i < n; i++) {
            const idx = (this._count + i) % n;
            if (!this._active[idx]) {
                this._count = (idx + 1) % n;
                return idx;
            }
        }
        return -1; // pool full, drop particle
    }

    _spawn(x, y, z, vx, vy, vz, r, g, b, size, lifetime, type) {
        const i = this._alloc();
        if (i < 0) return;
        this._active[i]   = 1;
        this._type[i]     = type;
        this._age[i]      = 0;
        this._lifetime[i] = lifetime;
        this._positions[i*3]   = x;
        this._positions[i*3+1] = y;
        this._positions[i*3+2] = z;
        this._vx[i] = vx; this._vy[i] = vy; this._vz[i] = vz;
        this._colors[i*3]   = r;
        this._colors[i*3+1] = g;
        this._colors[i*3+2] = b;
        this._sizes[i] = size;
        this._alphas[i] = 1;
    }

    // -------------------------------------------------------------------------
    // Public spawn API — matches original interface
    // -------------------------------------------------------------------------

    spawnCollision(position, intensity = 1) {
        const count = Math.floor(8 + intensity * 6);
        for (let i = 0; i < count; i++) {
            const colors = [[1,0.4,0],[1,0.7,0],[1,0.2,0],[1,1,0],[1,0.55,0]];
            const [r,g,b] = colors[Math.floor(Math.random() * colors.length)];
            const speed = 3 + Math.random() * 7 * intensity;
            this._spawn(
                position.x + (Math.random()-0.5)*1.5,
                position.y + 0.5 + Math.random()*0.5,
                position.z + (Math.random()-0.5)*1.5,
                (Math.random()-0.5)*speed, Math.random()*speed*0.7+2, (Math.random()-0.5)*speed,
                r, g, b,
                0.5 + Math.random()*0.5,
                0.4 + Math.random()*0.4,
                TYPE_COLLISION
            );
        }
    }

    spawnDust(position, _direction, speed) {
        if (speed < 15) return;
        for (let i = 0; i < 2; i++) {
            const g = 0.45 + Math.random()*0.2;
            this._spawn(
                position.x + (Math.random()-0.5)*0.8,
                0.15,
                position.z + (Math.random()-0.5)*0.8,
                (Math.random()-0.5)*3, Math.random()*2.5+0.8, (Math.random()-0.5)*3,
                g, g, g,
                0.4 + Math.random()*0.3,
                0.18 + Math.random()*0.12,  // SHORT: 0.18-0.3s
                TYPE_DUST
            );
        }
    }

    spawnExhaustSmoke(position, scale = 1) {
        const gray = 0.05 + Math.random()*0.08;
        this._spawn(
            position.x + (Math.random()-0.5)*0.1,
            position.y + (Math.random()-0.5)*0.1,
            position.z + (Math.random()-0.5)*0.1,
            (Math.random()-0.5)*0.6, 2.5+Math.random()*2.0, (Math.random()-0.5)*0.6, // faster upward
            gray, gray, gray,
            (0.5 + Math.random()*0.4) * scale,
            0.22 + Math.random()*0.15,  // SHORT: 0.22-0.37s max
            TYPE_EXHAUST
        );
    }

    spawnExplosion(position) {
        const expColors = [[1,0.13,0],[1,0.33,0],[1,0.53,0],[1,0.8,0],[1,1,0],[0.65,0,0],[1,0.65,0]];
        // Fire particles
        for (let i = 0; i < 35; i++) {
            const [r,g,b] = expColors[Math.floor(Math.random() * expColors.length)];
            const speed = 5 + Math.random()*15;
            this._spawn(
                position.x + (Math.random()-0.5)*2,
                position.y + 0.5 + Math.random()*1,
                position.z + (Math.random()-0.5)*2,
                (Math.random()-0.5)*speed, Math.random()*speed*0.8+4, (Math.random()-0.5)*speed,
                r, g, b,
                0.6 + Math.random()*0.7,
                0.6 + Math.random()*0.8,
                TYPE_EXPLOSION
            );
        }
        // Smoke
        for (let i = 0; i < 12; i++) {
            const gv = 0.25 + Math.random()*0.15;
            const speed2 = 2 + Math.random()*4;
            this._spawn(
                position.x + (Math.random()-0.5)*2,
                position.y + 0.8,
                position.z + (Math.random()-0.5)*2,
                (Math.random()-0.5)*speed2, 1+Math.random()*3, (Math.random()-0.5)*speed2,
                gv, gv, gv,
                0.9 + Math.random()*0.6,
                1.0 + Math.random()*1.0,
                TYPE_EXHAUST
            );
        }
    }

    // -------------------------------------------------------------------------
    // Coins — kept as meshes for physics/collection interaction
    // -------------------------------------------------------------------------

    spawnCoins(position, coinCount = 5) {
        const particles = [];
        this.coins = this.coins || [];

        for (let i = 0; i < coinCount; i++) {
            const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12);
            const mat = new THREE.MeshStandardMaterial({
                color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 0.4,
                metalness: 0.9, roughness: 0.2
            });
            const coin = new THREE.Mesh(geo, mat);

            coin.position.set(
                position.x + (Math.random()-0.5)*2,
                1 + Math.random()*2,
                position.z + (Math.random()-0.5)*2
            );
            coin.rotation.x = Math.PI / 2;

            const speed = 3 + Math.random()*6;
            coin.userData.velocity = new THREE.Vector3(
                (Math.random()-0.5)*speed, 3+Math.random()*5, (Math.random()-0.5)*speed
            );
            coin.userData.lifetime  = 15;
            coin.userData.age       = 0;
            coin.userData.isCoin    = true;
            coin.userData.value     = 1;
            coin.userData.spinSpeed = 3 + Math.random()*3;
            coin.userData.settled   = false;

            this.scene.add(coin);
            particles.push(coin);
            this.coins.push(coin);
        }

        this.bursts.push(particles);
    }

    collectCoins(playerPos, collectRadius = 3) {
        if (!this.coins) return [];
        const collected = [];

        for (let i = this.coins.length - 1; i >= 0; i--) {
            const coin = this.coins[i];
            if (!coin.userData.settled) continue;
            const dx = playerPos.x - coin.position.x;
            const dz = playerPos.z - coin.position.z;
            if (Math.sqrt(dx*dx + dz*dz) < collectRadius) {
                collected.push(coin.userData.value);
                this.scene.remove(coin);
                coin.geometry.dispose();
                coin.material.dispose();
                this.coins.splice(i, 1);
                for (const burst of this.bursts) {
                    const idx = burst.indexOf(coin);
                    if (idx !== -1) burst.splice(idx, 1);
                }
            }
        }
        return collected;
    }

    // -------------------------------------------------------------------------
    // Update — called every frame
    // -------------------------------------------------------------------------

    update(delta) {
        const dt = Math.min(delta, 0.05);
        let needsUpdate = false;

        for (let i = 0; i < MAX_PARTICLES; i++) {
            if (!this._active[i]) {
                // Make sure dead particles are invisible (position them far away)
                this._sizes[i] = 0;
                continue;
            }

            this._age[i] += dt;
            const t  = this._age[i] / this._lifetime[i];

            if (t >= 1) {
                this._active[i] = 0;
                this._sizes[i]  = 0;
                needsUpdate = true;
                continue;
            }

            // Move
            this._positions[i*3]   += this._vx[i] * dt;
            this._positions[i*3+1] += this._vy[i] * dt;
            this._positions[i*3+2] += this._vz[i] * dt;

            // Gravity (exhaust rises fast then falls, others fall)
            if (this._type[i] === TYPE_EXHAUST) {
                this._vy[i] -= 4 * dt; // buoyancy loss — smoke slows as it rises
            } else {
                this._vy[i] -= 15 * dt;
            }

            // Bounce off ground
            if (this._positions[i*3+1] < 0.05) {
                this._positions[i*3+1] = 0.05;
                this._vy[i] *= -0.25;
            }

            // Squared fade — particles vanish sharply at end, not a slow linear linger
            const fade = 1 - t * t;
            this._sizes[i] = fade * (this._type[i] === TYPE_DUST || this._type[i] === TYPE_EXHAUST ? 0.7 : 0.5);

            needsUpdate = true;
        }

        // Update coins (mesh-based, unchanged)
        for (let b = this.bursts.length - 1; b >= 0; b--) {
            const burst = this.bursts[b];
            let alive = false;
            for (let i = burst.length - 1; i >= 0; i--) {
                const p = burst[i];
                if (!p.userData.isCoin) continue;
                p.userData.age += dt;
                if (p.userData.age >= p.userData.lifetime) {
                    this.scene.remove(p);
                    p.geometry.dispose();
                    p.material.dispose();
                    if (this.coins) {
                        const ci = this.coins.indexOf(p);
                        if (ci !== -1) this.coins.splice(ci, 1);
                    }
                    burst.splice(i, 1);
                    continue;
                }
                alive = true;
                if (!p.userData.settled) {
                    p.position.x += p.userData.velocity.x * dt;
                    p.position.y += p.userData.velocity.y * dt;
                    p.position.z += p.userData.velocity.z * dt;
                    p.userData.velocity.y -= 12 * dt;
                    if (p.position.y < 0.35) {
                        p.position.y = 0.35;
                        if (Math.abs(p.userData.velocity.y) < 1) {
                            p.userData.settled = true;
                            p.userData.velocity.set(0,0,0);
                        } else {
                            p.userData.velocity.y *= -0.4;
                            p.userData.velocity.x *= 0.6;
                            p.userData.velocity.z *= 0.6;
                        }
                    }
                }
                p.rotation.z += p.userData.spinSpeed * dt;
                if (p.userData.settled) {
                    const pulse = 0.3 + Math.sin(p.userData.age * 4) * 0.15;
                    p.material.emissiveIntensity = pulse;
                    if (p.userData.lifetime - p.userData.age < 3) {
                        p.material.opacity = (p.userData.lifetime - p.userData.age) / 3;
                        p.material.transparent = true;
                    }
                }
            }
            if (!alive || burst.length === 0) this.bursts.splice(b, 1);
        }

        if (needsUpdate) {
            this._points.geometry.attributes.position.needsUpdate = true;
            this._points.geometry.attributes.color.needsUpdate    = true;
            this._points.geometry.attributes.size.needsUpdate     = true;
        }
    }

    destroy() {
        this.scene.remove(this._points);
        this._points.geometry.dispose();
        this._points.material.dispose();
        this.coins.forEach(c => {
            this.scene.remove(c);
            c.geometry.dispose();
            c.material.dispose();
        });
        this.coins = [];
        this.bursts = [];
    }
}
