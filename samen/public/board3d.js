// Isometric 3D world for Samen, drawn with three.js. The rules live in
// game.js; this turns area views (Samen.view) into one continuous world:
// the areas sit side by side, joined by little bridges, and the camera
// glides along as the players walk from one area into the next.
import * as THREE from './vendor/three.module.min.js';
import * as TEX from './textures.js';

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

const THEMES = {
  tuin: { floorA: 0xf3f8e6, floorB: 0xe6f1d2, wall: 0x6dbb72, top: 0x8bd48f },
  ijs: { floorA: 0xf4f8ff, floorB: 0xe6eefb, wall: 0x86afe0, top: 0xb4d2f5 },
  grot: { floorA: 0xf0e4d4, floorB: 0xe5d6c2, wall: 0x8a7464, top: 0xa48e7b },
  meer: { floorA: 0xfff3dd, floorB: 0xf7e5c6, wall: 0x4f9fb8, top: 0x72bcd2 },
  kasteel: { floorA: 0xeeeaf2, floorB: 0xe2dcea, wall: 0x8b8798, top: 0xa9a5b8 },
  hart: { floorA: 0xfff0f4, floorB: 0xfde1ea, wall: 0xc45c8a, top: 0xe07ba8 },
};
const COLORS = {
  ice: 0xcdeaff, water: 0x4aa8e0, bridge: 0xb07a45, crack: 0x8a6d55, hole: 0x2a1d40,
  crate: 0xc98b52, crateEdge: 0x8f5d30, heart: 0xff4d6d, gold: 0xf5c242, steel: 0x8d8fa3,
  mini: 0xff6f91, maxi: 0xffb84d, eye: 0x3d2b52, cheek: 0xff8fa8,
  a: 0xff5fa2, b: 0x3cb4ff, c: 0x9b6bff, d: 0x2fc46b, u: 0xff9f43, v: 0x1dd1a1,
};

const WALL_H = 0.55;
const GAP = 3; // tiles of bridge between two areas
const STEP_MS = 170;

function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.35);
  s.bezierCurveTo(-0.05, -0.25, -0.5, -0.05, -0.5, 0.18);
  s.bezierCurveTo(-0.5, 0.42, -0.22, 0.5, 0, 0.3);
  s.bezierCurveTo(0.22, 0.5, 0.5, 0.42, 0.5, 0.18);
  s.bezierCurveTo(0.5, -0.05, 0.05, -0.25, 0, -0.35);
  return s;
}

// Reflections of a soft studio light, only for shiny things (ice, water,
// gold, glossy hearts and buttons). On everything else it would wash the
// colours out.
let ENV = null;
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
const shiny = (extra = {}) => ({ envMap: ENV, envMapIntensity: 1, ...extra });
// A material painted with a procedural texture that is also its bump map.
const texMat = (tex, extra = {}) => mat(0xffffff, { map: tex.map, bumpMap: tex.bump, bumpScale: 1.5, ...extra });

function face(group, frontZ, eyeY, spread, scale = 1) {
  const eyeMat = mat(COLORS.eye, { roughness: 0.4 });
  const cheekMat = mat(COLORS.cheek, { roughness: 0.9 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045 * scale, 12, 12), eyeMat);
    eye.position.set(side * spread, eyeY, frontZ);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.045 * scale, 12, 12), cheekMat);
    cheek.scale.set(1.3, 0.7, 0.4);
    cheek.position.set(side * spread * 1.6, eyeY - 0.08 * scale, frontZ - 0.01);
    group.add(eye, cheek);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.06 * scale, 0.014 * scale, 8, 16, Math.PI), eyeMat);
  smile.rotation.z = Math.PI;
  smile.position.set(0, eyeY - 0.07 * scale, frontZ + 0.005);
  group.add(smile);
}

function makeMini() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 24), mat(COLORS.mini, { roughness: 0.45 }));
  body.position.y = 0.28;
  body.castShadow = true;
  g.add(body);
  face(g, 0.265, 0.33, 0.09);
  return g;
}

function makeMaxi() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.74, 0.66, 2, 2, 2), mat(COLORS.maxi, { roughness: 0.5 }));
  body.position.y = 0.37;
  body.castShadow = true;
  g.add(body);
  face(g, 0.335, 0.47, 0.12, 1.3);
  return g;
}

function makeCrate() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.76, 0.76), texMat(TEX.crateTex(), { roughness: 0.75, bumpScale: 3 }));
  box.position.y = 0.38;
  box.castShadow = true;
  box.receiveShadow = true;
  g.add(box);
  return g;
}

function makeKey() {
  const g = new THREE.Group();
  const gold = mat(COLORS.gold, shiny({ metalness: 0.85, roughness: 0.22, emissive: COLORS.gold, emissiveIntensity: 0.1 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 10, 24), gold);
  ring.position.x = -0.14;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.06), gold);
  shaft.position.x = 0.08;
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.06), gold);
  bit.position.set(0.19, -0.06, 0);
  g.add(ring, shaft, bit);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

export function createBoard3D(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  ENV = TEX.environment(renderer);
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xfff6ee, 0xb59ad8, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.002;
  scene.add(sun, sun.target);

  const AREAS = window.Samen.AREAS;
  const size = (i) => ({ w: AREAS[i].map[0].length, h: AREAS[i].map.length });
  const offsets = [];
  AREAS.forEach((_, i) => { offsets[i] = i ? offsets[i - 1] + size(i - 1).w + GAP : 0; });
  const toWorld = (level, [r, c]) => new THREE.Vector3(offsets[level] + c, 0, r - (size(level).h - 1) / 2);

  const groups = new Map(); // level -> { group, live }
  let live = null;          // dynamic parts of the current area
  let current = -1;
  let you = -1;

  // The two characters walk through the whole world, outside any area.
  const players = [makeMini(), makeMaxi()].map((obj) => {
    obj.rotation.y = Math.PI / 4; // face the camera
    scene.add(obj);
    return { obj, path: [obj.position.clone()], t0: 0, dur: 1, hop: 0, shake: 0 };
  });
  players[0].hopHeight = 0.28;
  players[1].hopHeight = 0.18;
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 16), mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.4 }));
  marker.rotation.x = Math.PI;
  scene.add(marker);

  const DIR = new THREE.Vector3(1, 1.15, 1).normalize();
  const VIEW = new THREE.Matrix4().lookAt(DIR, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)).invert();
  const cam = { target: new THREE.Vector3(), hw: 6, hh: 6, goal: { target: new THREE.Vector3(), hw: 6, hh: 6 }, aspect: 1 };

  // Half width/height on screen of an area seen from the camera direction.
  function fit(level) {
    const { w, h } = size(level);
    let hw = 0, hh = 0;
    for (const x of [-w / 2, w / 2]) for (const z of [-h / 2, h / 2]) for (const y of [-0.2, 1]) {
      const v = new THREE.Vector3(x, y, z).applyMatrix4(VIEW);
      hw = Math.max(hw, Math.abs(v.x));
      hh = Math.max(hh, Math.abs(v.y));
    }
    return { hw: hw + 0.4, hh: hh + 0.4 };
  }

  function dispose(group) {
    scene.remove(group);
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) m.dispose();
    });
  }

  // Builds an area's diorama from a view. With `dynamic` it also returns
  // the parts that change while playing (doors, buttons, crates, ...).
  function buildArea(level, g, dynamic) {
    const group = new THREE.Group();
    group.position.set(offsets[level], 0, -(g.tiles.length - 1) / 2);
    const zone = THEMES[AREAS[level].zone] ? AREAS[level].zone : 'tuin';
    const parts = { doors: [], plates: [], tunnels: [], hearts: [], water: [], keys: [], locks: [], levers: [], crates: [] };
    const tile = (r, c) => g.tiles[r] && g.tiles[r][c];
    const open = (t) => t && t !== '#' && t !== 'o';

    const floorGeo = new THREE.BoxGeometry(0.98, 0.2, 0.98);
    const floorMats = [0, 1].map((v) => texMat(TEX.floorTex(zone, v), { roughness: 0.92 }));
    const crackedMat = texMat(TEX.crackedTex(zone), { roughness: 0.95, bumpScale: 3 });
    const wallGeo = new THREE.BoxGeometry(1, WALL_H, 1);
    const side = texMat(TEX.wallTex(zone, false), { roughness: 0.8, bumpScale: 2.5 });
    const top = texMat(TEX.wallTex(zone, true), { roughness: 0.75, bumpScale: 2 });
    const wallMat = [side, side, top, side, side, side]; // box faces: +x -x +y -y +z -z
    const iceMat = texMat(TEX.iceTex(), shiny({ color: 0xcfe6ff, roughness: 0.08, bumpScale: 0.3, envMapIntensity: 0.35 }));
    const plankMat = texMat(TEX.plankTex(), { roughness: 0.8, bumpScale: 2 });
    const waterMat = texMat(TEX.waterTex(), shiny({ roughness: 0.1, transparent: true, opacity: 0.9, bumpScale: 0.5, envMapIntensity: 0.7 }));

    const add = (mesh, r, c, y) => { mesh.position.set(c, y, r); group.add(mesh); return mesh; };

    g.tiles.forEach((row, r) => row.forEach((t, c) => {
      if (t === '#') {
        const near = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]
          .some(([dr, dc]) => open(tile(r + dr, c + dc)) || tile(r + dr, c + dc) === 'o');
        if (!near) return;
        const wall = add(new THREE.Mesh(wallGeo, wallMat), r, c, WALL_H / 2 - 0.2);
        wall.castShadow = true; wall.receiveShadow = true;
        return;
      }
      if (t === '~' || t === '=') {
        const water = add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 1), waterMat), r, c, -0.16);
        const plank = add(new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.2, 0.92), plankMat), r, c, -0.1);
        plank.receiveShadow = true;
        plank.visible = t === '=';
        parts.water.push({ r, c, water, plank });
        return;
      }
      const floorMat = t === '_' ? iceMat : t === 'x' ? crackedMat : floorMats[(r + c) % 2];
      const floor = add(new THREE.Mesh(floorGeo, floorMat), r, c, t === 'x' ? -0.12 : -0.1);
      floor.receiveShadow = true;

      if (t === 'o') {
        const along = open(tile(r, c - 1)) || open(tile(r, c + 1)) ? 'x' : 'z';
        const block = add(new THREE.Mesh(new THREE.BoxGeometry(1, WALL_H, 1), texMat(TEX.wallTex(zone, false), { transparent: true, bumpScale: 2.5 })), r, c, WALL_H / 2 - 0.18);
        block.castShadow = true;
        add(new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? 1.02 : 0.46, 0.34, along === 'x' ? 0.46 : 1.02), mat(COLORS.hole, { roughness: 1 })), r, c, 0.17);
        parts.tunnels.push({ mesh: block, r, c });
      } else if (/^[a-d]$/.test(t)) {
        const plateTop = texMat(TEX.plateTex(COLORS[t]), shiny({ roughness: 0.25, bumpScale: 1, emissive: COLORS[t], emissiveIntensity: 0, envMapIntensity: 0.5 }));
        const plate = add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.1, 32), [mat(COLORS[t], { roughness: 0.4 }), plateTop, plateTop]), r, c, 0.05);
        plate.receiveShadow = true;
        parts.plates.push({ mesh: plate, r, c });
      } else if (/^[A-D]\+?$/.test(t)) {
        const color = COLORS[t[0].toLowerCase()];
        add(new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.03, 0.94), mat(color, { transparent: true, opacity: 0.55 })), r, c, 0.015);
        const door = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, WALL_H + 0.1, 0.9), texMat(TEX.doorTex(color), shiny({ roughness: 0.35, bumpScale: 1.5, envMapIntensity: 0.4 }))), r, c, (WALL_H + 0.1) / 2);
        door.castShadow = true;
        parts.doors.push({ mesh: door, r, c, y: door.position.y, open: t.endsWith('+') });
      } else if (/^[UV][01]$/.test(t)) {
        // Gate: a row of bars that sinks into the floor when open.
        const bars = new THREE.Group();
        const barMat = mat(COLORS[t[0].toLowerCase()], { metalness: 0.4, roughness: 0.4 });
        for (let i = -2; i <= 2; i++) {
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, WALL_H + 0.1, 10), barMat);
          bar.position.set(i * 0.18, (WALL_H + 0.1) / 2, 0);
          bar.castShadow = true;
          bars.add(bar);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.12), barMat);
        beam.position.y = WALL_H + 0.08;
        bars.add(beam);
        if (open(tile(r - 1, c)) || open(tile(r + 1, c))) bars.rotation.y = 0; else bars.rotation.y = Math.PI / 2;
        add(bars, r, c, 0);
        parts.doors.push({ mesh: bars, r, c, y: 0, open: t[1] === '1' });
      } else if (/^[uv][01]$/.test(t)) {
        const base = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 20), mat(COLORS.steel)), r, c, 0.04);
        base.receiveShadow = true;
        const stick = new THREE.Group();
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8), mat(COLORS.steel, { metalness: 0.5 }));
        rod.position.y = 0.21;
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), mat(COLORS[t[0]], { emissive: COLORS[t[0]], emissiveIntensity: 0.2 }));
        knob.position.y = 0.42;
        stick.add(rod, knob);
        stick.traverse((o) => { o.castShadow = true; });
        add(stick, r, c, 0.06);
        parts.levers.push({ stick, r, c, on: t[1] === '1' });
      } else if (t === 'k') {
        const key = add(makeKey(), r, c, 0.4);
        parts.keys.push({ mesh: key, r, c });
      } else if (t === 'K' || t === 'K+') {
        const lock = new THREE.Group();
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, WALL_H + 0.1, 0.9), texMat(TEX.lockDoorTex(), { roughness: 0.75, bumpScale: 2.5 }));
        door.position.y = (WALL_H + 0.1) / 2;
        door.castShadow = true;
        const padlock = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.1), mat(COLORS.gold, { metalness: 0.6, roughness: 0.3 }));
        padlock.position.set(0, 0.32, 0.47);
        const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 16, Math.PI), mat(COLORS.steel, { metalness: 0.6 }));
        shackle.position.set(0, 0.44, 0.47);
        lock.add(door, padlock, shackle);
        add(lock, r, c, 0);
        parts.locks.push({ mesh: lock, r, c, open: t === 'K+' });
      } else if (t === 'E') {
        const heart = add(new THREE.Mesh(
          new THREE.ExtrudeGeometry(heartShape(), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 16 }),
          new THREE.MeshPhysicalMaterial(shiny({ color: COLORS.heart, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1, emissive: COLORS.heart, emissiveIntensity: 0.12, envMapIntensity: 0.8 })),
        ), r, c, 0.48);
        heart.geometry.center();
        heart.scale.setScalar(0.78);
        heart.castShadow = true;
        const glow = add(new THREE.Mesh(new THREE.CircleGeometry(0.36, 32), new THREE.MeshBasicMaterial({ color: 0xffb3c1, transparent: true, opacity: 0.7 })), r, c, 0.005);
        glow.rotation.x = -Math.PI / 2;
        parts.hearts.push(heart);
      }
    }));

    // A small bridge towards the next area, at the middle row.
    if (level + 1 < AREAS.length) {
      const midZ = (g.tiles.length - 1) / 2;
      for (let i = 0; i < GAP; i++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.14, 0.7), plankMat);
        plank.position.set(g.tiles[0].length + i, -0.12, midZ);
        plank.receiveShadow = true;
        group.add(plank);
      }
    }

    g.boxes.forEach((b) => {
      const crate = makeCrate();
      if (b) crate.position.set(b[1], 0, b[0]); else crate.visible = false;
      group.add(crate);
      parts.crates.push({ obj: crate, path: [crate.position.clone()], t0: 0, dur: 1 });
    });

    scene.add(group);
    return { group, parts: dynamic ? parts : null, height: g.tiles.length };
  }

  function setLevel(g) {
    // Keep the area we came from (as it was left), the new one live, and a
    // preview of the next one; let everything further away go.
    for (const [lvl, entry] of groups) {
      if (lvl === g.level || Math.abs(lvl - g.level) > 1) { dispose(entry.group); groups.delete(lvl); }
    }
    groups.set(g.level, buildArea(g.level, g, true));
    live = groups.get(g.level).parts;
    if (g.level + 1 < AREAS.length && !groups.has(g.level + 1)) {
      groups.set(g.level + 1, buildArea(g.level + 1, window.Samen.preview(g.level + 1), false));
    }
    const { w, h } = size(g.level);
    cam.goal.target.set(offsets[g.level] + (w - 1) / 2, 0, 0);
    Object.assign(cam.goal, fit(g.level));
    sun.position.set(cam.goal.target.x - w * 0.3, 10, -h * 0.2);
    sun.target.position.copy(cam.goal.target);
    const half = Math.max(w, h) / 2 + 2;
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half });
    sun.shadow.camera.updateProjectionMatrix();
  }

  function walk(m, points, dur, hop) {
    m.path = [m.obj.position.clone(), ...points];
    m.t0 = performance.now();
    m.dur = dur;
    m.hop = hop;
  }

  function update(g, me) {
    you = me;
    const travelling = current >= 0 && g.level === current + 1;
    if (g.level !== current) {
      const from = current;
      setLevel(g);
      if (travelling) {
        // Walk off the solved area, over the bridge, into the new one.
        const exitX = offsets[from] + size(from).w;
        const entryX = offsets[g.level] - 1;
        players.forEach((p, seat) => {
          const lane = seat ? 0.25 : -0.25;
          walk(p, [new THREE.Vector3(exitX - 1, 0, lane), new THREE.Vector3(exitX, 0, lane),
            new THREE.Vector3(entryX, 0, lane), toWorld(g.level, g.players[seat])], 1700, p.hopHeight * 0.6);
        });
      } else {
        players.forEach((p, seat) => { p.obj.position.copy(toWorld(g.level, g.players[seat])); walk(p, [], 1, 0); });
        cam.target.copy(cam.goal.target);
        cam.hw = cam.goal.hw;
        cam.hh = cam.goal.hh;
      }
      current = g.level;
    } else {
      players.forEach((p, seat) => {
        const target = toWorld(g.level, g.players[seat]);
        if (p.path[p.path.length - 1].distanceTo(target) > 1e-6) walk(p, [target], STEP_MS * Math.max(1, Math.round(p.obj.position.distanceTo(target))) ** 0.7, p.hopHeight);
      });
    }

    const parts = live;
    const filled = new Set();
    g.tiles.forEach((row, r) => row.forEach((t, c) => { if (t === '=') filled.add(`${r},${c}`); }));
    for (const w of parts.water) {
      const now = filled.has(`${w.r},${w.c}`);
      if (now && !w.plank.visible) w.sinkAt = performance.now();
      w.plank.visible = now;
    }
    g.boxes.forEach((b, i) => {
      const crate = parts.crates[i];
      if (!crate) return;
      if (b) {
        const target = new THREE.Vector3(b[1], 0, b[0]);
        crate.obj.visible = true;
        if (crate.path[crate.path.length - 1].distanceTo(target) > 1e-6) {
          walk(crate, [target], STEP_MS * Math.max(1, crate.obj.position.distanceTo(target)) ** 0.7, 0);
        }
      } else if (crate.obj.visible && !crate.sinking) {
        // Find the water this crate just went into and slide it under.
        const spot = parts.water.find((w) => w.sinkAt && performance.now() - w.sinkAt < 50 && !w.taken);
        if (spot) {
          spot.taken = true;
          walk(crate, [new THREE.Vector3(spot.c, 0, spot.r), new THREE.Vector3(spot.c, -0.9, spot.r)], 420, 0);
        }
        crate.sinking = true;
        setTimeout(() => { crate.obj.visible = false; }, 420);
      }
    });
    const occupied = new Set([...g.boxes.filter(Boolean), ...g.players].map(([r, c]) => `${r},${c}`));
    for (const d of parts.doors) d.open = /\+$|1$/.test(g.tiles[d.r][d.c]);
    for (const p of parts.plates) p.pressed = occupied.has(`${p.r},${p.c}`);
    for (const t of parts.tunnels) t.inside = g.players.some(([r, c]) => r === t.r && c === t.c);
    for (const k of parts.keys) k.mesh.visible = g.tiles[k.r][k.c] === 'k';
    for (const l of parts.locks) l.open = g.tiles[l.r][l.c] === 'K+';
    for (const l of parts.levers) l.on = g.tiles[l.r][l.c].endsWith('1');
  }

  function bump(seat) {
    if (players[seat]) players[seat].shake = performance.now();
  }

  function resize() {
    const w = container.clientWidth || 300;
    const h = container.clientHeight || 300;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
  }

  function along(path, t) {
    if (path.length === 1) return path[0].clone();
    const lens = [];
    let total = 0;
    for (let i = 1; i < path.length; i++) { lens.push(path[i].distanceTo(path[i - 1])); total += lens[i - 1]; }
    let d = t * total;
    for (let i = 1; i < path.length; i++) {
      if (d <= lens[i - 1] || i === path.length - 1) {
        return new THREE.Vector3().lerpVectors(path[i - 1], path[i], lens[i - 1] ? Math.min(1, d / lens[i - 1]) : 1);
      }
      d -= lens[i - 1];
    }
    return path[path.length - 1].clone();
  }

  function animate(now) {
    if (current >= 0) {
      for (const m of players) {
        const t = Math.min(1, (now - m.t0) / m.dur);
        const p = along(m.path, t);
        // Hop once per tile walked.
        const tiles = Math.max(1, Math.round(m.path.reduce((s, q, i) => (i ? s + q.distanceTo(m.path[i - 1]) : 0), 0)));
        p.y += m.hop * Math.abs(Math.sin(Math.PI * t * (m.path.length > 2 ? tiles : 1)));
        if (m.shake && now - m.shake < 260) p.x += Math.sin((now - m.shake) / 18) * 0.06;
        m.obj.position.copy(p);
      }
      if (live) {
        for (const c of live.crates) {
          const t = Math.min(1, (now - c.t0) / c.dur);
          c.obj.position.copy(along(c.path, t));
        }
        for (const d of live.doors) {
          const target = d.open ? d.y - WALL_H - 0.1 : d.y;
          d.mesh.position.y += (target - d.mesh.position.y) * 0.2;
        }
        for (const p of live.plates) {
          p.mesh.position.y += ((p.pressed ? 0.01 : 0.05) - p.mesh.position.y) * 0.3;
          p.mesh.material[1].emissiveIntensity = p.pressed ? 0.45 : 0;
        }
        for (const t of live.tunnels) t.mesh.material.opacity = t.inside ? 0.35 : 1;
        const ripple = TEX.waterTex().map;
        ripple.offset.set(now / 9000, Math.sin(now / 2600) * 0.04);
        for (const l of live.locks) {
          l.mesh.position.y += ((l.open ? -WALL_H - 0.2 : 0) - l.mesh.position.y) * 0.15;
        }
        for (const l of live.levers) {
          const target = l.on ? 0.6 : -0.6;
          l.stick.rotation.z += (target - l.stick.rotation.z) * 0.25;
        }
        live.keys.forEach((k, i) => { k.mesh.rotation.y = now / 500 + i; k.mesh.position.y = 0.4 + Math.sin(now / 350 + i) * 0.05; });
        live.hearts.forEach((h, i) => {
          h.rotation.y = Math.PI / 4 + Math.sin(now / 600 + i) * 0.45;
          h.position.y = 0.48 + Math.sin(now / 400 + i) * 0.05;
        });
      }
      const mine = players[you];
      marker.visible = !!mine;
      if (mine) marker.position.set(mine.obj.position.x, mine.obj.position.y + (you === 0 ? 0.85 : 1.05) + Math.sin(now / 250) * 0.06, mine.obj.position.z);

      // Glide the camera towards the current area.
      cam.target.lerp(cam.goal.target, 0.06);
      cam.hw += (cam.goal.hw - cam.hw) * 0.06;
      cam.hh += (cam.goal.hh - cam.hh) * 0.06;
      camera.position.copy(cam.target).addScaledVector(DIR, 40);
      camera.lookAt(cam.target);
      let halfW = cam.hw, halfH = cam.hh;
      if (halfW / halfH > cam.aspect) halfH = halfW / cam.aspect; else halfW = halfH * cam.aspect;
      Object.assign(camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);
  }
  resize();
  requestAnimationFrame(animate);
  window.addEventListener('resize', resize);

  return { update, bump, resize };
}
