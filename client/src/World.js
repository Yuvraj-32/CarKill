// ============================================================================
// World.js — 3D Arena: ground, sky, walls, obstacles, trees, sand, pits
// Arena: 300×300 units (maps to server's 3000×3000 ÷ 10)
// ============================================================================
import * as THREE from 'three';

export const ARENA_SIZE = 300;
const HALF = ARENA_SIZE / 2;
const WALL_HEIGHT = 4;
const OBSTACLE_COUNT = 14;
const TREE_COUNT = 30;
const PIT_COUNT = 6;

export class World {
    constructor(scene) {
        this.scene = scene;
        this.obstacles = []; // { mesh, box3, w, d, x, z }
        this.pits = [];      // { x, z, radius }

        this._createGround();
        this._createSandPatches();
        this._createWalls();
        this._createObstacles();
        this._createTrees();
        this._createPits();
        this._createSky();
        this._setupLighting();
        this._setupFog();
    }

    // ========================================================================
    // Ground — asphalt with procedural texture
    // ========================================================================

    _createGround() {
        const texture = this._createAsphaltTexture();
        const geo = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE);
        const mat = new THREE.MeshStandardMaterial({
            map: texture, roughness: 0.85, metalness: 0.1
        });
        const ground = new THREE.Mesh(geo, mat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(HALF, 0, HALF);
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Subtle grid overlay
        const grid = new THREE.GridHelper(ARENA_SIZE, 60, 0x333355, 0x222244);
        grid.position.set(HALF, 0.01, HALF);
        grid.material.opacity = 0.2;
        grid.material.transparent = true;
        this.scene.add(grid);
    }

    _createAsphaltTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#2a2a35';
        ctx.fillRect(0, 0, 512, 512);

        for (let i = 0; i < 6000; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const g = Math.floor(Math.random() * 25) + 35;
            ctx.fillStyle = `rgb(${g}, ${g}, ${g + 5})`;
            ctx.fillRect(x, y, 1 + Math.random(), 1 + Math.random());
        }

        ctx.strokeStyle = 'rgba(60, 60, 70, 0.3)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 15; i++) {
            ctx.beginPath();
            ctx.moveTo(Math.random() * 512, Math.random() * 512);
            ctx.lineTo(Math.random() * 512, Math.random() * 512);
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(30, 30);
        return texture;
    }

    // ========================================================================
    // Sand patches — circular sand/dirt areas
    // ========================================================================

    _createSandPatches() {
        const patchCount = 10;
        const margin = 25;

        for (let i = 0; i < patchCount; i++) {
            const radius = 8 + Math.random() * 18;
            const x = margin + Math.random() * (ARENA_SIZE - margin * 2);
            const z = margin + Math.random() * (ARENA_SIZE - margin * 2);

            // Main sand circle
            const sandGeo = new THREE.CircleGeometry(radius, 32);
            const sandColor = new THREE.Color().setHSL(
                0.08 + Math.random() * 0.04,  // tan hue
                0.35 + Math.random() * 0.15,  // saturation
                0.45 + Math.random() * 0.1     // lightness
            );
            const sandMat = new THREE.MeshStandardMaterial({
                color: sandColor, roughness: 0.95, metalness: 0.0
            });
            const sand = new THREE.Mesh(sandGeo, sandMat);
            sand.rotation.x = -Math.PI / 2;
            sand.position.set(x, 0.015, z);
            sand.receiveShadow = true;
            this.scene.add(sand);

            // Scattered small rocks on sand
            const rockMat = new THREE.MeshStandardMaterial({
                color: 0x888877, roughness: 0.9, metalness: 0.1
            });
            const rockCount = Math.floor(3 + Math.random() * 5);
            for (let r = 0; r < rockCount; r++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * radius * 0.8;
                const rx = x + Math.cos(angle) * dist;
                const rz = z + Math.sin(angle) * dist;
                const rSize = 0.15 + Math.random() * 0.35;
                const rockGeo = new THREE.SphereGeometry(rSize, 5, 4);
                const rock = new THREE.Mesh(rockGeo, rockMat);
                rock.position.set(rx, rSize * 0.4, rz);
                rock.scale.set(1, 0.5 + Math.random() * 0.3, 1);
                rock.castShadow = true;
                this.scene.add(rock);
            }
        }
    }

    // ========================================================================
    // Trees — trunk + layered foliage spheres
    // ========================================================================

    _createTrees() {
        const margin = 15;

        for (let i = 0; i < TREE_COUNT; i++) {
            const x = margin + Math.random() * (ARENA_SIZE - margin * 2);
            const z = margin + Math.random() * (ARENA_SIZE - margin * 2);

            // Skip if too close to an existing obstacle or pit
            let tooClose = false;
            for (const obs of this.obstacles) {
                const dx = x - obs.x, dz = z - obs.z;
                if (Math.sqrt(dx * dx + dz * dz) < 8) { tooClose = true; break; }
            }
            if (tooClose) continue;

            const tree = new THREE.Group();
            const treeHeight = 3 + Math.random() * 3;
            const trunkRadius = 0.25 + Math.random() * 0.15;

            // Trunk
            const trunkGeo = new THREE.CylinderGeometry(
                trunkRadius * 0.7, trunkRadius, treeHeight, 8
            );
            const trunkMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(0.07, 0.5, 0.2 + Math.random() * 0.1),
                roughness: 0.95
            });
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.y = treeHeight / 2;
            trunk.castShadow = true;
            tree.add(trunk);

            // Foliage — multiple overlapping spheres
            const foliageColor = new THREE.Color().setHSL(
                0.28 + Math.random() * 0.08,  // green hue variation
                0.55 + Math.random() * 0.2,
                0.25 + Math.random() * 0.15
            );
            const foliageMat = new THREE.MeshStandardMaterial({
                color: foliageColor, roughness: 0.85
            });

            const foliageBase = treeHeight * 0.75;
            const foliageR = 1.2 + Math.random() * 1.0;

            // Center blob
            const f1 = new THREE.Mesh(new THREE.SphereGeometry(foliageR, 8, 7), foliageMat);
            f1.position.set(0, foliageBase + foliageR * 0.3, 0);
            f1.castShadow = true;
            tree.add(f1);

            // Side blobs
            for (let s = 0; s < 3; s++) {
                const sAngle = (s / 3) * Math.PI * 2 + Math.random() * 0.5;
                const sR = foliageR * (0.55 + Math.random() * 0.25);
                const sDist = foliageR * 0.5;
                const sf = new THREE.Mesh(new THREE.SphereGeometry(sR, 7, 6), foliageMat);
                sf.position.set(
                    Math.cos(sAngle) * sDist,
                    foliageBase + Math.random() * foliageR * 0.3,
                    Math.sin(sAngle) * sDist
                );
                sf.castShadow = true;
                tree.add(sf);
            }

            // Top blob
            const fTop = new THREE.Mesh(
                new THREE.SphereGeometry(foliageR * 0.6, 7, 6), foliageMat
            );
            fTop.position.set(0, foliageBase + foliageR * 0.9, 0);
            fTop.castShadow = true;
            tree.add(fTop);

            tree.position.set(x, 0, z);
            this.scene.add(tree);

            // Collidable trunk
            this.obstacles.push({
                mesh: trunk, box: null,
                w: trunkRadius * 3, d: trunkRadius * 3, x, z
            });
        }
    }

    // ========================================================================
    // Pits — dark holes with glowing warning rings
    // ========================================================================

    _createPits() {
        const margin = 35;

        for (let i = 0; i < PIT_COUNT; i++) {
            const x = margin + Math.random() * (ARENA_SIZE - margin * 2);
            const z = margin + Math.random() * (ARENA_SIZE - margin * 2);
            const radius = 3 + Math.random() * 2.5;

            // Skip if too close to obstacles/trees
            let tooClose = false;
            for (const obs of this.obstacles) {
                const dx = x - obs.x, dz = z - obs.z;
                if (Math.sqrt(dx * dx + dz * dz) < radius + 6) { tooClose = true; break; }
            }
            if (tooClose) { continue; }

            // Pit hole — sunken cylinder
            const pitGeo = new THREE.CylinderGeometry(radius, radius * 0.8, 3, 24);
            const pitMat = new THREE.MeshStandardMaterial({
                color: 0x080808, roughness: 1.0, metalness: 0
            });
            const pit = new THREE.Mesh(pitGeo, pitMat);
            pit.position.set(x, -1.5, z);
            this.scene.add(pit);

            // Dark surface circle
            const holeGeo = new THREE.CircleGeometry(radius, 32);
            const holeMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
            const hole = new THREE.Mesh(holeGeo, holeMat);
            hole.rotation.x = -Math.PI / 2;
            hole.position.set(x, 0.02, z);
            this.scene.add(hole);

            // Warning ring — glowing red/orange
            const ringGeo = new THREE.RingGeometry(radius - 0.15, radius + 0.4, 32);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0xff4400, transparent: true, opacity: 0.55,
                side: THREE.DoubleSide
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(x, 0.03, z);
            this.scene.add(ring);

            // Outer caution ring
            const outerRingGeo = new THREE.RingGeometry(radius + 0.4, radius + 0.8, 32);
            const outerRingMat = new THREE.MeshBasicMaterial({
                color: 0xff8800, transparent: true, opacity: 0.25,
                side: THREE.DoubleSide
            });
            const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
            outerRing.rotation.x = -Math.PI / 2;
            outerRing.position.set(x, 0.025, z);
            this.scene.add(outerRing);

            // Danger glow from below
            const glowLight = new THREE.PointLight(0xff3300, 2, radius * 4);
            glowLight.position.set(x, -0.5, z);
            this.scene.add(glowLight);

            this.pits.push({ x, z, radius: radius * 0.85 }); // slightly smaller trigger
        }
    }

    // ========================================================================
    // Walls — boundary walls with neon edge
    // ========================================================================

    _createWalls() {
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x334455, roughness: 0.7, metalness: 0.3
        });
        const neonMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff, transparent: true, opacity: 0.6
        });

        const configs = [
            { w: ARENA_SIZE, d: 1, x: HALF, z: 0 },
            { w: ARENA_SIZE, d: 1, x: HALF, z: ARENA_SIZE },
            { w: 1, d: ARENA_SIZE, x: 0, z: HALF },
            { w: 1, d: ARENA_SIZE, x: ARENA_SIZE, z: HALF }
        ];

        configs.forEach(cfg => {
            const geo = new THREE.BoxGeometry(cfg.w, WALL_HEIGHT, cfg.d);
            const wall = new THREE.Mesh(geo, wallMat);
            wall.position.set(cfg.x, WALL_HEIGHT / 2, cfg.z);
            wall.castShadow = true;
            wall.receiveShadow = true;
            this.scene.add(wall);

            const edgeGeo = new THREE.BoxGeometry(cfg.w + 0.2, 0.15, cfg.d + 0.2);
            const edge = new THREE.Mesh(edgeGeo, neonMat);
            edge.position.set(cfg.x, WALL_HEIGHT + 0.075, cfg.z);
            this.scene.add(edge);
        });
    }

    // ========================================================================
    // Obstacles — metallic crates with neon edges
    // ========================================================================

    _createObstacles() {
        const obstacleMat = new THREE.MeshStandardMaterial({
            color: 0x445566, roughness: 0.6, metalness: 0.4
        });
        const neonEdgeMat = new THREE.MeshBasicMaterial({
            color: 0x9b59b6, transparent: true, opacity: 0.5
        });
        const margin = 30;

        for (let i = 0; i < OBSTACLE_COUNT; i++) {
            const w = 2 + Math.random() * 4;
            const h = 1.5 + Math.random() * 3;
            const d = 2 + Math.random() * 4;
            const x = margin + Math.random() * (ARENA_SIZE - margin * 2);
            const z = margin + Math.random() * (ARENA_SIZE - margin * 2);

            const geo = new THREE.BoxGeometry(w, h, d);
            const mesh = new THREE.Mesh(geo, obstacleMat);
            mesh.position.set(x, h / 2, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);

            const edgeGeo = new THREE.BoxGeometry(w + 0.1, 0.1, d + 0.1);
            const edge = new THREE.Mesh(edgeGeo, neonEdgeMat);
            edge.position.set(x, h + 0.05, z);
            this.scene.add(edge);

            const box = new THREE.Box3().setFromObject(mesh);
            this.obstacles.push({ mesh, box, w, d, x, z });
        }
    }

    // ========================================================================
    // Sky dome — gradient with stars
    // ========================================================================

    _createSky() {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createLinearGradient(0, 0, 0, 512);
        gradient.addColorStop(0, '#050520');
        gradient.addColorStop(0.25, '#0a0a3a');
        gradient.addColorStop(0.5, '#1a1040');
        gradient.addColorStop(0.75, '#2d1b69');
        gradient.addColorStop(0.9, '#4a1a5e');
        gradient.addColorStop(1.0, '#ff6b35');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 2, 512);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        for (let i = 0; i < 60; i++) {
            ctx.fillRect(Math.random() * 2, Math.random() * 256, 1, 1);
        }

        const texture = new THREE.CanvasTexture(canvas);
        const skyGeo = new THREE.SphereGeometry(480, 32, 32);
        const skyMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        sky.position.set(HALF, 0, HALF);
        this.scene.add(sky);
    }

    // ========================================================================
    // Lighting
    // ========================================================================

    _setupLighting() {
        const ambient = new THREE.AmbientLight(0x404060, 0.5);
        this.scene.add(ambient);

        const hemi = new THREE.HemisphereLight(0x6688cc, 0x332244, 0.4);
        this.scene.add(hemi);

        const sun = new THREE.DirectionalLight(0xffeedd, 1.8);
        sun.position.set(HALF + 60, 100, HALF + 40);
        sun.target.position.set(HALF, 0, HALF);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 300;
        sun.shadow.camera.left = -HALF;
        sun.shadow.camera.right = HALF;
        sun.shadow.camera.top = HALF;
        sun.shadow.camera.bottom = -HALF;
        sun.shadow.bias = -0.001;
        this.scene.add(sun);
        this.scene.add(sun.target);
    }

    _setupFog() {
        this.scene.fog = new THREE.FogExp2(0x0d0d25, 0.006);
    }

    // ========================================================================
    // Collision helpers
    // ========================================================================

    clampToArena(pos, margin = 2) {
        pos.x = Math.max(margin, Math.min(ARENA_SIZE - margin, pos.x));
        pos.z = Math.max(margin, Math.min(ARENA_SIZE - margin, pos.z));
    }

    checkObstacleCollision(pos, radius) {
        for (const obs of this.obstacles) {
            const dx = pos.x - obs.x;
            const dz = pos.z - obs.z;
            const halfW = obs.w / 2 + radius;
            const halfD = obs.d / 2 + radius;

            if (Math.abs(dx) < halfW && Math.abs(dz) < halfD) {
                const overlapX = halfW - Math.abs(dx);
                const overlapZ = halfD - Math.abs(dz);
                if (overlapX < overlapZ) {
                    return { x: Math.sign(dx) * overlapX, z: 0 };
                } else {
                    return { x: 0, z: Math.sign(dz) * overlapZ };
                }
            }
        }
        return null;
    }

    /** Check if a position is inside any pit. Returns the pit or null. */
    checkPitCollision(pos) {
        for (const pit of this.pits) {
            const dx = pos.x - pit.x;
            const dz = pos.z - pit.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < pit.radius) {
                return pit;
            }
        }
        return null;
    }
}
