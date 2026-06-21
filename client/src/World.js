// ============================================================================
// World.js — 3D Arena: ground, sky, walls, obstacles, trees, sand, pits,
//            river, wooden bridges, ramps. Supports 3 themed environments.
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

// Seeded pseudo-random number generator (Mulberry32)
// Returns a function that generates deterministic floats [0,1) from a seed.
function createSeededRng(seed) {
    let s = seed >>> 0;
    return function() {
        s += 0x6D2B79F5;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Theme definitions
const THEMES = {
    wasteland: {
        groundColor: '#5c4a2a', groundNoise: '#7a6035',
        skyTurbidity: 15, skyRayleigh: 0.5, skyElevation: 8, skyAzimuth: 210,
        fogColor: 0xd4874a, fogDensity: 0.006,
        ambientColor: 0xffddaa, sunColor: 0xff8833,
        riverColor: '#8a7040', riverEmissive: 0x0,
        groundLabel: 'wasteland'
    },
    toxic: {
        groundColor: '#2a3d1e', groundNoise: '#3a5228',
        skyTurbidity: 20, skyRayleigh: 1.0, skyElevation: 15, skyAzimuth: 90,
        fogColor: 0x4a6a2a, fogDensity: 0.007,
        ambientColor: 0xaaffaa, sunColor: 0x88cc44,
        riverColor: '#1a4a00', riverEmissive: 0x00ff44,
        groundLabel: 'toxic'
    },
    storm: {
        groundColor: '#2a2a2a', groundNoise: '#3d3d3d',
        skyTurbidity: 20, skyRayleigh: 0.2, skyElevation: 5, skyAzimuth: 270,
        fogColor: 0x3a3a4a, fogDensity: 0.01,
        ambientColor: 0x8888aa, sunColor: 0x5555aa,
        riverColor: '#0a0a0a', riverEmissive: 0x0,
        groundLabel: 'storm'
    }
};

export class World {
    constructor(scene, theme = 'wasteland', seed = 12345) {
        this.scene = scene;
        this.theme = THEMES[theme] || THEMES.wasteland;
        this.themeName = theme;
        this.rng = createSeededRng(seed);
        this.obstacles = [];
        this.pits = [];
        this.rivers = [];
        this.ramps = [];
        this._meshes = []; // track all added meshes for cleanup

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

    /** Tear down all world objects so a new world can be built */
    destroy() {
        // Remove all tracked objects from scene
        this._meshes.forEach(obj => {
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
        this._meshes = [];
        this.obstacles = [];
        this.pits = [];
        this.rivers = [];
        this.ramps = [];
        // Remove sky
        if (this.sky) this.scene.remove(this.sky);
        // Remove lights
        if (this._lights) this._lights.forEach(l => this.scene.remove(l));
        // Remove fog
        this.scene.fog = null;
    }

    /** Helper — add object to scene and track it */
    _add(obj) {
        this.scene.add(obj);
        this._meshes.push(obj);
        return obj;
    }

    // ========================================================================
    // Ground
    // ========================================================================

    _createGround() {
        const texture = this._createGroundTexture();
        const geo = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE);
        const mat = new THREE.MeshStandardMaterial({
            map: texture, bumpMap: texture, bumpScale: 0.15, roughness: 0.95, metalness: 0.05
        });
        const ground = new THREE.Mesh(geo, mat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(HALF, 0, HALF);
        ground.receiveShadow = true;
        this._add(ground);
    }

    _createGroundTexture() {
        const rng = this.rng;
        const t = this.theme;
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = t.groundColor;
        ctx.fillRect(0, 0, 512, 512);

        // Noise / cracks
        for (let i = 0; i < 8000; i++) {
            const x = rng() * 512, y = rng() * 512;
            const g = Math.floor(rng() * 20);
            ctx.fillStyle = t.groundNoise;
            ctx.globalAlpha = 0.3 + rng() * 0.4;
            ctx.fillRect(x, y, 1 + rng(), 1 + rng());
        }
        ctx.globalAlpha = 1;

        // Theme-specific surface detail
        if (this.themeName === 'wasteland') {
            // Cracked desert lines
            ctx.strokeStyle = 'rgba(30,20,5,0.5)'; ctx.lineWidth = 1;
            for (let i = 0; i < 40; i++) {
                ctx.beginPath();
                ctx.moveTo(rng() * 512, rng() * 512);
                ctx.lineTo(rng() * 512, rng() * 512);
                ctx.stroke();
            }
        } else if (this.themeName === 'toxic') {
            // Green puddles
            for (let i = 0; i < 20; i++) {
                const x = rng() * 512, y = rng() * 512;
                const r = 5 + rng() * 20;
                const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
                grad.addColorStop(0, 'rgba(50,180,0,0.4)');
                grad.addColorStop(1, 'rgba(50,180,0,0)');
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            }
        } else if (this.themeName === 'storm') {
            // Ash streaks
            ctx.strokeStyle = 'rgba(80,80,100,0.3)'; ctx.lineWidth = 2;
            for (let i = 0; i < 30; i++) {
                const sx = rng() * 512;
                ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx + (rng()-0.5)*40, 512); ctx.stroke();
            }
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
        const rng = this.rng;
        for (let i = 0; i < 10; i++) {
            const radius = 8 + rng() * 18;
            const x = 25 + rng() * (ARENA_SIZE - 50);
            const z = 25 + rng() * (ARENA_SIZE - 50);
            if (Math.abs(z - HALF) < 18) continue;

            const sandGeo = new THREE.CircleGeometry(radius, 32);
            const sandColor = new THREE.Color().setHSL(0.08 + rng() * 0.04, 0.35 + rng() * 0.15, 0.35 + rng() * 0.1);
            const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ color: sandColor, roughness: 0.95 }));
            sand.rotation.x = -Math.PI / 2;
            sand.position.set(x, 0.015, z);
            sand.receiveShadow = true;
            this._add(sand);

            const rockMat = new THREE.MeshStandardMaterial({ color: 0x666655, roughness: 0.9, metalness: 0.1 });
            for (let r = 0; r < Math.floor(3 + rng() * 5); r++) {
                const angle = rng() * Math.PI * 2;
                const dist = rng() * radius * 0.8;
                const rSize = 0.15 + rng() * 0.35;
                const rock = new THREE.Mesh(new THREE.SphereGeometry(rSize, 5, 4), rockMat);
                rock.position.set(x + Math.cos(angle) * dist, rSize * 0.4, z + Math.sin(angle) * dist);
                rock.scale.set(1, 0.5 + rng() * 0.3, 1);
                rock.castShadow = true;
                this._add(rock);
            }
        }
    }

    // ========================================================================
    // Trees
    // ========================================================================

    _createTrees() {
        const rng = this.rng;
        const isDead = (this.themeName === 'wasteland' || this.themeName === 'storm');

        for (let i = 0; i < TREE_COUNT; i++) {
            const x = 15 + rng() * (ARENA_SIZE - 30);
            const z = 15 + rng() * (ARENA_SIZE - 30);
            if (Math.abs(z - HALF) < 18) continue;

            let tooClose = false;
            for (const obs of this.obstacles) {
                const dx2 = x - obs.x, dz2 = z - obs.z;
                if (Math.sqrt(dx2 * dx2 + dz2 * dz2) < 8) { tooClose = true; break; }
            }
            if (tooClose) continue;

            const tree = new THREE.Group();
            const treeHeight = 3 + rng() * 3;
            const trunkRadius = 0.25 + rng() * 0.15;
            // Dead/dry trunk color
            const trunkHue = isDead ? 0.06 : 0.07;
            const trunkLightness = isDead ? 0.15 + rng() * 0.08 : 0.2 + rng() * 0.1;

            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(trunkRadius * 0.7, trunkRadius, treeHeight, 8),
                new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(trunkHue, 0.3, trunkLightness), roughness: 0.98 })
            );
            trunk.position.y = treeHeight / 2;
            trunk.castShadow = true;
            tree.add(trunk);

            if (isDead) {
                // Dead tree: sparse, bare branches
                const branchMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.98 });
                for (let b = 0; b < 4 + Math.floor(rng() * 4); b++) {
                    const bLen = 0.8 + rng() * 1.5;
                    const bGeo = new THREE.CylinderGeometry(0.04, 0.04, bLen, 4);
                    const branch = new THREE.Mesh(bGeo, branchMat);
                    branch.rotation.z = (rng() - 0.5) * Math.PI * 0.8;
                    branch.rotation.y = rng() * Math.PI * 2;
                    branch.position.set(0, treeHeight * (0.4 + rng() * 0.5), 0);
                    tree.add(branch);
                }
            } else {
                // Living pine tree with foliage
                const foliageH = this.themeName === 'toxic' ? 0.28 : (0.3 + rng() * 0.05);
                const foliageS = this.themeName === 'toxic' ? 0.9 : (0.5 + rng() * 0.2);
                const foliageL = this.themeName === 'toxic' ? 0.18 : (0.2 + rng() * 0.1);
                const foliageMat = new THREE.MeshStandardMaterial({
                    color: new THREE.Color().setHSL(foliageH, foliageS, foliageL), roughness: 0.9
                });
                const layers = 3 + Math.floor(rng() * 2);
                for (let l = 0; l < layers; l++) {
                    const r = 2.0 - (l * 0.4);
                    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 3.0, 7), foliageMat);
                    cone.position.set(0, treeHeight * 0.6 + (l * 1.5), 0);
                    const pos = cone.geometry.attributes.position;
                    for (let j = 0; j < pos.count; j++) {
                        if (pos.getY(j) > 0) continue;
                        pos.setX(j, pos.getX(j) * (0.85 + rng() * 0.3));
                        pos.setZ(j, pos.getZ(j) * (0.85 + rng() * 0.3));
                    }
                    cone.geometry.computeVertexNormals();
                    cone.castShadow = true;
                    tree.add(cone);
                }
            }

            tree.position.set(x, 0, z);
            this._add(tree);
            this.obstacles.push({ mesh: trunk, box: null, w: trunkRadius * 3, d: trunkRadius * 3, x, z });
        }
    }

    // ========================================================================
    // Pits
    // ========================================================================

    _createPits() {
        const rng = this.rng;
        for (let i = 0; i < PIT_COUNT; i++) {
            const x = 35 + rng() * (ARENA_SIZE - 70);
            const z = 35 + rng() * (ARENA_SIZE - 70);
            const radius = 3 + rng() * 2.5;
            if (Math.abs(z - HALF) < 20) continue;

            let tooClose = false;
            for (const obs of this.obstacles) {
                const dx2 = x - obs.x, dz2 = z - obs.z;
                if (Math.sqrt(dx2 * dx2 + dz2 * dz2) < radius + 6) { tooClose = true; break; }
            }
            if (tooClose) continue;

            const pit = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.8, 3, 24), new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1.0 }));
            pit.translateX(x).translateY(-1.5).translateZ(z);
            this._add(pit);

            const hole = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
            hole.rotation.x = -Math.PI / 2; hole.position.set(x, 0.02, z); this._add(hole);

            const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.15, radius + 0.4, 32), new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
            ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.03, z); this._add(ring);

            const outerRing = new THREE.Mesh(new THREE.RingGeometry(radius + 0.4, radius + 0.8, 32), new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
            outerRing.rotation.x = -Math.PI / 2; outerRing.position.set(x, 0.025, z); this._add(outerRing);

            const glowLight = new THREE.PointLight(0xff3300, 2, radius * 4);
            glowLight.position.set(x, -0.5, z); this._add(glowLight);

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
        const t = this.theme;
        const rng = this.rng;

        // Themed water texture
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createLinearGradient(0, 0, 256, 256);
        grad.addColorStop(0,   t.riverColor);
        grad.addColorStop(0.5, t.riverColor);
        grad.addColorStop(1,   t.riverColor);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);

        // Surface ripples
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 25; i++) {
            ctx.beginPath();
            ctx.arc(rng() * 256, rng() * 256, 4 + rng() * 12, 0, Math.PI * 2);
            ctx.stroke();
        }

        const waterTexture = new THREE.CanvasTexture(canvas);
        waterTexture.wrapS = THREE.RepeatWrapping;
        waterTexture.wrapT = THREE.RepeatWrapping;
        waterTexture.repeat.set(20, 2);
        this.waterTexture = waterTexture;

        // River bed
        const bedColor = this.themeName === 'storm' ? 0x050505 : (this.themeName === 'toxic' ? 0x0a2a00 : 0x2a4a5a);
        const bed = new THREE.Mesh(
            new THREE.BoxGeometry(ARENA_SIZE - 4, 1.5, riverWidth + 4),
            new THREE.MeshStandardMaterial({ color: bedColor, roughness: 0.9 })
        );
        bed.position.set(HALF, -0.75, riverZ);
        this._add(bed);

        // Water surface
        const waterColor = this.themeName === 'storm' ? 0x050505 : (this.themeName === 'toxic' ? 0x003300 : 0x003366);
        const waterMat = new THREE.MeshStandardMaterial({
            color: waterColor,
            transparent: true, opacity: 0.92,
            roughness: 0.05, metalness: 0.85,
            bumpMap: waterTexture, bumpScale: 0.04
        });
        if (this.themeName === 'toxic') {
            waterMat.emissive = new THREE.Color(0x004400);
            waterMat.emissiveIntensity = 0.4;
        }
        const water = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_SIZE - 4, riverWidth), waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.set(HALF, -0.08, riverZ);
        this._add(water);

        // Riverbank edges
        const bankColor = this.themeName === 'toxic' ? 0x2a3a1a : (this.themeName === 'storm' ? 0x2a2a2a : 0x6b5b3a);
        const bankMat = new THREE.MeshStandardMaterial({ color: bankColor, roughness: 0.85 });
        [-1, 1].forEach(side => {
            const bank = new THREE.Mesh(new THREE.BoxGeometry(ARENA_SIZE - 4, 0.5, 1.8), bankMat);
            bank.position.set(HALF, 0.05, riverZ + side * (hw + 0.6));
            bank.castShadow = true;
            this._add(bank);
        });

        // Add toxic glow light
        if (this.themeName === 'toxic') {
            const glow = new THREE.PointLight(0x00ff44, 1.5, riverWidth * 2);
            glow.position.set(HALF, 1, riverZ);
            this._add(glow);
        }

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
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a4a45, roughness: 0.95, metalness: 0.05 });
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });

        const configs = [
            { x: 40, z: 132, rotY: 0 },
            { x: 150, z: 168, rotY: Math.PI },
            { x: 260, z: 132, rotY: 0 }
        ];

        const rampW = 10, totalH = 4.0, totalD = 12; // made slightly wider

        configs.forEach(cfg => {
            const group = new THREE.Group();

            // Build Mountain Slope (Wedge with jagged terrain)
            // Using a BoxGeometry with segments so we can perturb the top vertices
            const geo = new THREE.BoxGeometry(rampW, totalH, totalD, 5, 1, 8);
            const pos = geo.attributes.position;
            
            for (let i = 0; i < pos.count; i++) {
                const y = pos.getY(i);
                const z = pos.getZ(i);
                const x = pos.getX(i);

                // Only perturb the top surface to form the slope
                if (y > 0) {
                    // z goes from -totalD/2 (back/bottom) to +totalD/2 (front/top)
                    const progress = (z + totalD / 2) / totalD;
                    
                    // Base height for the perfect slope
                    let newY = -totalH / 2 + progress * totalH;

                    // Add random noise to make it jagged like a mountain
                    // We avoid noise at the very front/back edges so it transitions smoothly
                    if (progress > 0.05 && progress < 0.95) {
                        newY += (Math.random() - 0.5) * 0.8;
                        
                        // Also add slight horizontal noise
                        if (Math.abs(x) < rampW / 2 - 0.1) {
                            pos.setX(i, x + (Math.random() - 0.5) * 0.5);
                        }
                    }

                    pos.setY(i, newY);
                }
            }
            geo.computeVertexNormals();

            const slope = new THREE.Mesh(geo, rockMat);
            slope.position.set(0, totalH / 2, 0);
            slope.castShadow = true;
            slope.receiveShadow = true;
            group.add(slope);

            // Caution stripe on top edge (front)
            const stripe = new THREE.Mesh(
                new THREE.BoxGeometry(rampW + 0.1, 0.08, 0.4),
                stripeMat
            );
            stripe.position.set(0, totalH + 0.04, totalD / 2 - 0.2);
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
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a4a45, roughness: 0.95, metalness: 0.05 });
        
        // Generate a rugged mountain range enclosing the arena
        for (let i = 0; i < 200; i++) {
            const isTopBottom = Math.random() > 0.5;
            let x, z;
            if (isTopBottom) {
                x = -20 + Math.random() * (ARENA_SIZE + 40);
                z = Math.random() > 0.5 ? -5 - Math.random() * 25 : ARENA_SIZE + 5 + Math.random() * 25;
            } else {
                x = Math.random() > 0.5 ? -5 - Math.random() * 25 : ARENA_SIZE + 5 + Math.random() * 25;
                z = -20 + Math.random() * (ARENA_SIZE + 40);
            }
            
            const radius = 12 + Math.random() * 30;
            const height = 25 + Math.random() * 50;
            const geo = new THREE.ConeGeometry(radius, height, 5 + Math.floor(Math.random() * 3));
            
            // Randomize vertices for jagged mountains
            const pos = geo.attributes.position;
            for (let j = 0; j < pos.count; j++) {
                if (pos.getY(j) > 0) continue; // Keep the peak intact
                pos.setX(j, pos.getX(j) * (0.7 + Math.random() * 0.6));
                pos.setZ(j, pos.getZ(j) * (0.7 + Math.random() * 0.6));
            }
            geo.computeVertexNormals();
            
            const mountain = new THREE.Mesh(geo, rockMat);
            mountain.position.set(x, height / 2 - 5, z);
            mountain.rotation.y = Math.random() * Math.PI;
            mountain.castShadow = true;
            mountain.receiveShadow = true;
            this.scene.add(mountain);
        }
    }

    // ========================================================================
    // Obstacles
    // ========================================================================

    _createObstacles() {
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x666660, roughness: 0.95, metalness: 0.05 });

        for (let i = 0; i < OBSTACLE_COUNT; i++) {
            const radius = 1.5 + Math.random() * 2.5;
            const x = 30 + Math.random() * (ARENA_SIZE - 60);
            const z = 30 + Math.random() * (ARENA_SIZE - 60);
            if (Math.abs(z - HALF) < 15) continue;

            const geo = new THREE.DodecahedronGeometry(radius, 1);
            // Add noise to make it look like a natural boulder
            const pos = geo.attributes.position;
            for (let j = 0; j < pos.count; j++) {
                pos.setXYZ(
                    j,
                    pos.getX(j) * (0.8 + Math.random() * 0.4),
                    pos.getY(j) * (0.8 + Math.random() * 0.4),
                    pos.getZ(j) * (0.8 + Math.random() * 0.4)
                );
            }
            geo.computeVertexNormals();

            const mesh = new THREE.Mesh(geo, rockMat);
            mesh.position.set(x, radius * 0.5, z);
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
            mesh.castShadow = true; mesh.receiveShadow = true;
            this.scene.add(mesh);

            // Keep the physical bounding box for collision detection
            this.obstacles.push({ mesh: null, box: null, w: radius * 1.8, d: radius * 1.8, x, z });
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
        const t = this.theme;

        const uniforms = this.sky.material.uniforms;
        uniforms['turbidity'].value    = t.skyTurbidity;
        uniforms['rayleigh'].value     = t.skyRayleigh;
        uniforms['mieCoefficient'].value   = 0.005;
        uniforms['mieDirectionalG'].value  = 0.8;

        const phi   = THREE.MathUtils.degToRad(90 - t.skyElevation);
        const theta = THREE.MathUtils.degToRad(t.skyAzimuth);
        this.sunPosition.setFromSphericalCoords(1, phi, theta);
        uniforms['sunPosition'].value.copy(this.sunPosition);
    }

    // ========================================================================
    // Lighting & Fog
    // ========================================================================

    _setupLighting() {
        this._lights = [];
        const t = this.theme;
        const amb = new THREE.AmbientLight(t.ambientColor, 0.5);
        this.scene.add(amb); this._lights.push(amb);

        const hemi = new THREE.HemisphereLight(t.ambientColor, 0x222222, 0.4);
        this.scene.add(hemi); this._lights.push(hemi);

        const sun = new THREE.DirectionalLight(t.sunColor, 2.0);
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
        this._lights.push(sun); this._lights.push(sun.target);
    }

    _setupFog() {
        this.scene.fog = new THREE.FogExp2(this.theme.fogColor, this.theme.fogDensity);
    }

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
