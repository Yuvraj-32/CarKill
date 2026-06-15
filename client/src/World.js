// ============================================================================
// World.js — 3D Arena: ground, sky, walls, obstacles, trees, sand, pits,
//            river, ramps, bridges
// Arena: 300×300 units (maps to server's 3000×3000 ÷ 10)
// ============================================================================
import * as THREE from 'three';

export const ARENA_SIZE = 300;
const HALF = ARENA_SIZE / 2;
const WALL_HEIGHT = 4;
const OBSTACLE_COUNT = 14;
const TREE_COUNT = 30;
const PIT_COUNT = 5;

export class World {
    constructor(scene) {
        this.scene = scene;
        this.obstacles = []; // { mesh, box3, w, d, x, z }
        this.pits = [];      // { x, z, radius }
        this.rivers = [];    // { x1, z1, x2, z2, halfWidth }
        this.ramps = [];     // { x, z, w, d, height, angle }

        this._createGround();
        this._createSandPatches();
        this._createWalls();
        this._createObstacles();
        this._createTrees();
        this._createPits();
        this._createRiver();
        this._createRamps();
        this._createBridges();
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

            const sandGeo = new THREE.CircleGeometry(radius, 32);
            const sandColor = new THREE.Color().setHSL(
                0.08 + Math.random() * 0.04,
                0.35 + Math.random() * 0.15,
                0.45 + Math.random() * 0.1
            );
            const sandMat = new THREE.MeshStandardMaterial({
                color: sandColor, roughness: 0.95, metalness: 0.0
            });
            const sand = new THREE.Mesh(sandGeo, sandMat);
            sand.rotation.x = -Math.PI / 2;
            sand.position.set(x, 0.015, z);
            sand.receiveShadow = true;
            this.scene.add(sand);

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

            // Skip if too close to river path (z ≈ HALF area)
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

            const foliageColor = new THREE.Color().setHSL(
                0.28 + Math.random() * 0.08,
                0.55 + Math.random() * 0.2,
                0.25 + Math.random() * 0.15
            );
            const foliageMat = new THREE.MeshStandardMaterial({
                color: foliageColor, roughness: 0.85
            });

            const foliageBase = treeHeight * 0.75;
            const foliageR = 1.2 + Math.random() * 1.0;

            const f1 = new THREE.Mesh(new THREE.SphereGeometry(foliageR, 8, 7), foliageMat);
            f1.position.set(0, foliageBase + foliageR * 0.3, 0);
            f1.castShadow = true;
            tree.add(f1);

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

            const fTop = new THREE.Mesh(
                new THREE.SphereGeometry(foliageR * 0.6, 7, 6), foliageMat
            );
            fTop.position.set(0, foliageBase + foliageR * 0.9, 0);
            fTop.castShadow = true;
            tree.add(fTop);

            tree.position.set(x, 0, z);
            this.scene.add(tree);

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

            // Skip if near river
            if (Math.abs(z - HALF) < 20) continue;

            let tooClose = false;
            for (const obs of this.obstacles) {
                const dx2 = x - obs.x, dz2 = z - obs.z;
                if (Math.sqrt(dx2 * dx2 + dz2 * dz2) < radius + 6) { tooClose = true; break; }
            }
            if (tooClose) continue;

            const pitGeo = new THREE.CylinderGeometry(radius, radius * 0.8, 3, 24);
            const pitMat = new THREE.MeshStandardMaterial({
                color: 0x080808, roughness: 1.0, metalness: 0
            });
            const pit = new THREE.Mesh(pitGeo, pitMat);
            pit.position.set(x, -1.5, z);
            this.scene.add(pit);

            const holeGeo = new THREE.CircleGeometry(radius, 32);
            const holeMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
            const hole = new THREE.Mesh(holeGeo, holeMat);
            hole.rotation.x = -Math.PI / 2;
            hole.position.set(x, 0.02, z);
            this.scene.add(hole);

            const ringGeo = new THREE.RingGeometry(radius - 0.15, radius + 0.4, 32);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0xff4400, transparent: true, opacity: 0.55,
                side: THREE.DoubleSide
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(x, 0.03, z);
            this.scene.add(ring);

            const outerRingGeo = new THREE.RingGeometry(radius + 0.4, radius + 0.8, 32);
            const outerRingMat = new THREE.MeshBasicMaterial({
                color: 0xff8800, transparent: true, opacity: 0.25,
                side: THREE.DoubleSide
            });
            const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
            outerRing.rotation.x = -Math.PI / 2;
            outerRing.position.set(x, 0.025, z);
            this.scene.add(outerRing);

            const glowLight = new THREE.PointLight(0xff3300, 2, radius * 4);
            glowLight.position.set(x, -0.5, z);
            this.scene.add(glowLight);

            this.pits.push({ x, z, radius: radius * 0.85 });
        }
    }

    // ========================================================================
    // River — flowing water strip across the arena (death zone)
    // ========================================================================

    _createRiver() {
        const riverWidth = 12;
        const hw = riverWidth / 2;
        const riverZ = HALF; // runs east-west through center

        // Animated water texture
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Base water color with wave pattern
        const grad = ctx.createLinearGradient(0, 0, 256, 256);
        grad.addColorStop(0, '#0a4a7a');
        grad.addColorStop(0.3, '#0d6eaa');
        grad.addColorStop(0.5, '#1188cc');
        grad.addColorStop(0.7, '#0d6eaa');
        grad.addColorStop(1, '#0a4a7a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);

        // Ripples
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.3)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 20; i++) {
            ctx.beginPath();
            ctx.arc(Math.random() * 256, Math.random() * 256, 5 + Math.random() * 15, 0, Math.PI * 2);
            ctx.stroke();
        }
        // Highlights
        ctx.fillStyle = 'rgba(180, 230, 255, 0.15)';
        for (let i = 0; i < 50; i++) {
            ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 8, 1);
        }

        const waterTexture = new THREE.CanvasTexture(canvas);
        waterTexture.wrapS = THREE.RepeatWrapping;
        waterTexture.wrapT = THREE.RepeatWrapping;
        waterTexture.repeat.set(20, 2);
        this.waterTexture = waterTexture;

        // River bed (dark depression)
        const bedGeo = new THREE.BoxGeometry(ARENA_SIZE - 4, 1.5, riverWidth + 4);
        const bedMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a0a, roughness: 1.0
        });
        const bed = new THREE.Mesh(bedGeo, bedMat);
        bed.position.set(HALF, -0.75, riverZ);
        this.scene.add(bed);

        // Water surface
        const waterGeo = new THREE.PlaneGeometry(ARENA_SIZE - 4, riverWidth);
        const waterMat = new THREE.MeshStandardMaterial({
            map: waterTexture,
            color: 0x2299dd,
            transparent: true,
            opacity: 0.8,
            roughness: 0.1,
            metalness: 0.6
        });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.set(HALF, -0.1, riverZ);
        this.scene.add(water);

        // Riverbank edges (earth/rock on both sides)
        const bankMat = new THREE.MeshStandardMaterial({
            color: 0x5a4a2a, roughness: 0.9
        });
        [-1, 1].forEach(side => {
            const bankGeo = new THREE.BoxGeometry(ARENA_SIZE - 4, 0.4, 1.5);
            const bank = new THREE.Mesh(bankGeo, bankMat);
            bank.position.set(HALF, 0.05, riverZ + side * (hw + 0.5));
            bank.castShadow = true;
            this.scene.add(bank);
        });

        // Glow from water
        for (let i = 0; i < 5; i++) {
            const light = new THREE.PointLight(0x0088cc, 0.5, 30);
            light.position.set(30 + i * 60, -0.3, riverZ);
            this.scene.add(light);
        }

        // Register river as a rectangular death zone
        this.rivers.push({
            x1: 2, x2: ARENA_SIZE - 2,
            z1: riverZ - hw, z2: riverZ + hw
        });
    }

    // ========================================================================
    // Ramps — angled surfaces that launch vehicles
    // ========================================================================

    _createRamps() {
        const rampMat = new THREE.MeshStandardMaterial({
            color: 0x666677, roughness: 0.6, metalness: 0.3
        });
        const stripeMat = new THREE.MeshBasicMaterial({
            color: 0xffcc00, transparent: true, opacity: 0.7
        });

        const rampConfigs = [
            { x: 60, z: 60, rot: 0, w: 6, d: 10, h: 2.5 },
            { x: 240, z: 60, rot: Math.PI, w: 6, d: 10, h: 2.5 },
            { x: 60, z: 240, rot: 0, w: 6, d: 10, h: 2.5 },
            { x: 240, z: 240, rot: Math.PI, w: 6, d: 10, h: 2.5 },
            { x: 150, z: 80, rot: Math.PI / 2, w: 8, d: 12, h: 3 },
            { x: 150, z: 220, rot: -Math.PI / 2, w: 8, d: 12, h: 3 },
        ];

        rampConfigs.forEach(cfg => {
            const rampGroup = new THREE.Group();

            // Ramp surface — wedge shape using custom geometry
            const shape = new THREE.Shape();
            shape.moveTo(-cfg.d / 2, 0);
            shape.lineTo(cfg.d / 2, 0);
            shape.lineTo(cfg.d / 2, cfg.h);
            shape.lineTo(-cfg.d / 2, 0);

            const extrudeSettings = { depth: cfg.w, bevelEnabled: false };
            const rampGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            const ramp = new THREE.Mesh(rampGeo, rampMat);
            ramp.rotation.y = Math.PI / 2;
            ramp.position.set(-cfg.w / 2, 0, 0);
            ramp.castShadow = true;
            ramp.receiveShadow = true;
            rampGroup.add(ramp);

            // Caution stripes on top edge
            const stripeGeo = new THREE.BoxGeometry(cfg.w - 0.5, 0.06, 0.5);
            const stripe = new THREE.Mesh(stripeGeo, stripeMat);
            stripe.position.set(0, cfg.h - 0.1, cfg.d / 2 - 0.5);
            rampGroup.add(stripe);

            // Arrow markers on the slope
            for (let a = 0; a < 3; a++) {
                const arrowGeo = new THREE.ConeGeometry(0.3, 0.8, 3);
                const arrowMat = new THREE.MeshBasicMaterial({
                    color: 0xffcc00, transparent: true, opacity: 0.5
                });
                const arrow = new THREE.Mesh(arrowGeo, arrowMat);
                const t = (a + 1) / 4;
                arrow.position.set(0, cfg.h * t - 0.2, cfg.d * (0.5 - t));
                arrow.rotation.x = -Math.PI * 0.35;
                rampGroup.add(arrow);
            }

            rampGroup.rotation.y = cfg.rot;
            rampGroup.position.set(cfg.x, 0, cfg.z);
            this.scene.add(rampGroup);

            // Register ramp for physics (boost zone)
            this.ramps.push({
                x: cfg.x, z: cfg.z,
                w: cfg.d, d: cfg.w,  // rotated dims
                height: cfg.h,
                angle: cfg.rot
            });

            // Also add as obstacle to prevent driving through the base
            this.obstacles.push({
                mesh: ramp, box: null,
                w: cfg.d * 0.3, d: cfg.w * 0.3,
                x: cfg.x, z: cfg.z
            });
        });
    }

    // ========================================================================
    // Bridges — elevated paths over the river
    // ========================================================================

    _createBridges() {
        const bridgeMat = new THREE.MeshStandardMaterial({
            color: 0x8B7355, roughness: 0.8, metalness: 0.2
        });
        const railMat = new THREE.MeshStandardMaterial({
            color: 0x666666, metalness: 0.5, roughness: 0.4
        });

        // Two bridges crossing the river
        const bridgeConfigs = [
            { x: 80, w: 10 },
            { x: 220, w: 10 },
        ];

        const riverZ = HALF;
        const bridgeLength = 24; // longer than river to overlap banks

        bridgeConfigs.forEach(cfg => {
            const group = new THREE.Group();

            // Bridge deck
            const deckGeo = new THREE.BoxGeometry(cfg.w, 0.4, bridgeLength);
            const deck = new THREE.Mesh(deckGeo, bridgeMat);
            deck.position.set(0, 0.6, 0);
            deck.castShadow = true;
            deck.receiveShadow = true;
            group.add(deck);

            // Road surface (darker asphalt on top)
            const roadGeo = new THREE.BoxGeometry(cfg.w - 0.5, 0.05, bridgeLength - 0.5);
            const roadMat = new THREE.MeshStandardMaterial({
                color: 0x333340, roughness: 0.9
            });
            const road = new THREE.Mesh(roadGeo, roadMat);
            road.position.set(0, 0.83, 0);
            group.add(road);

            // Center line
            const lineGeo = new THREE.BoxGeometry(0.2, 0.02, bridgeLength - 2);
            const lineMat = new THREE.MeshBasicMaterial({
                color: 0xffcc00, transparent: true, opacity: 0.6
            });
            const centerLine = new THREE.Mesh(lineGeo, lineMat);
            centerLine.position.set(0, 0.86, 0);
            group.add(centerLine);

            // Railings on both sides
            [-1, 1].forEach(side => {
                // Horizontal top rail
                const topRailGeo = new THREE.BoxGeometry(0.1, 0.1, bridgeLength);
                const topRail = new THREE.Mesh(topRailGeo, railMat);
                topRail.position.set(side * (cfg.w / 2 - 0.1), 1.6, 0);
                topRail.castShadow = true;
                group.add(topRail);

                // Vertical posts
                for (let p = -5; p <= 5; p++) {
                    const postGeo = new THREE.BoxGeometry(0.1, 0.8, 0.1);
                    const post = new THREE.Mesh(postGeo, railMat);
                    post.position.set(side * (cfg.w / 2 - 0.1), 1.2, p * 2.2);
                    group.add(post);
                }
            });

            // Support pillars under bridge
            [-1, 1].forEach(pSide => {
                const pillarGeo = new THREE.BoxGeometry(1.2, 2.0, 1.2);
                const pillar = new THREE.Mesh(pillarGeo, new THREE.MeshStandardMaterial({
                    color: 0x777766, roughness: 0.8
                }));
                pillar.position.set(0, -0.4, pSide * 5);
                pillar.castShadow = true;
                group.add(pillar);
            });

            group.position.set(cfg.x, 0, riverZ);
            this.scene.add(group);
        });
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
            let x = margin + Math.random() * (ARENA_SIZE - margin * 2);
            let z = margin + Math.random() * (ARENA_SIZE - margin * 2);

            // Skip if too close to river
            if (Math.abs(z - HALF) < 15) continue;

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
    // Animate (called each frame by Game.js)
    // ========================================================================

    update(delta) {
        // Animate water texture scroll
        if (this.waterTexture) {
            this.waterTexture.offset.x += delta * 0.15;
        }
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
            if (dist < pit.radius) return pit;
        }
        return null;
    }

    /** Check if a position is inside the river (not on a bridge). Returns true/false. */
    checkRiverCollision(pos) {
        for (const r of this.rivers) {
            if (pos.x >= r.x1 && pos.x <= r.x2 && pos.z >= r.z1 && pos.z <= r.z2) {
                // Check if on a bridge (bridge at x=80 or x=220, width 10)
                if (Math.abs(pos.x - 80) < 6 || Math.abs(pos.x - 220) < 6) {
                    return false; // on a bridge, safe
                }
                return true; // in river!
            }
        }
        return false;
    }

    /** Check if on a ramp — returns boost height or 0 */
    checkRamp(pos) {
        for (const ramp of this.ramps) {
            const dx = Math.abs(pos.x - ramp.x);
            const dz = Math.abs(pos.z - ramp.z);
            if (dx < ramp.w / 2 && dz < ramp.d / 2) {
                return ramp.height;
            }
        }
        return 0;
    }
}
