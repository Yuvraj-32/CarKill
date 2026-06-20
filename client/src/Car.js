// ============================================================================
// Car.js — 3D vehicle model + client-side physics
// ============================================================================
import * as THREE from 'three';

// Vehicle configs — physics values tuned for 3D space (arena 300×300)
export const VEHICLE_CONFIGS = {
    car: {
        maxSpeed: 80, accel: 70, brakeDecel: 85, drag: 0.97,
        turnSpeed: 2.8, maxHealth: 80,
        bodyW: 1.8, bodyH: 0.6, bodyL: 4,
        cabinW: 1.5, cabinH: 0.45, cabinL: 1.8, cabinOffZ: -0.3
    },
    pickup: {
        maxSpeed: 65, accel: 55, brakeDecel: 75, drag: 0.965,
        turnSpeed: 2.4, maxHealth: 120,
        bodyW: 2.0, bodyH: 0.7, bodyL: 4.5,
        cabinW: 1.7, cabinH: 0.5, cabinL: 1.8, cabinOffZ: 0.2
    },
    van: {
        maxSpeed: 50, accel: 42, brakeDecel: 60, drag: 0.96,
        turnSpeed: 1.9, maxHealth: 180,
        bodyW: 2.3, bodyH: 1.0, bodyL: 5.0,
        cabinW: 2.1, cabinH: 0.65, cabinL: 2.2, cabinOffZ: -0.2
    },
    tank: {
        maxSpeed: 38, accel: 32, brakeDecel: 45, drag: 0.955,
        turnSpeed: 1.4, maxHealth: 280,
        bodyW: 2.8, bodyH: 0.85, bodyL: 5.5,
        cabinW: 2.0, cabinH: 0.5, cabinL: 2.5, cabinOffZ: -0.5
    }
};

// Color palette matching server
const COLOR_PALETTE = [
    0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6,
    0xe67e22, 0x1abc9c, 0xfd79a8, 0x00cec9, 0x6c5ce7
];

const COLOR_HEX_MAP = {
    '#e74c3c': 0, '#3498db': 1, '#2ecc71': 2, '#f39c12': 3, '#9b59b6': 4,
    '#e67e22': 5, '#1abc9c': 6, '#fd79a8': 7, '#00cec9': 8, '#6c5ce7': 9
};

export function colorHexToIndex(hex) {
    return COLOR_HEX_MAP[hex] !== undefined ? COLOR_HEX_MAP[hex] : 0;
}

export function getColor(index) {
    return COLOR_PALETTE[index % COLOR_PALETTE.length];
}


export class Car {
    /**
     * @param {THREE.Scene} scene
     * @param {number} x - 3D x position
     * @param {number} z - 3D z position
     * @param {string} type - 'car'|'pickup'|'van'|'tank'
     * @param {number} colorIndex - index into COLOR_PALETTE
     * @param {boolean} isLocal - true for the player's own car
     */
    constructor(scene, x, z, type, colorIndex, isLocal) {
        this.scene = scene;
        this.type = type;
        this.isLocal = isLocal;
        this.id = null;

        const cfg = VEHICLE_CONFIGS[type] || VEHICLE_CONFIGS.car;
        this.cfg = cfg;

        // Physics state
        this.speed = 0;
        this.angle = 0; // rotation.y in radians
        this.bounce = { x: 0, z: 0 };

        this.health = cfg.maxHealth;
        this.maxHealth = cfg.maxHealth;

        // Interpolation targets (remote players)
        this.targetX = x;
        this.targetZ = z;
        this.targetAngle = 0;

        // Build 3D model
        const color = getColor(colorIndex);
        this.group = this._buildModel(type, color, cfg);
        this.group.position.set(x, 0, z);
        scene.add(this.group);

        // Camera goal (child of car, used for smooth camera follow)
        if (isLocal) {
            this.cameraGoal = new THREE.Object3D();
            this.cameraGoal.position.set(0, 6, -12); // behind and above
            this.group.add(this.cameraGoal);

            this.cameraLookTarget = new THREE.Object3D();
            this.cameraLookTarget.position.set(0, 1.5, 8); // ahead of car
            this.group.add(this.cameraLookTarget);
        }

        // Name tag sprite
        this.nameSprite = null;
    }

    // ========================================================================
    // 3D Model Builder
    // ========================================================================

    _createRustTexture(baseColorHex) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Base color
        ctx.fillStyle = baseColorHex;
        ctx.fillRect(0, 0, 256, 256);

        // Rust spots
        for (let i = 0; i < 2500; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;
            const size = Math.random() * 12 + 2;
            
            const r = 80 + Math.random() * 60;
            const g = 30 + Math.random() * 30;
            const b = 10 + Math.random() * 20;
            const a = Math.random() * 0.8;

            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Dirt smudges
        for (let i = 0; i < 30; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;
            const w = Math.random() * 100 + 50;
            const h = Math.random() * 100 + 50;
            
            const grad = ctx.createRadialGradient(x, y, 0, x, y, w/2);
            grad.addColorStop(0, `rgba(20, 15, 10, 0.6)`);
            grad.addColorStop(1, `rgba(20, 15, 10, 0)`);
            
            ctx.fillStyle = grad;
            ctx.fillRect(x - w/2, y - h/2, w, h);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    _buildModel(type, color, cfg) {
        const group = new THREE.Group();

        const rustTex = this._createRustTexture(color);
        const darkRustTex = this._createRustTexture('#333333');

        const bodyMat = new THREE.MeshStandardMaterial({
            map: rustTex, metalness: 0.7, roughness: 0.9
        });
        const darkMat = new THREE.MeshStandardMaterial({
            map: darkRustTex, metalness: 0.6, roughness: 0.9
        });
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x88ccff, transparent: true, opacity: 0.45,
            metalness: 0.9, roughness: 0.1
        });
        const wheelMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a, roughness: 0.95
        });
        const headlightMat = new THREE.MeshStandardMaterial({
            color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.9
        });
        const taillightMat = new THREE.MeshStandardMaterial({
            color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.6
        });

        // ---- Body ----
        const bodyGeo = new THREE.BoxGeometry(cfg.bodyW, cfg.bodyH, cfg.bodyL);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.5 + cfg.bodyH / 2;
        body.castShadow = true;
        group.add(body);

        // ---- Cabin / Roof ----
        if (type === 'tank') {
            // Turret instead of cabin
            const turretGeo = new THREE.CylinderGeometry(0.8, 0.9, 0.5, 8);
            const turret = new THREE.Mesh(turretGeo, darkMat);
            turret.position.set(0, 0.5 + cfg.bodyH + 0.25, -0.3);
            turret.castShadow = true;
            group.add(turret);

            // Barrel
            const barrelGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.5, 8);
            const barrel = new THREE.Mesh(barrelGeo, new THREE.MeshStandardMaterial({
                color: 0x555555, roughness: 0.7, metalness: 0.5
            }));
            barrel.rotation.x = Math.PI / 2;
            barrel.position.set(0, 0.5 + cfg.bodyH + 0.25, 1.6);
            barrel.castShadow = true;
            group.add(barrel);
        } else {
            const cabinGeo = new THREE.BoxGeometry(cfg.cabinW, cfg.cabinH, cfg.cabinL);
            const cabin = new THREE.Mesh(cabinGeo, bodyMat);
            cabin.position.set(0, 0.5 + cfg.bodyH + cfg.cabinH / 2, cfg.cabinOffZ);
            cabin.castShadow = true;
            group.add(cabin);

            // Rebar window cages (Mad Max)
            const rebarMat = darkMat;
            const rebarGeo = new THREE.CylinderGeometry(0.03, 0.03, cfg.cabinH + 0.05, 4);

            // Front cage
            for (let i = -1; i <= 1; i++) {
                const bar = new THREE.Mesh(rebarGeo, rebarMat);
                bar.position.set(i * 0.3, 0.5 + cfg.bodyH + cfg.cabinH / 2, cfg.cabinOffZ + cfg.cabinL / 2);
                bar.rotation.x = Math.PI * 0.12;
                group.add(bar);
            }
            // Rear cage
            for (let i = -1; i <= 1; i++) {
                const bar = new THREE.Mesh(rebarGeo, rebarMat);
                bar.position.set(i * 0.3, 0.5 + cfg.bodyH + cfg.cabinH / 2, cfg.cabinOffZ - cfg.cabinL / 2);
                bar.rotation.x = -Math.PI * 0.08;
                group.add(bar);
            }
            // Side cages
            for (let i = -1; i <= 1; i++) {
                const barL = new THREE.Mesh(rebarGeo, rebarMat);
                barL.position.set(-cfg.cabinW/2, 0.5 + cfg.bodyH + cfg.cabinH / 2, cfg.cabinOffZ + i * 0.3);
                group.add(barL);

                const barR = new THREE.Mesh(rebarGeo, rebarMat);
                barR.position.set(cfg.cabinW/2, 0.5 + cfg.bodyH + cfg.cabinH / 2, cfg.cabinOffZ + i * 0.3);
                group.add(barR);
            }
        }

        // ---- Monster Wheels ----
        const wheelR = type === 'tank' ? 0.5 : 0.45;
        const wheelW = type === 'tank' ? 0.4 : 0.3;
        const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 8); // octagonal
        const wheelOffX = cfg.bodyW / 2 + wheelW / 2 + 0.05;
        const wheelZ1 = cfg.bodyL * 0.35;
        const wheelZ2 = -cfg.bodyL * 0.35;

        const wheelPositions = [
            [-wheelOffX, wheelR, wheelZ1],
            [wheelOffX, wheelR, wheelZ1],
            [-wheelOffX, wheelR, wheelZ2],
            [wheelOffX, wheelR, wheelZ2]
        ];

        // Rusty iron hubcaps
        const rimGeo = new THREE.CylinderGeometry(wheelR * 0.5, wheelR * 0.5, wheelW + 0.04, 6);
        const rimMat = darkMat;

        this.wheels = [];
        wheelPositions.forEach(([wx, wy, wz]) => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.position.set(wx, wy, wz);
            wheel.rotation.z = Math.PI / 2;
            wheel.castShadow = true;
            
            const rim = new THREE.Mesh(rimGeo, rimMat);
            wheel.add(rim); // rim rotates with wheel
            
            group.add(wheel);
            this.wheels.push(wheel);
        });

        // ---- Headlights ----
        const hlGeo = new THREE.SphereGeometry(0.1, 6, 6);
        const frontZ = cfg.bodyL / 2;
        [-cfg.bodyW * 0.35, cfg.bodyW * 0.35].forEach(hx => {
            const hl = new THREE.Mesh(hlGeo, headlightMat);
            hl.position.set(hx, 0.5 + cfg.bodyH * 0.5, frontZ);
            group.add(hl);
        });

        // ---- Taillights ----
        const tlGeo = new THREE.BoxGeometry(0.25, 0.12, 0.06);
        const rearZ = -cfg.bodyL / 2;
        [-cfg.bodyW * 0.35, cfg.bodyW * 0.35].forEach(tx => {
            const tl = new THREE.Mesh(tlGeo, taillightMat);
            tl.position.set(tx, 0.5 + cfg.bodyH * 0.4, rearZ);
            group.add(tl);
        });

        // ============================================================
        // MAD MAX WEDGE (COW CATCHER) & GIANT SPIKES
        // ============================================================
        const plowMat = new THREE.MeshStandardMaterial({
            color: 0x222222, metalness: 0.9, roughness: 0.7
        });
        const plowGeo = new THREE.CylinderGeometry(0.8, 0.8, cfg.bodyW + 0.4, 3);
        const plow = new THREE.Mesh(plowGeo, plowMat);
        plow.rotation.z = Math.PI / 2; // horizontal
        plow.rotation.x = Math.PI / 5; // angle slope down
        plow.position.set(0, 0.35, frontZ + 0.6);
        plow.castShadow = true;
        group.add(plow);

        // Giant Spikes protruding from the plow
        const spikeCount = type === 'tank' ? 5 : 3;
        const spikeSpacing = (cfg.bodyW * 0.8) / (spikeCount - 1);
        const startX = -cfg.bodyW * 0.4;
        const spikeLen = 1.4; // Massive spikes
        const spikeGeo = new THREE.ConeGeometry(0.12, spikeLen, 6);
        const spikeMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.3 });
        
        for (let s = 0; s < spikeCount; s++) {
            const spike = new THREE.Mesh(spikeGeo, spikeMat);
            spike.rotation.x = Math.PI / 2;
            spike.position.set(
                startX + s * spikeSpacing,
                0.35,
                frontZ + 0.6 + spikeLen / 2
            );
            spike.castShadow = true;
            group.add(spike);
        }

        // Rear Bumper (Thick iron bar)
        const rbGeo = new THREE.BoxGeometry(cfg.bodyW + 0.1, 0.2, 0.3);
        const rearBumper = new THREE.Mesh(rbGeo, plowMat);
        rearBumper.position.set(0, 0.35, rearZ - 0.1);
        rearBumper.castShadow = true;
        group.add(rearBumper);

        // ============================================================
        // SIDE SKIRTS
        // ============================================================
        const skirtGeo = new THREE.BoxGeometry(0.08, 0.12, cfg.bodyL * 0.7);
        [-cfg.bodyW / 2 - 0.04, cfg.bodyW / 2 + 0.04].forEach(sx => {
            const skirt = new THREE.Mesh(skirtGeo, darkMat);
            skirt.position.set(sx, 0.35, 0);
            group.add(skirt);
        });

        // ============================================================
        // DIESEL SMOKESTACKS
        // ============================================================
        const exhaustMat = new THREE.MeshStandardMaterial({
            color: 0x333333, metalness: 0.8, roughness: 0.6
        });
        const exCount = type === 'tank' ? 1 : 2;
        const exPositions = exCount === 1 ? [0] : [-cfg.bodyW * 0.4, cfg.bodyW * 0.4];
        exPositions.forEach(ex => {
            const pipeGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 8);
            const pipe = new THREE.Mesh(pipeGeo, exhaustMat);
            pipe.position.set(ex, 0.5 + cfg.bodyH + 0.3, frontZ - 0.2);
            pipe.castShadow = true;
            group.add(pipe);
        });

        // ============================================================
        // SIDE MIRRORS (not for tank)
        // ============================================================
        if (type !== 'tank') {
            const mirrorMat = new THREE.MeshStandardMaterial({
                color: 0x333333, metalness: 0.7, roughness: 0.2
            });
            [-1, 1].forEach(side => {
                // Mirror arm
                const armGeo = new THREE.BoxGeometry(0.3, 0.04, 0.04);
                const arm = new THREE.Mesh(armGeo, mirrorMat);
                arm.position.set(
                    side * (cfg.bodyW / 2 + 0.15),
                    0.5 + cfg.bodyH + 0.1,
                    cfg.cabinOffZ + cfg.cabinL * 0.3
                );
                group.add(arm);

                // Mirror glass
                const glassGeo = new THREE.BoxGeometry(0.04, 0.12, 0.1);
                const glass = new THREE.Mesh(glassGeo, glassMat);
                glass.position.set(
                    side * (cfg.bodyW / 2 + 0.28),
                    0.5 + cfg.bodyH + 0.1,
                    cfg.cabinOffZ + cfg.cabinL * 0.3
                );
                group.add(glass);
            });
        }

        // ============================================================
        // VEHICLE-SPECIFIC DETAILS
        // ============================================================
        if (type === 'car') {
            // Racing Spoiler
            const spoilerMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
            const spoilerGeo = new THREE.BoxGeometry(cfg.bodyW * 0.95, 0.05, 0.25);
            const spoiler = new THREE.Mesh(spoilerGeo, spoilerMat);
            spoiler.position.set(0, 0.5 + cfg.bodyH + 0.2, rearZ + 0.15);
            spoiler.castShadow = true;
            group.add(spoiler);
            
            const supGeo = new THREE.BoxGeometry(0.04, 0.2, 0.1);
            [-cfg.bodyW * 0.3, cfg.bodyW * 0.3].forEach(sx => {
                const sup = new THREE.Mesh(supGeo, spoilerMat);
                sup.position.set(sx, 0.5 + cfg.bodyH + 0.1, rearZ + 0.15);
                group.add(sup);
            });
        }

        if (type === 'pickup') {
            // Roof-mounted light bar
            const lbGeo = new THREE.BoxGeometry(cfg.cabinW * 0.8, 0.08, 0.15);
            const lbMat = new THREE.MeshStandardMaterial({
                color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 0.3
            });
            const lightBar = new THREE.Mesh(lbGeo, lbMat);
            lightBar.position.set(0, 0.5 + cfg.bodyH + cfg.cabinH + 0.04, cfg.cabinOffZ);
            group.add(lightBar);

            // Cargo bed rails
            const railMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6 });
            [-cfg.bodyW * 0.45, cfg.bodyW * 0.45].forEach(rx => {
                const railGeo = new THREE.BoxGeometry(0.05, 0.3, cfg.bodyL * 0.35);
                const rail = new THREE.Mesh(railGeo, railMat);
                rail.position.set(rx, 0.5 + cfg.bodyH + 0.15, -cfg.bodyL * 0.25);
                group.add(rail);
            });
        }

        if (type === 'van') {
            // Luggage rack on top
            const rackMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5 });
            const rackGeo = new THREE.BoxGeometry(cfg.cabinW * 0.7, 0.04, cfg.cabinL * 0.8);
            const rack = new THREE.Mesh(rackGeo, rackMat);
            rack.position.set(0, 0.5 + cfg.bodyH + cfg.cabinH + 0.08, cfg.cabinOffZ);
            group.add(rack);

            // Rack supports
            const supportGeo2 = new THREE.BoxGeometry(0.04, 0.12, 0.04);
            [[-0.6, 0.5], [0.6, 0.5], [-0.6, -0.5], [0.6, -0.5]].forEach(([sx, sz]) => {
                const sup = new THREE.Mesh(supportGeo2, rackMat);
                sup.position.set(sx, 0.5 + cfg.bodyH + cfg.cabinH + 0.02, cfg.cabinOffZ + sz);
                group.add(sup);
            });
        }

        if (type === 'tank') {
            // Extra armor plates on sides
            const armorMat = new THREE.MeshStandardMaterial({
                color: 0x445544, metalness: 0.3, roughness: 0.7
            });
            [-1, 1].forEach(side => {
                const plateGeo = new THREE.BoxGeometry(0.12, cfg.bodyH * 0.6, cfg.bodyL * 0.4);
                const plate = new THREE.Mesh(plateGeo, armorMat);
                plate.position.set(side * (cfg.bodyW / 2 + 0.06), 0.5 + cfg.bodyH * 0.5, 0);
                plate.castShadow = true;
                group.add(plate);
            });

            // Track guards
            [-cfg.bodyW / 2, cfg.bodyW / 2].forEach(tx => {
                const guardGeo = new THREE.BoxGeometry(0.5, 0.1, cfg.bodyL + 0.2);
                const guard = new THREE.Mesh(guardGeo, darkMat);
                guard.position.set(tx, 0.5 + cfg.bodyH + 0.05, 0);
                group.add(guard);
            });
        }

        // ============================================================
        // UNDERCARRIAGE GLOW (neon effect)
        // ============================================================
        const glowGeo = new THREE.PlaneGeometry(cfg.bodyW * 0.8, cfg.bodyL * 0.7);
        const glowMat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.15, side: THREE.DoubleSide
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(0, 0.05, 0);
        group.add(glow);

        return group;
    }

    // ========================================================================
    // Name Tag
    // ========================================================================

    setNameTag(name) {
        if (this.nameSprite) {
            this.group.remove(this.nameSprite);
            this.nameSprite.material.map.dispose();
            this.nameSprite.material.dispose();
        }

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(8, 8, 240, 48);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, 128, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        this.nameSprite = new THREE.Sprite(mat);
        this.nameSprite.scale.set(4, 1, 1);
        this.nameSprite.position.set(0, this.cfg.bodyH + (this.type === 'tank' ? 3.2 : 2.5), 0);
        this.group.add(this.nameSprite);
    }

    // ========================================================================
    // Physics (local car only)
    // ========================================================================

    updatePhysics(input, delta) {
        const cfg = this.cfg;
        const dt = Math.min(delta, 0.05); // cap at 50ms

        // Acceleration
        if (input.forward) {
            this.speed += cfg.accel * dt;
        } else if (input.backward) {
            this.speed -= cfg.brakeDecel * dt;
        }

        // Friction / drag (frame-rate independent)
        this.speed *= Math.pow(cfg.drag, dt * 60);

        // Clamp speed
        this.speed = Math.max(-cfg.maxSpeed * 0.3, Math.min(cfg.maxSpeed, this.speed));

        // Kill tiny drift
        if (!input.forward && !input.backward && Math.abs(this.speed) < 0.5) {
            this.speed = 0;
        }

        // Turning (only when moving, scales with speed)
        if (Math.abs(this.speed) > 1) {
            const turnDir = this.speed > 0 ? 1 : -1;
            const speedFactor = Math.min(1, Math.abs(this.speed) / 15);
            if (input.left)  this.angle += cfg.turnSpeed * turnDir * speedFactor * dt;
            if (input.right) this.angle -= cfg.turnSpeed * turnDir * speedFactor * dt;
        }

        // Update position
        this.group.position.x += Math.sin(this.angle) * this.speed * dt;
        this.group.position.z += Math.cos(this.angle) * this.speed * dt;
        this.group.rotation.y = this.angle;

        // Apply dynamic bounce velocity
        if (Math.abs(this.bounce.x) > 0.1 || Math.abs(this.bounce.z) > 0.1) {
            this.group.position.x += this.bounce.x * dt;
            this.group.position.z += this.bounce.z * dt;
            this.bounce.x *= Math.pow(0.005, dt); // Heavy friction for bounce
            this.bounce.z *= Math.pow(0.005, dt);
        }

        // Spin wheels
        const wheelSpin = this.speed * dt * 2;
        this.wheels.forEach(w => { w.rotation.x += wheelSpin; });
    }

    // ========================================================================
    // Interpolation (remote cars)
    // ========================================================================

    updateFromServer(x, z, angle) {
        this.targetX = x;
        this.targetZ = z;
        this.targetAngle = angle;
    }

    interpolate(factor) {
        const f = Math.min(factor, 1);
        this.group.position.x += (this.targetX - this.group.position.x) * f;
        this.group.position.z += (this.targetZ - this.group.position.z) * f;

        // Smooth angle interpolation
        let diff = this.targetAngle - this.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.group.rotation.y += diff * f;

        // Spin wheels based on movement
        const dx = this.targetX - this.group.position.x;
        const dz = this.targetZ - this.group.position.z;
        const moveDist = Math.sqrt(dx * dx + dz * dz);
        this.wheels.forEach(w => { w.rotation.x += moveDist * 0.5; });
    }

    // ========================================================================
    // Damage & Respawn
    // ========================================================================

    takeDamage(amount) {
        this.health -= amount;
        if (this.health < 0) this.health = 0;
        return this.health <= 0;
    }

    respawn(x, z) {
        this.health = this.maxHealth;
        this.speed = 0;
        this.group.position.set(x, 0, z);
        this.group.rotation.y = 0;
        this.angle = 0;
    }

    getPosition() {
        return this.group.position;
    }

    getSpeed() {
        return this.speed;
    }

    getRadius() {
        return this.cfg.bodyL / 2;
    }

    // ========================================================================
    // Cleanup
    // ========================================================================

    destroy() {
        this.scene.remove(this.group);
        this.group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        });
    }
}
