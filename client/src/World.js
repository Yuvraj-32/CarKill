// ============================================================================
// World.js — 3D Arena: ground, sky, walls, obstacles, trees, sand, pits,
//            river (sky-blue), wooden bridges, ramps
// Arena: 300×300 units (maps to server's 3000×3000 ÷ 10)
// ============================================================================
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export const ARENA_SIZE = 300;
const HALF = ARENA_SIZE / 2;
const WALL_HEIGHT = 4;
const OBSTACLE_COUNT = 14;
const TREE_COUNT = 30;
const PIT_COUNT = 5;

export class World {
    constructor(scene) {
        this.scene = scene;
        this.obstacles = [];
        this.pits = [];
        this.rivers = [];
        this.ramps = [];

        this._createGround();
        this._createSandPatches();
        this._createWalls();
        this._createObstacles();
        this._createTrees();
        this._createPits();
        this._createRiver();
        this._createBridges();
        this._createRamps();
        this._createSky();
        this._setupLighting();
        this._setupFog();
    }

    // ========================================================================
    // Ground
    // ========================================================================

    _createGround() {
        const texture = this._createAsphaltTexture();
        const geo = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE);
        const mat = new THREE.MeshStandardMaterial({
            map: texture,
            bumpMap: texture, bumpScale: 0.15,
            roughness: 0.95, metalness: 0.05
        });
        const ground = new THREE.Mesh(geo, mat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(HALF, 0, HALF);
        ground.receiveShadow = true;
        this.scene.add(ground);

        const grid = new THREE.GridHelper(ARENA_SIZE, 60, 0x333355, 0x222244);
        grid.position.set(HALF, 0.01, HALF);
        grid.material.opacity = 0.2;
        grid.material.transparent = true;
        this.scene.add(grid);
    }

    _createAsphaltTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#2a2a35';
        ctx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 6000; i++) {
            const x = Math.random() * 512, y = Math.random() * 512;
            const g = Math.floor(Math.random() * 25) + 35;
            ctx.fillStyle = `rgb(${g}, ${g}, ${g + 5})`;
            ctx.fillRect(x, y, 1 + Math.random(), 1 + Math.random());
        }
        ctx.strokeStyle = 'rgba(60, 60, 70, 0.3)'; ctx.lineWidth = 1;
        for (let i = 0; i < 15; i++) {
            ctx.beginPath();
            ctx.moveTo(Math.random() * 512, Math.random() * 512);
            ctx.lineTo(Math.random() * 512, Math.random() * 512);
            ctx.stroke();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(30, 30);
        return texture;
    }

    // ========================================================================
    // Sand patches
    // ========================================================================

    _createSandPatches() {
        for (let i = 0; i < 10; i++) {
            const radius = 8 + Math.random() * 18;
            const x = 25 + Math.random() * (ARENA_SIZE - 50);
            const z = 25 + Math.random() * (ARENA_SIZE - 50);
            if (Math.abs(z - HALF) < 18) continue;

            const sandGeo = new THREE.CircleGeometry(radius, 32);
            const sandColor = new THREE.Color().setHSL(0.08 + Math.random() * 0.04, 0.35 + Math.random() * 0.15, 0.45 + Math.random() * 0.1);
            const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ color: sandColor, roughness: 0.95 }));
            sand.rotation.x = -Math.PI / 2;
            sand.position.set(x, 0.015, z);
            sand.receiveShadow = true;
            this.scene.add(sand);

            const rockMat = new THREE.MeshStandardMaterial({ color: 0x888877, roughness: 0.9, metalness: 0.1 });
            for (let r = 0; r < Math.floor(3 + Math.random() * 5); r++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * radius * 0.8;
                const rSize = 0.15 + Math.random() * 0.35;
                const rock = new THREE.Mesh(new THREE.SphereGeometry(rSize, 5, 4), rockMat);
                rock.position.set(x + Math.cos(angle) * dist, rSize * 0.4, z + Math.sin(angle) * dist);
                rock.scale.set(1, 0.5 + Math.random() * 0.3, 1);
                rock.castShadow = true;
                this.scene.add(rock);
            }
        }
    }

    // ========================================================================
    // Trees
    // ========================================================================

    _createTrees() {
        for (let i = 0; i < TREE_COUNT; i++) {
            const x = 15 + Math.random() * (ARENA_SIZE - 30);
            const z = 15 + Math.random() * (ARENA_SIZE - 30);
            if (Math.abs(z - HALF) < 18) continue;

            let tooClose = false;
            for (const obs of this.obstacles) {
                const dx2 = x - obs.x, dz2 = z - obs.z;
                if (Math.sqrt(dx2 * dx2 + dz2 * dz2) < 8) { tooClose = true; break; }
            }
            if (tooClose) continue;

            const tree = new THREE.Group();
            const treeHeight = 3 + Math.random() * 3;
            const trunkRadius = 0.25 + Math.random() * 0.15;

            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(trunkRadius * 0.7, trunkRadius, treeHeight, 8),
                new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.07, 0.5, 0.2 + Math.random() * 0.1), roughness: 0.95 })
            );
            trunk.position.y = treeHeight / 2;
            trunk.castShadow = true;
            tree.add(trunk);

            const foliageColor = new THREE.Color().setHSL(0.28 + Math.random() * 0.08, 0.55 + Math.random() * 0.2, 0.25 + Math.random() * 0.15);
            const foliageMat = new THREE.MeshStandardMaterial({ color: foliageColor, roughness: 0.85 });
            const foliageBase = treeHeight * 0.75;
            const foliageR = 1.2 + Math.random() * 1.0;

            const f1 = new THREE.Mesh(new THREE.SphereGeometry(foliageR, 8, 7), foliageMat);
            f1.position.set(0, foliageBase + foliageR * 0.3, 0);
            f1.castShadow = true; tree.add(f1);

            for (let s = 0; s < 3; s++) {
                const sAngle = (s / 3) * Math.PI * 2 + Math.random() * 0.5;
                const sR = foliageR * (0.55 + Math.random() * 0.25);
                const sf = new THREE.Mesh(new THREE.SphereGeometry(sR, 7, 6), foliageMat);
                sf.position.set(Math.cos(sAngle) * foliageR * 0.5, foliageBase + Math.random() * foliageR * 0.3, Math.sin(sAngle) * foliageR * 0.5);
                sf.castShadow = true; tree.add(sf);
            }
            const fTop = new THREE.Mesh(new THREE.SphereGeometry(foliageR * 0.6, 7, 6), foliageMat);
            fTop.position.set(0, foliageBase + foliageR * 0.9, 0);
            fTop.castShadow = true; tree.add(fTop);

            tree.position.set(x, 0, z);
            this.scene.add(tree);
            this.obstacles.push({ mesh: trunk, box: null, w: trunkRadius * 3, d: trunkRadius * 3, x, z });
        }
    }

    // ========================================================================
    // Pits
    // ========================================================================

    _createPits() {
        for (let i = 0; i < PIT_COUNT; i++) {
            const x = 35 + Math.random() * (ARENA_SIZE - 70);
            const z = 35 + Math.random() * (ARENA_SIZE - 70);
            const radius = 3 + Math.random() * 2.5;
            if (Math.abs(z - HALF) < 20) continue;

            let tooClose = false;
            for (const obs of this.obstacles) {
                const dx2 = x - obs.x, dz2 = z - obs.z;
                if (Math.sqrt(dx2 * dx2 + dz2 * dz2) < radius + 6) { tooClose = true; break; }
            }
            if (tooClose) continue;

            this.scene.add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.8, 3, 24), new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1.0 })).translateX(x).translateY(-1.5).translateZ(z));

            const hole = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
            hole.rotation.x = -Math.PI / 2; hole.position.set(x, 0.02, z); this.scene.add(hole);

            const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.15, radius + 0.4, 32), new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
            ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.03, z); this.scene.add(ring);

            const outerRing = new THREE.Mesh(new THREE.RingGeometry(radius + 0.4, radius + 0.8, 32), new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
            outerRing.rotation.x = -Math.PI / 2; outerRing.position.set(x, 0.025, z); this.scene.add(outerRing);

            const glowLight = new THREE.PointLight(0xff3300, 2, radius * 4);
            glowLight.position.set(x, -0.5, z); this.scene.add(glowLight);

            this.pits.push({ x, z, radius: radius * 0.85 });
        }
    }

    // ========================================================================
    // River — sky-blue flowing water across the arena center
    // ========================================================================

    _createRiver() {
        const riverWidth = 24;
        const hw = riverWidth / 2;
        const riverZ = HALF;

        // Sky-blue water texture
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createLinearGradient(0, 0, 256, 256);
        grad.addColorStop(0, '#5bbcde');
        grad.addColorStop(0.3, '#6dd5f7');
        grad.addColorStop(0.5, '#87ceeb');
        grad.addColorStop(0.7, '#6dd5f7');
        grad.addColorStop(1, '#5bbcde');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);

        // Light ripples
        ctx.strokeStyle = 'rgba(200, 240, 255, 0.35)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 25; i++) {
            ctx.beginPath();
            ctx.arc(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 12, 0, Math.PI * 2);
            ctx.stroke();
        }
        // White highlights
        ctx.fillStyle = 'rgba(230, 250, 255, 0.2)';
        for (let i = 0; i < 60; i++) {
            ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 6, 1);
        }

        const waterTexture = new THREE.CanvasTexture(canvas);
        waterTexture.wrapS = THREE.RepeatWrapping;
        waterTexture.wrapT = THREE.RepeatWrapping;
        waterTexture.repeat.set(20, 2);
        this.waterTexture = waterTexture;

        // River bed
        const bed = new THREE.Mesh(
            new THREE.BoxGeometry(ARENA_SIZE - 4, 1.5, riverWidth + 4),
            new THREE.MeshStandardMaterial({ color: 0x2a4a5a, roughness: 0.9 })
        );
        bed.position.set(HALF, -0.75, riverZ);
        this.scene.add(bed);

        // Water surface — deep realistic blue
        const water = new THREE.Mesh(
            new THREE.PlaneGeometry(ARENA_SIZE - 4, riverWidth),
            new THREE.MeshStandardMaterial({
                color: 0x003366,
                transparent: true, opacity: 0.9,
                roughness: 0.05, metalness: 0.85,
                bumpMap: waterTexture, bumpScale: 0.04
            })
        );
        water.rotation.x = -Math.PI / 2;
        water.position.set(HALF, -0.08, riverZ);
        this.scene.add(water);

        // Riverbank edges — earthy brown
        const bankMat = new THREE.MeshStandardMaterial({ color: 0x6b5b3a, roughness: 0.85 });
        [-1, 1].forEach(side => {
            const bank = new THREE.Mesh(new THREE.BoxGeometry(ARENA_SIZE - 4, 0.5, 1.8), bankMat);
            bank.position.set(HALF, 0.05, riverZ + side * (hw + 0.6));
            bank.castShadow = true;
            this.scene.add(bank);

            // Grass edge along bank
            const grass = new THREE.Mesh(
                new THREE.BoxGeometry(ARENA_SIZE - 6, 0.05, 1.2),
                new THREE.MeshStandardMaterial({ color: 0x3a6b2a, roughness: 0.9 })
            );
            grass.position.set(HALF, 0.31, riverZ + side * (hw + 1.8));
            this.scene.add(grass);
        });

        this.rivers.push({ x1: 2, x2: ARENA_SIZE - 2, z1: riverZ - hw, z2: riverZ + hw });
    }

    // ========================================================================
    // Wooden Bridges — rustic planks with log railings
    // ========================================================================

    _createBridges() {
        const bridgeConfigs = [
            { x: 80, w: 10 },
            { x: 220, w: 10 }
        ];
        const riverZ = HALF;
        const bridgeLen = 30;

        // Realistic procedural wood texture
        const woodTex = this._createWoodTexture();
        const darkWood = 0x5C4033;

        bridgeConfigs.forEach(cfg => {
            const group = new THREE.Group();

            // Main deck — thick wooden planks
            const deckMat = new THREE.MeshStandardMaterial({ 
                map: woodTex, bumpMap: woodTex, bumpScale: 0.05, 
                roughness: 0.85, metalness: 0.05 
            });

            // Individual planks across the bridge
            const plankW = cfg.w - 0.6;
            for (let p = -bridgeLen / 2; p < bridgeLen / 2; p += 0.8) {
                const plank = new THREE.Mesh(
                    new THREE.BoxGeometry(plankW, 0.12, 0.7),
                    deckMat
                );
                plank.position.set(0, 0.76, p);
                plank.castShadow = true;
                plank.receiveShadow = true;
                group.add(plank);
            }

            // Support beams underneath (2 long beams)
            [-1, 1].forEach(side => {
                const beam = new THREE.Mesh(
                    new THREE.BoxGeometry(0.5, 0.4, bridgeLen),
                    new THREE.MeshStandardMaterial({ color: darkWood, roughness: 0.9 })
                );
                beam.position.set(side * (plankW / 2 - 0.5), 0.5, 0);
                beam.castShadow = true;
                group.add(beam);
            });

            // Support pillars in water (thick logs)
            [-1, 0, 1].forEach(pIdx => {
                [-1, 1].forEach(side => {
                    const pillar = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.25, 0.3, 2.2, 8),
                        new THREE.MeshStandardMaterial({ color: darkWood, roughness: 0.9 })
                    );
                    pillar.position.set(side * (plankW / 2 - 1), -0.3, pIdx * 4);
                    pillar.castShadow = true;
                    group.add(pillar);
                });
            });

            group.position.set(cfg.x, -0.80, riverZ);
            this.scene.add(group);
        });
    }

    // ========================================================================
    // Ramps — stepped concrete ramps (simple, bug-free)
    // ========================================================================

    _createRamps() {
        const woodTex = this._createWoodTexture();
        const rampMat = new THREE.MeshStandardMaterial({ 
            map: woodTex, bumpMap: woodTex, bumpScale: 0.04, 
            roughness: 0.8, metalness: 0.1 
        });
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });

        const configs = [
            { x: 40, z: 132, rotY: 0 },
            { x: 150, z: 168, rotY: Math.PI },
            { x: 260, z: 132, rotY: 0 }
        ];

        const rampW = 8, totalH = 4.0, totalD = 12;
        const stepCount = 10;
        const stepH = totalH / stepCount;
        const stepD = totalD / stepCount;

        configs.forEach(cfg => {
            const group = new THREE.Group();

            // Build stepped ramp
            for (let s = 0; s < stepCount; s++) {
                const h = stepH * (s + 1);
                const geo = new THREE.BoxGeometry(rampW, h, stepD);
                const step = new THREE.Mesh(geo, rampMat);
                step.position.set(0, h / 2, (s - stepCount / 2 + 0.5) * stepD);
                step.castShadow = true;
                step.receiveShadow = true;
                group.add(step);
            }

            // Caution stripe on top edge
            const stripe = new THREE.Mesh(
                new THREE.BoxGeometry(rampW + 0.1, 0.08, 0.4),
                stripeMat
            );
            stripe.position.set(0, totalH + 0.04, (stepCount / 2 - 0.5) * stepD);
            group.add(stripe);

            group.rotation.y = cfg.rotY;
            group.position.set(cfg.x, 0, cfg.z);
            this.scene.add(group);

            this.ramps.push({
                x: cfg.x, z: cfg.z,
                w: rampW, d: totalD,
                height: totalH,
                rotY: cfg.rotY
            });
        });
    }

    // ========================================================================
    // Walls
    // ========================================================================

    _createWalls() {
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.7, metalness: 0.3 });
        const neonMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6 });

        [
            { w: ARENA_SIZE, d: 1, x: HALF, z: 0 },
            { w: ARENA_SIZE, d: 1, x: HALF, z: ARENA_SIZE },
            { w: 1, d: ARENA_SIZE, x: 0, z: HALF },
            { w: 1, d: ARENA_SIZE, x: ARENA_SIZE, z: HALF }
        ].forEach(cfg => {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, WALL_HEIGHT, cfg.d), wallMat);
            wall.position.set(cfg.x, WALL_HEIGHT / 2, cfg.z);
            wall.castShadow = true; wall.receiveShadow = true;
            this.scene.add(wall);

            const edge = new THREE.Mesh(new THREE.BoxGeometry(cfg.w + 0.2, 0.15, cfg.d + 0.2), neonMat);
            edge.position.set(cfg.x, WALL_HEIGHT + 0.075, cfg.z);
            this.scene.add(edge);
        });
    }

    // ========================================================================
    // Obstacles
    // ========================================================================

    _createObstacles() {
        const obstacleMat = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.6, metalness: 0.4 });
        const neonEdgeMat = new THREE.MeshBasicMaterial({ color: 0x9b59b6, transparent: true, opacity: 0.5 });

        for (let i = 0; i < OBSTACLE_COUNT; i++) {
            const w = 2 + Math.random() * 4;
            const h = 1.5 + Math.random() * 3;
            const d = 2 + Math.random() * 4;
            const x = 30 + Math.random() * (ARENA_SIZE - 60);
            const z = 30 + Math.random() * (ARENA_SIZE - 60);
            if (Math.abs(z - HALF) < 15) continue;

            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), obstacleMat);
            mesh.position.set(x, h / 2, z);
            mesh.castShadow = true; mesh.receiveShadow = true;
            this.scene.add(mesh);

            const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.1, d + 0.1), neonEdgeMat);
            edge.position.set(x, h + 0.05, z);
            this.scene.add(edge);

            this.obstacles.push({ mesh, box: new THREE.Box3().setFromObject(mesh), w, d, x, z });
        }
    }

    // ========================================================================
    // Wood Texture Generator
    // ========================================================================

    _createWoodTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#6b4c2a';
        ctx.fillRect(0, 0, 512, 512);
        
        ctx.lineWidth = 2;
        for (let i = 0; i < 200; i++) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(50, 30, 10, ${Math.random() * 0.25 + 0.05})`;
            const y1 = Math.random() * 512;
            const y2 = y1 + (Math.random() - 0.5) * 40;
            ctx.moveTo(0, y1);
            ctx.bezierCurveTo(170, y1 + 15, 340, y2 - 15, 512, y2);
            ctx.stroke();
        }
        
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        for (let i = 0; i < 6000; i++) {
            ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, Math.random() * 5);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 2);
        return texture;
    }

    // ========================================================================
    // Sky
    // ========================================================================

    _createSky() {
        this.sky = new Sky();
        this.sky.scale.setScalar(450000);
        this.scene.add(this.sky);

        this.sunPosition = new THREE.Vector3();

        const effectController = {
            turbidity: 10,
            rayleigh: 2,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.8,
            elevation: 25, 
            azimuth: 180, 
            exposure: 1.1
        };

        const uniforms = this.sky.material.uniforms;
        uniforms['turbidity'].value = effectController.turbidity;
        uniforms['rayleigh'].value = effectController.rayleigh;
        uniforms['mieCoefficient'].value = effectController.mieCoefficient;
        uniforms['mieDirectionalG'].value = effectController.mieDirectionalG;

        const phi = THREE.MathUtils.degToRad(90 - effectController.elevation);
        const theta = THREE.MathUtils.degToRad(effectController.azimuth);
        this.sunPosition.setFromSphericalCoords(1, phi, theta);
        uniforms['sunPosition'].value.copy(this.sunPosition);
    }

    // ========================================================================
    // Lighting & Fog
    // ========================================================================

    _setupLighting() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.5));

        const sun = new THREE.DirectionalLight(0xffeedd, 2.0);
        sun.position.copy(this.sunPosition).multiplyScalar(200);
        sun.target.position.set(HALF, 0, HALF);
        sun.position.add(sun.target.position);

        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.near = 1; sun.shadow.camera.far = 600;
        sun.shadow.camera.left = -HALF; sun.shadow.camera.right = HALF;
        sun.shadow.camera.top = HALF; sun.shadow.camera.bottom = -HALF;
        sun.shadow.bias = -0.001;
        this.scene.add(sun); this.scene.add(sun.target);
    }

    _setupFog() { this.scene.fog = new THREE.FogExp2(0xa0c8f0, 0.0035); }

    // ========================================================================
    // Update (call per frame)
    // ========================================================================

    update(delta) {
        if (this.waterTexture) this.waterTexture.offset.x += delta * 0.15;
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
            const dx = pos.x - obs.x, dz = pos.z - obs.z;
            const halfW = obs.w / 2 + radius, halfD = obs.d / 2 + radius;
            if (Math.abs(dx) < halfW && Math.abs(dz) < halfD) {
                const overlapX = halfW - Math.abs(dx), overlapZ = halfD - Math.abs(dz);
                return overlapX < overlapZ ? { x: Math.sign(dx) * overlapX, z: 0 } : { x: 0, z: Math.sign(dz) * overlapZ };
            }
        }
        return null;
    }

    checkPitCollision(pos) {
        for (const pit of this.pits) {
            const dx = pos.x - pit.x, dz = pos.z - pit.z;
            if (Math.sqrt(dx * dx + dz * dz) < pit.radius) return pit;
        }
        return null;
    }

    checkRiverCollision(pos) {
        for (const r of this.rivers) {
            if (pos.x >= r.x1 && pos.x <= r.x2 && pos.z >= r.z1 && pos.z <= r.z2) {
                // On a bridge = safe
                if (Math.abs(pos.x - 80) < 6 || Math.abs(pos.x - 220) < 6) return false;
                return true;
            }
        }
        return false;
    }

    checkRamp(pos) {
        for (const ramp of this.ramps) {
            const dx = Math.abs(pos.x - ramp.x);
            const dz = Math.abs(pos.z - ramp.z);
            if (dx < ramp.w / 2 && dz < ramp.d / 2) {
                let localZ = (ramp.rotY === 0) ? (pos.z - ramp.z) : (ramp.z - pos.z);
                let progress = (localZ + ramp.d / 2) / ramp.d;
                progress = Math.max(0, Math.min(1, progress));
                return progress * ramp.height;
            }
        }
        return 0;
    }
}
