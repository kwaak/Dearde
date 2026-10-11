// Isometric 3D board for Samen, drawn with three.js. The game rules stay in
// game.js; this only turns a level view (Samen.view) into a little diorama.
import * as THREE from './vendor/three.module.min.js';

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

const COLORS = {
  floorA: 0xfff4e4, floorB: 0xf8e6cf, wall: 0x8a6cc2, wallTop: 0x9d82d1, tunnel: 0x6b4f9e,
  hole: 0x2a1d40, crate: 0xc98b52, crateEdge: 0x8f5d30, heart: 0xff4d6d,
  mini: 0xff6f91, maxi: 0xffb84d, eye: 0x3d2b52, cheek: 0xff8fa8,
  a: 0xff5fa2, b: 0x3cb4ff, c: 0x9b6bff, d: 0x2fc46b,
};

const WALL_H = 0.55;
const HOP_MS = 170;

function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.35);
  s.bezierCurveTo(-0.05, -0.25, -0.5, -0.05, -0.5, 0.18);
  s.bezierCurveTo(-0.5, 0.42, -0.22, 0.5, 0, 0.3);
  s.bezierCurveTo(0.22, 0.5, 0.5, 0.42, 0.5, 0.18);
  s.bezierCurveTo(0.5, -0.05, 0.05, -0.25, 0, -0.35);
  return s;
}

function face(group, frontZ, eyeY, spread, scale = 1) {
  const eyeMat = new THREE.MeshStandardMaterial({ color: COLORS.eye, roughness: 0.4 });
  const cheekMat = new THREE.MeshStandardMaterial({ color: COLORS.cheek, roughness: 0.9 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045 * scale, 12, 12), eyeMat);
    eye.position.set(side * spread, eyeY, frontZ);
    group.add(eye);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.045 * scale, 12, 12), cheekMat);
    cheek.scale.set(1.3, 0.7, 0.4);
    cheek.position.set(side * spread * 1.6, eyeY - 0.08 * scale, frontZ - 0.01);
    group.add(cheek);
  }
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.06 * scale, 0.014 * scale, 8, 16, Math.PI),
    eyeMat,
  );
  smile.rotation.z = Math.PI;
  smile.position.set(0, eyeY - 0.07 * scale, frontZ + 0.005);
  group.add(smile);
}

function makeMini() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 32, 24),
    new THREE.MeshStandardMaterial({ color: COLORS.mini, roughness: 0.45 }),
  );
  body.position.y = 0.28;
  body.castShadow = true;
  g.add(body);
  face(g, 0.265, 0.33, 0.09);
  return g;
}

function makeMaxi() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.74, 0.66, 2, 2, 2),
    new THREE.MeshStandardMaterial({ color: COLORS.maxi, roughness: 0.5 }),
  );
  body.position.y = 0.37;
  body.castShadow = true;
  g.add(body);
  face(g, 0.335, 0.47, 0.12, 1.3);
  return g;
}

export function createBoard3D(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xfff6ee, 0xb59ad8, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.002;
  scene.add(sun, sun.target);

  let level = null;     // group with the static diorama
  let dims = null;      // { w, h }
  let doors = [];       // { mesh, r, c, y }
  let plates = [];      // { mesh, r, c }
  let tunnels = [];     // { mesh, r, c }
  let hearts = [];
  let crates = [];      // animated objects
  let players = [];     // animated objects
  let marker = null;
  let you = -1;

  const pos = (r, c) => new THREE.Vector3(c - (dims.w - 1) / 2, 0, r - (dims.h - 1) / 2);

  function mover(obj) {
    return { obj, from: obj.position.clone(), to: obj.position.clone(), t0: 0, hop: 0, shake: 0 };
  }

  function clearLevel() {
    if (!level) return;
    scene.remove(level);
    level.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    level = null;
  }

  function setLevel(g) {
    clearLevel();
    level = new THREE.Group();
    scene.add(level);
    dims = { h: g.tiles.length, w: g.tiles[0].length };
    doors = []; plates = []; tunnels = []; hearts = []; crates = []; players = [];

    const walk = (r, c) => {
      const t = g.tiles[r] && g.tiles[r][c];
      return t && t !== '#' && t !== 'o';
    };
    const floorGeo = new THREE.BoxGeometry(0.98, 0.2, 0.98);
    const floorMats = [COLORS.floorA, COLORS.floorB].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    const wallGeo = new THREE.BoxGeometry(1, WALL_H, 1);
    const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.7 });
    const wallTopGeo = new THREE.BoxGeometry(0.9, 0.04, 0.9);
    const wallTopMat = new THREE.MeshStandardMaterial({ color: COLORS.wallTop, roughness: 0.6 });

    g.tiles.forEach((row, r) => row.forEach((raw, c) => {
      const t = raw.endsWith('_open') ? raw[0].toUpperCase() : raw;
      const p = pos(r, c);
      if (t === '#') {
        // Only walls that border the play area: solid filler would hide tiles.
        const edge = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]
          .some(([dr, dc]) => walk(r + dr, c + dc) || (g.tiles[r + dr] && g.tiles[r + dr][c + dc] === 'o'));
        if (!edge) return;
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(p.x, WALL_H / 2 - 0.2, p.z);
        wall.castShadow = true; wall.receiveShadow = true;
        const top = new THREE.Mesh(wallTopGeo, wallTopMat);
        top.position.set(p.x, WALL_H - 0.18, p.z);
        level.add(wall, top);
        return;
      }
      const floor = new THREE.Mesh(floorGeo, floorMats[(r + c) % 2]);
      floor.position.set(p.x, -0.1, p.z);
      floor.receiveShadow = true;
      level.add(floor);

      if (t === 'o') {
        const along = walk(r, c - 1) || walk(r, c + 1) ? 'x' : 'z';
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(1, WALL_H, 1),
          new THREE.MeshStandardMaterial({ color: COLORS.tunnel, roughness: 0.7, transparent: true }),
        );
        block.position.set(p.x, WALL_H / 2 - 0.2 + 0.02, p.z);
        block.castShadow = true;
        const hole = new THREE.Mesh(
          new THREE.BoxGeometry(along === 'x' ? 1.02 : 0.46, 0.34, along === 'x' ? 0.46 : 1.02),
          new THREE.MeshStandardMaterial({ color: COLORS.hole, roughness: 1 }),
        );
        hole.position.set(p.x, 0.17, p.z);
        level.add(block, hole);
        tunnels.push({ mesh: block, r, c });
      } else if (/^[a-d]$/.test(t)) {
        const plate = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.34, 0.1, 32),
          new THREE.MeshStandardMaterial({ color: COLORS[t], roughness: 0.35, emissive: COLORS[t], emissiveIntensity: 0 }),
        );
        plate.position.set(p.x, 0.05, p.z);
        plate.receiveShadow = true;
        level.add(plate);
        plates.push({ mesh: plate, r, c });
      } else if (/^[A-D]$/.test(t)) {
        const color = COLORS[t.toLowerCase()];
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(0.94, 0.03, 0.94),
          new THREE.MeshStandardMaterial({ color, roughness: 0.6, transparent: true, opacity: 0.55 }),
        );
        frame.position.set(p.x, 0.015, p.z);
        const door = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, WALL_H + 0.1, 0.9),
          new THREE.MeshStandardMaterial({ color, roughness: 0.35, transparent: true, opacity: 0.9 }),
        );
        door.position.set(p.x, (WALL_H + 0.1) / 2, p.z);
        door.castShadow = true;
        level.add(frame, door);
        doors.push({ mesh: door, r, c, y: door.position.y });
      } else if (t === 'E') {
        const heart = new THREE.Mesh(
          new THREE.ExtrudeGeometry(heartShape(), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 16 }),
          new THREE.MeshStandardMaterial({ color: COLORS.heart, roughness: 0.3, emissive: COLORS.heart, emissiveIntensity: 0.15 }),
        );
        heart.geometry.center();
        heart.scale.setScalar(0.78);
        heart.position.set(p.x, 0.48, p.z);
        heart.castShadow = true;
        const glow = new THREE.Mesh(
          new THREE.CircleGeometry(0.36, 32),
          new THREE.MeshBasicMaterial({ color: 0xffb3c1, transparent: true, opacity: 0.7 }),
        );
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(p.x, 0.005, p.z);
        level.add(heart, glow);
        hearts.push(heart);
      }
    }));

    const crateGeo = new THREE.BoxGeometry(0.76, 0.76, 0.76);
    const crateMat = new THREE.MeshStandardMaterial({ color: COLORS.crate, roughness: 0.8 });
    const edgeMat = new THREE.LineBasicMaterial({ color: COLORS.crateEdge });
    g.boxes.forEach(([r, c]) => {
      const crate = new THREE.Group();
      const box = new THREE.Mesh(crateGeo, crateMat);
      box.position.y = 0.38;
      box.castShadow = true; box.receiveShadow = true;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(crateGeo), edgeMat);
      edges.position.y = 0.38;
      const cross = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.38, 0, 0.385), new THREE.Vector3(0.38, 0.76, 0.385),
        new THREE.Vector3(0.385, 0, -0.38), new THREE.Vector3(0.385, 0.76, 0.38),
      ]), edgeMat);
      crate.add(box, edges, cross);
      crate.position.copy(pos(r, c));
      level.add(crate);
      crates.push(mover(crate));
    });

    [makeMini(), makeMaxi()].forEach((obj, seat) => {
      obj.rotation.y = Math.PI / 4; // face the camera
      obj.position.copy(pos(...g.players[seat]));
      level.add(obj);
      players.push(mover(obj));
    });

    marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.2, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4 }),
    );
    marker.rotation.x = Math.PI;
    level.add(marker);

    sun.position.set(-dims.w * 0.3, 10, -dims.h * 0.2);
    const half = Math.max(dims.w, dims.h) / 2 + 1;
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half });
    sun.shadow.camera.updateProjectionMatrix();
    resize();
  }

  function moveTo(m, target, hop) {
    if (m.to.distanceTo(target) < 1e-6) return;
    m.from = m.obj.position.clone();
    m.to = target.clone();
    m.t0 = performance.now();
    m.hop = hop;
  }

  function update(g, me) {
    you = me;
    const occupied = new Set([...g.boxes, ...g.players].map(([r, c]) => `${r},${c}`));
    g.boxes.forEach((b, i) => crates[i] && moveTo(crates[i], pos(...b), 0));
    g.players.forEach((p, i) => moveTo(players[i], pos(...p), i === 0 ? 0.28 : 0.18));
    for (const d of doors) d.open = g.tiles[d.r][d.c].endsWith('_open');
    for (const p of plates) p.pressed = occupied.has(`${p.r},${p.c}`);
    for (const t of tunnels) t.inside = g.players.some(([r, c]) => r === t.r && c === t.c);
  }

  function bump(seat) {
    if (players[seat]) players[seat].shake = performance.now();
  }

  function resize() {
    const w = container.clientWidth || 300;
    const h = container.clientHeight || 300;
    renderer.setSize(w, h, false);
    if (!dims) return;
    // Isometric-ish camera; fit the whole board into the canvas.
    const dist = 30;
    camera.position.set(dist, dist * 1.15, dist);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const inv = camera.matrixWorldInverse;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const x of [-dims.w / 2, dims.w / 2]) for (const z of [-dims.h / 2, dims.h / 2]) for (const y of [-0.2, 1]) {
      const v = new THREE.Vector3(x, y, z).applyMatrix4(inv);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const pad = 0.4;
    let bw = maxX - minX + pad * 2, bh = maxY - minY + pad * 2;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    if (bw / bh > w / h) bh = bw * h / w; else bw = bh * w / h;
    Object.assign(camera, { left: cx - bw / 2, right: cx + bw / 2, top: cy + bh / 2, bottom: cy - bh / 2 });
    camera.updateProjectionMatrix();
  }

  function animate(now) {
    if (dims) {
      for (const m of [...crates, ...players]) {
        const t = Math.min(1, (now - m.t0) / HOP_MS);
        m.obj.position.lerpVectors(m.from, m.to, t);
        m.obj.position.y = m.hop * Math.sin(Math.PI * t);
        if (m.shake && now - m.shake < 260) {
          m.obj.position.x += Math.sin((now - m.shake) / 18) * 0.06;
        }
      }
      for (const d of doors) {
        const target = d.open ? -WALL_H : d.y;
        d.mesh.position.y += (target - d.mesh.position.y) * 0.2;
      }
      for (const p of plates) {
        const target = p.pressed ? 0.01 : 0.05;
        p.mesh.position.y += (target - p.mesh.position.y) * 0.3;
        p.mesh.material.emissiveIntensity = p.pressed ? 0.45 : 0;
      }
      for (const t of tunnels) t.mesh.material.opacity = t.inside ? 0.35 : 1;
      hearts.forEach((h, i) => {
        // Sway towards the camera instead of spinning, so it always reads as a heart.
        h.rotation.y = Math.PI / 4 + Math.sin(now / 600 + i) * 0.45;
        h.position.y = 0.48 + Math.sin(now / 400 + i) * 0.05;
      });
      const mine = players[you];
      marker.visible = !!mine;
      if (mine) {
        marker.position.set(mine.obj.position.x, (you === 0 ? 0.85 : 1.05) + Math.sin(now / 250) * 0.06, mine.obj.position.z);
      }
      renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
  window.addEventListener('resize', resize);

  return { setLevel, update, bump, resize };
}
