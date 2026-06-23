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
        this.driftVelX = 0; // lateral slip velocity
        this.driftVelZ = 0;
        this.isDrifting = false;

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
        this.chassis = new THREE.Group();
        group.add(this.chassis);

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

        // ============================================================
        // 1. Aerodynamic Extruded Body Shapes
        // ============================================================
        const extrudeSettings = { depth: cfg.bodyW, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.05, bevelThickness: 0.05 };
        const bodyShape = new THREE.Shape();
        
        if (type === 'tank') {
            // Sloped armor profile
            bodyShape.moveTo(-cfg.bodyL/2, 0);
            bodyShape.lineTo(cfg.bodyL/2 - 0.5, 0);
            bodyShape.lineTo(cfg.bodyL/2, cfg.bodyH * 0.5);
            bodyShape.lineTo(cfg.bodyL/2 - 0.4, cfg.bodyH);
            bodyShape.lineTo(-cfg.bodyL/2 + 0.4, cfg.bodyH);
            bodyShape.lineTo(-cfg.bodyL/2, 0);
        } else if (type === 'van') {
            // Boxy but slightly angled front
            bodyShape.moveTo(-cfg.bodyL/2, 0);
            bodyShape.lineTo(cfg.bodyL/2, 0);
            bodyShape.lineTo(cfg.bodyL/2, cfg.bodyH * 0.7);
            bodyShape.lineTo(cfg.bodyL/2 - 0.4, cfg.bodyH + cfg.cabinH);
            bodyShape.lineTo(-cfg.bodyL/2, cfg.bodyH + cfg.cabinH);
            bodyShape.lineTo(-cfg.bodyL/2, 0);
        } else {
            // Car / Pickup (Slanted hood and windshield)
            bodyShape.moveTo(-cfg.bodyL/2, 0);
            bodyShape.lineTo(cfg.bodyL/2 - 0.2, 0); // front bottom
            bodyShape.lineTo(cfg.bodyL/2, cfg.bodyH * 0.5); // front bumper slant
            bodyShape.lineTo(cfg.bodyL/2 - 0.8, cfg.bodyH); // hood slope
            bodyShape.lineTo(cfg.cabinOffZ + cfg.cabinL/2, cfg.bodyH); // hood to windshield
            bodyShape.lineTo(cfg.cabinOffZ + cfg.cabinL/2 - 0.6, cfg.bodyH + cfg.cabinH); // windshield
            bodyShape.lineTo(cfg.cabinOffZ - cfg.cabinL/2, cfg.bodyH + cfg.cabinH); // roof
            if (type === 'pickup') {
                bodyShape.lineTo(cfg.cabinOffZ - cfg.cabinL/2, cfg.bodyH); // rear window straight down
            } else {
                bodyShape.lineTo(-cfg.bodyL/2 + 0.2, cfg.bodyH); // rear slope down
            }
            bodyShape.lineTo(-cfg.bodyL/2, cfg.bodyH * 0.8); // trunk
            bodyShape.lineTo(-cfg.bodyL/2, 0);
        }

        const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, extrudeSettings);
        // Center the extrusion
        bodyGeo.translate(0, 0, -cfg.bodyW / 2);
        
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        // Rotate so it lies along Z axis properly. Extrusion puts 'x' and 'y' of shape into X and Y of mesh. Depth is Z.
        // Wait, Shape X maps to 3D X, Shape Y maps to 3D Y, Extrude depth is along Z.
        // If we want bodyL to be Z-axis, we must rotate the mesh!
        body.rotation.y = -Math.PI / 2; 
        body.position.y = 0.5; // ground clearance
        body.castShadow = true;
        this.chassis.add(body);

        // Windows (Glass panels glued to the sides/front)
        if (type !== 'tank') {
            const windshieldGeo = new THREE.PlaneGeometry(cfg.bodyW - 0.1, 0.8);
            const windshield = new THREE.Mesh(windshieldGeo, glassMat);
            windshield.position.set(0, 0.5 + cfg.bodyH + cfg.cabinH / 2, cfg.cabinOffZ + cfg.cabinL/2 - 0.3);
            windshield.rotation.x = -Math.PI / 4;
            this.chassis.add(windshield);
        }

        // Turret for tank
        if (type === 'tank') {
            const turretGeo = new THREE.CylinderGeometry(0.8, 0.9, 0.5, 8);
            const turret = new THREE.Mesh(turretGeo, darkMat);
            turret.position.set(0, 0.5 + cfg.bodyH + 0.25, -0.3);
            turret.castShadow = false;
            this.chassis.add(turret);

            const barrelGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.5, 8);
            const barrel = new THREE.Mesh(barrelGeo, new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7 }));
            barrel.rotation.x = Math.PI / 2;
            barrel.position.set(0, 0.5 + cfg.bodyH + 0.25, 1.6);
            barrel.castShadow = false;
            this.chassis.add(barrel);
        }

        // ============================================================
        // 2. Wheel Suspensions and Steering Pivots
        // ============================================================
        const wheelR = type === 'tank' ? 0.5 : 0.45;
        const wheelW = type === 'tank' ? 0.4 : 0.3;
        const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 12);
        
        const wheelOffX = cfg.bodyW / 2 + wheelW / 2 + 0.05;
        const wheelZ1 = cfg.bodyL * 0.35;
        const wheelZ2 = -cfg.bodyL * 0.35;

        // Visual Axles
        const axleGeo = new THREE.CylinderGeometry(0.08, 0.08, cfg.bodyW + 0.4, 6);
        [wheelZ1, wheelZ2].forEach(wz => {
            const axle = new THREE.Mesh(axleGeo, darkMat);
            axle.position.set(0, wheelR, wz);
            axle.rotation.z = Math.PI / 2;
            this.chassis.add(axle); // axles stay with chassis
        });

        // Wheel meshes
        this.wheels = [];
        this.frontWheels = [];
        this.rearWheels = [];
        const rimGeo = new THREE.CylinderGeometry(wheelR * 0.5, wheelR * 0.5, wheelW + 0.04, 6);

        [
            [-wheelOffX, wheelR, wheelZ1, true],
            [wheelOffX, wheelR, wheelZ1, true],
            [-wheelOffX, wheelR, wheelZ2, false],
            [wheelOffX, wheelR, wheelZ2, false]
        ].forEach(([wx, wy, wz, isFront]) => {
            const pivot = new THREE.Group();
            pivot.position.set(wx, wy, wz);
            
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.castShadow = true;
            
            const rim = new THREE.Mesh(rimGeo, darkMat);
            rim.rotation.z = Math.PI / 2; 
            wheel.add(rim);
            
            pivot.add(wheel);
            group.add(pivot); // Pivots stay in root group so they don't lean with chassis
            
            this.wheels.push(wheel);
            if (isFront) {
                this.frontWheels.push(pivot);
            } else {
                this.rearWheels.push(pivot);
            }
        });

        // ============================================================
        // 3. Advanced Lighting (Headlights & Underglow)
        // ============================================================
        const hlGeo = new THREE.SphereGeometry(0.1, 6, 6);
        const frontZ = cfg.bodyL / 2;
        [-cfg.bodyW * 0.35, cfg.bodyW * 0.35].forEach(hx => {
            const hl = new THREE.Mesh(hlGeo, headlightMat);
            hl.position.set(hx, 0.5 + cfg.bodyH * 0.5, frontZ);
            this.chassis.add(hl);

            // True SpotLight
            const spot = new THREE.SpotLight(0xffffdd, 2.0, 50, Math.PI / 5, 0.5, 1);
            spot.position.copy(hl.position);
            
            const target = new THREE.Object3D();
            target.position.set(hx, 0.5, frontZ + 20);
            this.chassis.add(target);
            spot.target = target;

            // Shadows from multiple spotlights are incredibly expensive on mobile. Disabled.
            if (this.isLocal) {
                spot.castShadow = false;
            }
            this.chassis.add(spot);
        });

        // Taillights
        const tlGeo = new THREE.BoxGeometry(0.25, 0.12, 0.06);
        const rearZ = -cfg.bodyL / 2;
        [-cfg.bodyW * 0.35, cfg.bodyW * 0.35].forEach(tx => {
            const tl = new THREE.Mesh(tlGeo, taillightMat);
            tl.position.set(tx, 0.5 + cfg.bodyH * 0.4, rearZ);
            this.chassis.add(tl);
        });

        // Neon Underglow
        const underglow = new THREE.PointLight(color, 2.0, 8);
        underglow.position.set(0, 0.3, 0);
        this.chassis.add(underglow);
        
        const glowGeo = new THREE.PlaneGeometry(cfg.bodyW * 0.8, cfg.bodyL * 0.7);
        const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
        const glowPlane = new THREE.Mesh(glowGeo, glowMat);
        glowPlane.rotation.x = -Math.PI / 2;
        glowPlane.position.set(0, 0.05, 0);
        this.chassis.add(glowPlane);

        // ============================================================
        // 4. Attachments & Exhaust
        // ============================================================
        this.exhaustPipes = [];
        const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
        const exCount = type === 'tank' ? 1 : 2;
        const exPositions = exCount === 1 ? [0] : [-cfg.bodyW * 0.4, cfg.bodyW * 0.4];
        exPositions.forEach(ex => {
            const pipeGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 8);
            const pipe = new THREE.Mesh(pipeGeo, exhaustMat);
            pipe.position.set(ex, 0.5 + cfg.bodyH + 0.3, frontZ - 0.6);
            pipe.castShadow = false;
            this.chassis.add(pipe);
            this.exhaustPipes.push(pipe);
        });

        // Cow Catcher / Plow
        const plowMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 });
        const plowGeo = new THREE.CylinderGeometry(0.8, 0.8, cfg.bodyW + 0.4, 3);
        const plow = new THREE.Mesh(plowGeo, plowMat);
        plow.rotation.z = Math.PI / 2;
        plow.rotation.x = Math.PI / 5;
        plow.position.set(0, 0.35, frontZ + 0.6);
        plow.castShadow = false;
        this.chassis.add(plow);

        const spikeLen = 1.4;
        const spikeGeo = new THREE.ConeGeometry(0.12, spikeLen, 6);
        for (let s = 0; s < 3; s++) {
            const spike = new THREE.Mesh(spikeGeo, darkMat);
            spike.rotation.x = Math.PI / 2;
            spike.position.set(-cfg.bodyW * 0.4 + s * (cfg.bodyW * 0.4), 0.35, frontZ + 0.6 + spikeLen / 2);
            spike.castShadow = true;
            this.chassis.add(spike);
        }

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

        const drifting = !!input.drift;
        this.isDrifting = drifting;

        // ---- Smooth steering input (interpolated, not instant snap) ----
        const targetSteer = input.left ? 1 : input.right ? -1 : 0;
        const steerRate = 8; // how fast steering responds (higher = snappier)
        this._smoothSteer = (this._smoothSteer || 0) +
            (targetSteer - this._smoothSteer) * Math.min(1, steerRate * dt);

        // ---- Acceleration with a punchy feel ----
        // Use a stronger initial kick that tapers as speed builds (like a real engine)
        const speedRatio = Math.abs(this.speed) / cfg.maxSpeed;
        const accelMultiplier = 1.0 + (1 - speedRatio) * 0.6; // extra torque at low speed

        if (input.forward) {
            this.speed += cfg.accel * accelMultiplier * dt;
        } else if (input.backward) {
            // Braking is instant; reversing is slower
            if (this.speed > 0.5) {
                this.speed -= cfg.brakeDecel * dt; // braking
            } else {
                this.speed -= cfg.accel * 0.5 * dt; // reversing
            }
        }

        // ---- Drag — drifting keeps momentum, coasting slows smoothly ----
        const activeDrag = drifting ? Math.pow(0.998, dt * 60) : Math.pow(cfg.drag, dt * 60);
        this.speed *= activeDrag;

        // Clamp speed
        this.speed = Math.max(-cfg.maxSpeed * 0.35, Math.min(cfg.maxSpeed, this.speed));

        // Kill tiny speed at standstill
        if (!input.forward && !input.backward && Math.abs(this.speed) < 0.5 && !drifting) {
            this.speed = 0;
        }

        // ---- Turning: full response at low speed, reduced at high speed ----
        // This prevents the car from overpivoting at top speed (more realistic)
        let steerInput = 0;
        if (Math.abs(this.speed) > 0.5) {
            const turnDir = this.speed > 0 ? 1 : -1;
            // Turn ramp: full turning starts at speed 5 (was 15), reduces above maxSpeed*0.6
            const absSpeed = Math.abs(this.speed);
            const lowFactor  = Math.min(1, absSpeed / 5);                          // ramps up quickly
            const highReduce = Math.max(0.45, 1 - (absSpeed / cfg.maxSpeed) * 0.5); // reduces at top speed
            const driftBoost = drifting ? 1.6 : 1.0;
            const turnAmount = cfg.turnSpeed * driftBoost * turnDir * lowFactor * highReduce * dt;

            this.angle += this._smoothSteer * turnAmount;
            steerInput = this._smoothSteer; // pass smooth value for visuals
        }

        // ---- Drift physics ----
        if (drifting && Math.abs(this.speed) > 8) {
            const fwdX = Math.sin(this.angle);
            const fwdZ = Math.cos(this.angle);
            const velX = fwdX * this.speed + this.driftVelX;
            const velZ = fwdZ * this.speed + this.driftVelZ;
            const forwardComp = velX * fwdX + velZ * fwdZ;
            const latX = velX - fwdX * forwardComp;
            const latZ = velZ - fwdZ * forwardComp;
            this.driftVelX = this.driftVelX * 0.85 + latX * 0.5;
            this.driftVelZ = this.driftVelZ * 0.85 + latZ * 0.5;
            this.speed = forwardComp * 0.98;
        } else {
            this.driftVelX *= Math.pow(0.01, dt);
            this.driftVelZ *= Math.pow(0.01, dt);
        }

        // ---- Position update ----
        this.group.position.x += (Math.sin(this.angle) * this.speed + this.driftVelX) * dt;
        this.group.position.z += (Math.cos(this.angle) * this.speed + this.driftVelZ) * dt;
        this.group.rotation.y = this.angle;

        // Apply bounce from collisions
        if (Math.abs(this.bounce.x) > 0.1 || Math.abs(this.bounce.z) > 0.1) {
            this.group.position.x += this.bounce.x * dt;
            this.group.position.z += this.bounce.z * dt;
            this.bounce.x *= Math.pow(0.005, dt);
            this.bounce.z *= Math.pow(0.005, dt);
        }

        this._animateCarVisuals(this.speed, steerInput, input.forward, input.backward, dt, drifting);
    }

    // ========================================================================
    // Interpolation (remote cars)
    // ========================================================================

    updateFromServer(x, z, angle, speed, steer) {
        this.targetX = x;
        this.targetZ = z;
        this.targetAngle = angle;
        this.targetSpeed = speed || 0;
        this.targetSteer = steer || 0;
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

        // Animate visuals for remote cars
        // Estimate speed from movement or use server target
        const estSpeed = this.targetSpeed !== undefined ? this.targetSpeed : diff * 10; 
        const estSteer = this.targetSteer !== undefined ? this.targetSteer : 0;
        this._animateCarVisuals(estSpeed, estSteer, estSpeed > 5, estSpeed < -5, 0.016);
    }

    _animateCarVisuals(speed, steerInput, isAccel, isBraking, dt, isDrifting) {
        // Spin wheels
        const wheelSpin = speed * dt * 1.5;
        this.wheels.forEach(w => { w.rotation.x += wheelSpin; });

        // Steer front wheels
        const maxSteer = isDrifting ? Math.PI / 3.5 : Math.PI / 5;
        this.frontWheels.forEach(fw => {
            fw.rotation.y += (steerInput * maxSteer - fw.rotation.y) * 0.15;
        });

        // Chassis tilt/lean
        if (this.chassis) {
            let targetPitch = 0;
            if (isAccel) targetPitch = -0.05;
            if (isBraking) targetPitch = 0.08;
            this.chassis.rotation.x += (targetPitch - this.chassis.rotation.x) * 0.1;

            // Extra lean during drift
            const driftRollBoost = isDrifting ? 2.0 : 1.0;
            const targetRoll = steerInput * (speed / this.cfg.maxSpeed) * 0.12 * driftRollBoost;
            this.chassis.rotation.z += (targetRoll - this.chassis.rotation.z) * 0.1;
        }

        // Particle Emission
        if (window.particleSystem) {
            if (Math.abs(speed) > 10) {
                const intensity = Math.abs(speed) / this.cfg.maxSpeed;
                // During drift: heavy smoke from ALL four wheels
                const dustChance = isDrifting ? 1.0 : intensity * 0.6;
                if (Math.random() < dustChance) {
                    const wheels = isDrifting ? [...this.wheels] : [...this.rearWheels];
                    wheels.forEach(rw => {
                        const wPos = new THREE.Vector3();
                        rw.getWorldPosition(wPos);
                        wPos.y = 0.2;
                        window.particleSystem.spawnDust(wPos, null, isDrifting ? this.cfg.maxSpeed : Math.abs(speed));
                    });
                }
            }

            // Exhaust smoke
            if (this.exhaustPipes && isAccel && Math.random() < 0.4) {
                this.exhaustPipes.forEach(ep => {
                    const exPos = new THREE.Vector3();
                    ep.getWorldPosition(exPos);
                    exPos.y += 0.8;
                    window.particleSystem.spawnExhaustSmoke(exPos, 1);
                });
            }
        }
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
