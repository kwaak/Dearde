// Isometric 3D world for Samen, drawn with three.js. The rules live in
// game.js; this turns area views (Samen.view) into one continuous world:
// the areas sit side by side, joined by little bridges, and the camera
// glides along as the players walk from one area into the next.
import * as THREE from './vendor/three.module.min.js';
import * as TEX from './textures.js';

const THEMES = {
  tuin: { floorA: 0xf3f8e6, floorB: 0xe6f1d2, wall: 0x6dbb72, top: 0x8bd48f },
  ijs: { floorA: 0xf4f8ff, floorB: 0xe6eefb, wall: 0x86afe0, top: 0xb4d2f5 },
  grot: { floorA: 0xf0e4d4, floorB: 0xe5d6c2, wall: 0x8a7464, top: 0xa48e7b },
  meer: { floorA: 0xfff3dd, floorB: 0xf7e5c6, wall: 0x4f9fb8, top: 0x72bcd2 },
  paddo: { floorA: 0xfbf0d6, floorB: 0xf7e7c4, wall: 0xc47a3c, top: 0x5fc45a },
  berg: { floorA: 0xdde4d5, floorB: 0xd4dccb, wall: 0x8c8f98, top: 0xf4f8ff },
  kasteel: { floorA: 0xeeeaf2, floorB: 0xe2dcea, wall: 0x8b8798, top: 0xa9a5b8 },
  hart: { floorA: 0xfff0f4, floorB: 0xfde1ea, wall: 0xc45c8a, top: 0xe07ba8 },
};
const COLORS = {
  ice: 0xcdeaff, water: 0x4aa8e0, bridge: 0xb07a45, crack: 0x8a6d55, hole: 0x2a1d40,
  crate: 0xc98b52, crateEdge: 0x8f5d30, heart: 0xff4d6d, gold: 0xf5c242, steel: 0x8d8fa3,
  mini: 0xff6f91, maxi: 0xffb84d, eye: 0x3d2b52, cheek: 0xff8fa8,
  a: 0xff5fa2, b: 0x3cb4ff, c: 0x9b6bff, d: 0x2fc46b, u: 0xff9f43, v: 0x1dd1a1,
  pipes: { 1: 0x3fbf4f, 2: 0x2fa8d8, 3: 0xf08a24, 4: 0xa46be0 }, coin: 0xffc928, pblue: 0x2f6fe0, spring: 0xe8423a,
};

const WALL_H = 0.55;
const GAP = 3; // tiles of bridge between two areas
const STEP_MS = 170;
const PIPE_TOP = 0.43;
const STEP_H = 0.5; // one level of height

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

// ---------- Mini and Maxi ----------

// Big glossy cartoon eyes: white, pupil and a highlight.
function eyes(group, x, y, z, size) {
  const white = mat(0xffffff, { roughness: 0.15 });
  const pupilMat = mat(COLORS.eye, { roughness: 0.1 });
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(size, 28, 20), white);
    ball.scale.set(1, 1.15, 0.55);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(size * 0.62, 24, 16), pupilMat);
    pupil.scale.set(1, 1.1, 0.5);
    pupil.position.set(0, -size * 0.1, size * 0.3);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(size * 0.2, 12, 8), shineMat);
    shine.position.set(size * 0.25, size * 0.2, size * 0.6);
    eye.add(ball, pupil, shine);
    eye.position.set(side * x, y, z);
    group.add(eye);
  }
}

function mouth(group, y, z, r) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.22, 10, 24, Math.PI), mat(COLORS.eye, { roughness: 0.4 }));
  m.rotation.z = Math.PI;
  m.position.set(0, y, z);
  group.add(m);
}

function cheeks(group, x, y, z, r) {
  const blush = mat(COLORS.cheek, { roughness: 0.9, transparent: true, opacity: 0.85 });
  for (const side of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), blush);
    c.scale.set(1.3, 0.75, 0.35);
    c.position.set(side * x, y, z);
    c.rotation.y = side * 0.5;
    group.add(c);
  }
}

// A box with softly rounded edges and corners.
function roundedBox(w, h, d, r) {
  const shape = new THREE.Shape();
  const x = (w - 2 * r) / 2, y = (h - 2 * r) / 2, k = Math.min(x, y) * 0.5;
  shape.moveTo(-x + k, -y);
  shape.lineTo(x - k, -y); shape.quadraticCurveTo(x, -y, x, -y + k);
  shape.lineTo(x, y - k); shape.quadraticCurveTo(x, y, x - k, y);
  shape.lineTo(-x + k, y); shape.quadraticCurveTo(-x, y, -x, y - k);
  shape.lineTo(-x, -y + k); shape.quadraticCurveTo(-x, -y, -x + k, -y);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 6, curveSegments: 10,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

const shadowed = (o) => { o.traverse((m) => { if (m.isMesh) m.castShadow = true; }); return o; };

// Mini: a soft felt ball with a little sprout on top.
function makeMini() {
  const g = new THREE.Group();
  const felt = texMat(TEX.feltTex(0xff8fab), { roughness: 0.9, bumpScale: 2.5 });
  const dark = texMat(TEX.feltTex(0xf0607f), { roughness: 0.9, bumpScale: 2.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 64, 48), felt);
  body.scale.set(1, 0.94, 1);
  body.position.y = 0.31;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.16, 40, 30), texMat(TEX.feltTex(0xffc4d3), { roughness: 0.9, bumpScale: 2 }));
  belly.scale.set(1, 0.95, 0.4);
  belly.position.set(0, 0.22, 0.21);
  g.add(body, belly);
  eyes(g, 0.09, 0.37, 0.235, 0.058);
  mouth(g, 0.29, 0.275, 0.04);
  cheeks(g, 0.165, 0.3, 0.205, 0.045);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), felt);
    arm.scale.set(0.65, 1, 0.65);
    arm.position.set(side * 0.27, 0.26, 0.03);
    arm.rotation.z = side * 0.5;
    g.add(arm);
  }
  g.userData.feet = [-1, 1].map((side) => {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 16), dark);
    foot.scale.set(1, 0.55, 1.3);
    foot.position.set(side * 0.11, 0.045, 0.05);
    g.add(foot);
    return foot;
  });
  // The sprout: a stem with two leaves.
  const leafMat = mat(0x5fc46a, { roughness: 0.5 });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.11, 10), leafMat);
  stem.position.y = 0.6;
  g.add(stem);
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 12), leafMat);
    leaf.scale.set(1, 0.22, 0.5);
    leaf.position.set(side * 0.055, 0.66, 0);
    leaf.rotation.z = side * 0.45;
    g.add(leaf);
  }
  return shadowed(g);
}

// Maxi: a sturdy wooden block with little round ears and strong eyebrows.
function makeMaxi() {
  const g = new THREE.Group();
  const wood = texMat(TEX.woodTex(COLORS.maxi), { roughness: 0.45, bumpScale: 1.5 });
  const darkWood = texMat(TEX.woodTex(0xe08a2c), { roughness: 0.5, bumpScale: 1.5 });
  const body = new THREE.Mesh(roundedBox(0.62, 0.66, 0.58, 0.12), wood);
  body.position.y = 0.4;
  g.add(body);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.07, 28), darkWood);
    ear.rotation.x = Math.PI / 2;
    ear.position.set(side * 0.21, 0.74, -0.02);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.075, 24), mat(COLORS.cheek, { roughness: 0.8 }));
    inner.rotation.x = Math.PI / 2;
    inner.position.set(side * 0.21, 0.74, -0.015);
    g.add(ear, inner);
  }
  eyes(g, 0.125, 0.47, 0.29, 0.07);
  const browMat = mat(COLORS.eye, { roughness: 0.5 });
  for (const side of [-1, 1]) {
    const brow = new THREE.Mesh(roundedBox(0.1, 0.03, 0.03, 0.012), browMat);
    brow.position.set(side * 0.125, 0.565, 0.3);
    brow.rotation.z = side * -0.18;
    g.add(brow);
  }
  mouth(g, 0.36, 0.3, 0.055);
  cheeks(g, 0.22, 0.38, 0.285, 0.05);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.16, 8, 16), wood);
    arm.position.set(side * 0.37, 0.36, 0.02);
    arm.rotation.z = side * 0.3;
    g.add(arm);
  }
  g.userData.feet = [-1, 1].map((side) => {
    const foot = new THREE.Mesh(roundedBox(0.19, 0.09, 0.25, 0.035), darkWood);
    foot.position.set(side * 0.15, 0.045, 0.04);
    g.add(foot);
    return foot;
  });
  return shadowed(g);
}

// Light column, ring and sparkles for warping between areas.
function makeWarp(color) {
  const g = new THREE.Group();
  const glow = (c, extra = {}) => new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, ...extra });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.6, 32, 1, true), glow(color, { side: THREE.DoubleSide, opacity: 0 }));
  beam.position.y = 1.3;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 10, 48), glow(0xffffff));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.05;
  const sparks = Array.from({ length: 16 }, (_, i) => {
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), glow(i % 2 ? 0xffffff : color));
    sp.userData = { a: (i / 16) * Math.PI * 2, r: 0.2 + (i % 4) * 0.07, v: 0.8 + (i % 5) * 0.25 };
    g.add(sp);
    return sp;
  });
  g.add(beam, ring);
  return { g, beam, ring, sparks };
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

// A warp pipe; pairs share a colour.
function makePipe(color) {
  const g = new THREE.Group();
  const paint = mat(color, shiny({ roughness: 0.25, envMapIntensity: 0.6 }));
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.32, 40), paint);
  body.position.y = 0.16;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.14, 40), paint);
  rim.position.y = 0.36;
  const shine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
  shine.position.set(-0.18, 0.22, 0.32);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.34, 40), mat(0x0d2a12, { roughness: 1 }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.432;
  g.add(body, rim, shine, hole);
  return shadowed(g);
}

// A red springboard: base, coil and a bouncy top.
function makeSpring() {
  const g = new THREE.Group();
  const red = mat(COLORS.spring, shiny({ roughness: 0.3, envMapIntensity: 0.5 }));
  const steel = mat(0xc9ccd8, shiny({ metalness: 0.8, roughness: 0.25 }));
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.06, 32), red);
  foot.position.y = 0.03;
  const coil = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.028, 10, 32), steel);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.09 + i * 0.06;
    coil.add(ring);
  }
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 32), red);
  top.position.y = 0.33;
  g.add(foot, coil, top);
  g.userData = { coil, top };
  return shadowed(g);
}

function makeCoin() {
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.05, 36),
    mat(COLORS.coin, shiny({ metalness: 0.9, roughness: 0.2, emissive: COLORS.coin, emissiveIntensity: 0.2 })),
  );
  coin.rotation.x = Math.PI / 2;
  const g = new THREE.Group();
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.07), mat(0xd99a10, { metalness: 0.6, roughness: 0.4 }));
  g.add(coin, slot);
  return shadowed(g);
}

// ---------- Bosses ----------

const BOSS_SIZE = 1.25; // a head taller than Maxi

function ball(r, color, extra = {}, seg = 32) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), mat(color, extra));
}

// Graaf Mol: a velvety mole with a monocle, a pink nose and a tiny crown.
function makeMol() {
  const g = new THREE.Group();
  const fur = texMat(TEX.feltTex(0x8a5a3c), { roughness: 0.95, bumpScale: 2.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 48, 36), fur);
  body.scale.set(1, 0.9, 1.05);
  body.position.y = 0.4;
  const belly = ball(0.26, 0xd9b08c, { roughness: 0.9 });
  belly.scale.set(1, 1, 0.45);
  belly.position.set(0, 0.34, 0.3);
  const nose = ball(0.09, 0xff7fa8, { roughness: 0.3 });
  nose.position.set(0, 0.5, 0.44);
  g.add(body, belly, nose);
  eyes(g, 0.12, 0.62, 0.36, 0.045);
  const monocle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 24), mat(COLORS.gold, shiny({ metalness: 0.9, roughness: 0.2 })));
  monocle.position.set(0.12, 0.62, 0.4);
  g.add(monocle);
  for (const side of [-1, 1]) {
    const claw = ball(0.12, 0xffb3c6, { roughness: 0.6 });
    claw.scale.set(1.2, 0.5, 0.9);
    claw.position.set(side * 0.36, 0.22, 0.25);
    g.add(claw);
  }
  g.add(crown(0.16, 0.8));
  return shadowed(g);
}

function crown(size, y) {
  const c = new THREE.Group();
  const gold = mat(COLORS.gold, shiny({ metalness: 0.9, roughness: 0.2, emissive: COLORS.gold, emissiveIntensity: 0.15 }));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(size, size, size * 0.5, 24, 1, true), gold);
  c.add(band);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(size * 0.28, size * 0.6, 8), gold);
    tip.position.set(Math.cos(a) * size, size * 0.5, Math.sin(a) * size);
    c.add(tip);
  }
  const gem = ball(size * 0.18, 0xff4d6d, shiny({ roughness: 0.1 }), 12);
  gem.position.set(0, 0, size);
  c.add(gem);
  c.position.y = y;
  return c;
}

// Keizer Brrr: a round emperor penguin with a crown, sliding on his belly.
function makePinguin() {
  const g = new THREE.Group();
  const body = ball(0.38, 0x2b2f45, shiny({ roughness: 0.35, envMapIntensity: 0.4 }), 48);
  body.scale.set(1, 1.15, 0.95);
  body.position.y = 0.45;
  const belly = ball(0.3, 0xffffff, { roughness: 0.5 }, 40);
  belly.scale.set(0.95, 1.1, 0.6);
  belly.position.set(0, 0.4, 0.17);
  const blush = ball(0.12, 0xffd166, { roughness: 0.6 });
  blush.scale.set(1.6, 0.6, 0.6);
  blush.position.set(0, 0.68, 0.24);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 16), mat(0xff9f43, { roughness: 0.4 }));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.72, 0.4);
  g.add(body, belly, blush, beak);
  eyes(g, 0.11, 0.8, 0.3, 0.045);
  for (const side of [-1, 1]) {
    const wing = ball(0.16, 0x2b2f45, { roughness: 0.4 });
    wing.scale.set(0.35, 1, 0.7);
    wing.position.set(side * 0.38, 0.45, 0);
    wing.rotation.z = side * 0.35;
    const foot = ball(0.09, 0xff9f43, { roughness: 0.5 });
    foot.scale.set(1.2, 0.4, 1.4);
    foot.position.set(side * 0.13, 0.04, 0.15);
    g.add(wing, foot);
  }
  g.add(crown(0.14, 0.98));
  return shadowed(g);
}

// Rommel de Rotsreus: chunky boulders with glowing eyes and a mossy top.
function makeGolem() {
  const g = new THREE.Group();
  const rock = texMat(TEX.wallTex('grot', false), { roughness: 0.9, bumpScale: 4, color: 0xb8b2aa });
  const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 1), rock);
  torso.scale.set(1.15, 1, 0.9);
  torso.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 1), rock);
  head.position.set(0, 0.98, 0.05);
  const moss = ball(0.16, 0x6bbf59, { roughness: 1 }, 16);
  moss.scale.set(1.3, 0.4, 1.1);
  moss.position.set(0, 1.17, 0);
  g.add(torso, head, moss);
  for (const side of [-1, 1]) {
    const eye = ball(0.045, 0xffe066, { emissive: 0xffd000, emissiveIntensity: 1.2 }, 12);
    eye.position.set(side * 0.08, 1.0, 0.24);
    const arm = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), rock);
    arm.position.set(side * 0.52, 0.5, 0.05);
    const leg = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 0), rock);
    leg.position.set(side * 0.2, 0.12, 0);
    g.add(eye, arm, leg);
  }
  return shadowed(g);
}

// Inkie de Inktvis: a purple squid peeking out of the water, tentacles waving.
function makeInktvis() {
  const g = new THREE.Group();
  const skin = mat(0x9b5bd6, shiny({ roughness: 0.3, envMapIntensity: 0.4 }));
  const head = ball(0.32, 0x9b5bd6, shiny({ roughness: 0.3, envMapIntensity: 0.4 }), 48);
  head.scale.set(1, 1.35, 1);
  head.position.y = 0.55;
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.3, 4), skin);
  fin.position.y = 1.0;
  fin.scale.set(1, 1, 0.3);
  g.add(head, fin);
  eyes(g, 0.13, 0.55, 0.26, 0.075);
  for (let i = 0; i < 6; i++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, 0.5, 10), skin);
    const a = (i / 6) * Math.PI * 2;
    t.position.set(Math.cos(a) * 0.25, 0.12, Math.sin(a) * 0.25);
    t.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    t.userData.wave = a;
    g.add(t);
  }
  for (const side of [-1, 1]) {
    const spot = ball(0.05, 0xd9a3ff, { roughness: 0.4 }, 12);
    spot.position.set(side * 0.18, 0.8, 0.2);
    g.add(spot);
  }
  return shadowed(g);
}

// Draak Knorbert: a grumpy little dragon with a spiky back and tiny wings.
function makeDraak() {
  const g = new THREE.Group();
  const scales = mat(0x4fb35a, shiny({ roughness: 0.35, envMapIntensity: 0.3 }));
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 40, 30), scales);
  body.scale.set(1, 1, 1.15);
  body.position.y = 0.42;
  const belly = ball(0.26, 0xffd27a, { roughness: 0.6 });
  belly.scale.set(1, 1.1, 0.5);
  belly.position.set(0, 0.38, 0.22);
  const head = ball(0.24, 0x4fb35a, shiny({ roughness: 0.35 }));
  head.position.set(0, 0.85, 0.12);
  const snout = ball(0.14, 0x63c96d, { roughness: 0.5 });
  snout.scale.set(1.2, 0.8, 1);
  snout.position.set(0, 0.8, 0.32);
  g.add(body, belly, head, snout);
  eyes(g, 0.1, 0.95, 0.27, 0.045);
  const brow = mat(COLORS.eye);
  for (const side of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.03), brow);
    b.position.set(side * 0.1, 1.02, 0.31);
    b.rotation.z = side * 0.4;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 12), mat(0xfff1c2));
    horn.position.set(side * 0.12, 1.1, 0.05);
    horn.rotation.z = -side * 0.4;
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.32, 3), mat(0x9be27a, { side: THREE.DoubleSide }));
    wing.position.set(side * 0.38, 0.6, -0.15);
    wing.rotation.set(0, 0, -side * 1.1);
    wing.scale.set(1, 1, 0.2);
    g.add(b, horn, wing);
  }
  for (let i = 0; i < 4; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), mat(0xff8f5a));
    spike.position.set(0, 0.72 - i * 0.12, -0.3 - i * 0.04);
    spike.rotation.x = -0.6;
    g.add(spike);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 12), scales);
  tail.position.set(0, 0.2, -0.5);
  tail.rotation.x = -1.2;
  g.add(tail);
  return shadowed(g);
}

// Spookridder Boe: a see-through ghost in a knight's helmet with a plume.
function makeSpook() {
  const g = new THREE.Group();
  const ghost = new THREE.MeshPhysicalMaterial({ color: 0xf2f4ff, roughness: 0.3, transmission: 0.2, transparent: true, opacity: 0.82, emissive: 0xc9d4ff, emissiveIntensity: 0.25 });
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push(new THREE.Vector2(Math.sin(t * Math.PI * 0.95) * 0.38 + 0.02, t * 0.95));
  }
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts.reverse(), 40), ghost);
  body.position.y = 0.15;
  g.add(body);
  const steel = mat(0xb8bccb, shiny({ metalness: 0.85, roughness: 0.25 }));
  const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.32, 32), steel);
  helm.position.y = 1.02;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.05), mat(0x1d1b2b));
  visor.position.set(0, 1.03, 0.25);
  const plume = ball(0.1, 0xff5f8f, { roughness: 0.7 }, 16);
  plume.scale.set(0.6, 1.8, 1.2);
  plume.position.set(0, 1.32, -0.05);
  g.add(helm, visor, plume);
  for (const side of [-1, 1]) {
    const glow = ball(0.035, 0x7fd4ff, { emissive: 0x7fd4ff, emissiveIntensity: 1.5 }, 10);
    glow.position.set(side * 0.08, 1.03, 0.27);
    const arm = ball(0.1, 0xf2f4ff, {}, 16);
    arm.material = ghost;
    arm.scale.set(0.6, 1.2, 0.6);
    arm.position.set(side * 0.42, 0.55, 0.05);
    g.add(glow, arm);
  }
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

// Jeti Joep: a big fluffy snow beast with a friendly blue face and horns.
function makeJeti() {
  const g = new THREE.Group();
  const fluff = texMat(TEX.feltTex(0xf2f6ff), { roughness: 1, bumpScale: 3 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.44, 48, 36), fluff);
  body.scale.set(1.05, 1.1, 0.95);
  body.position.y = 0.5;
  const face = ball(0.22, 0x8fb8f0, { roughness: 0.6 });
  face.scale.set(1.1, 0.95, 0.5);
  face.position.set(0, 0.68, 0.33);
  g.add(body, face);
  eyes(g, 0.08, 0.74, 0.42, 0.045);
  mouth(g, 0.6, 0.43, 0.06);
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 12), mat(0xfff1c2));
    horn.position.set(side * 0.24, 1.0, 0);
    horn.rotation.z = -side * 0.5;
    const arm = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 18), fluff);
    arm.scale.set(0.8, 1.3, 0.8);
    arm.position.set(side * 0.48, 0.42, 0.05);
    const foot = ball(0.13, 0x8fb8f0, { roughness: 0.7 });
    foot.scale.set(1, 0.5, 1.3);
    foot.position.set(side * 0.18, 0.05, 0.1);
    g.add(horn, arm, foot);
  }
  return shadowed(g);
}

// De Hartendief: a sly cat burglar with a mask, a striped scarf and a sack
// full of stolen hearts.
function makeDief() {
  const g = new THREE.Group();
  const fur = texMat(TEX.feltTex(0x5b5470), { roughness: 0.9, bumpScale: 2 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 40, 30), fur);
  body.scale.set(1, 1.1, 0.95);
  body.position.y = 0.36;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 40, 30), fur);
  head.position.y = 0.82;
  g.add(body, head);
  const mask = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.05, 10, 40), mat(0x1d1b2b, { roughness: 0.4 }));
  mask.position.set(0, 0.86, 0);
  mask.scale.set(1, 0.6, 1);
  g.add(mask);
  eyes(g, 0.1, 0.87, 0.23, 0.045);
  const nose = ball(0.03, 0xff8fab, {}, 12);
  nose.position.set(0, 0.78, 0.27);
  g.add(nose);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 4), fur);
    ear.position.set(side * 0.16, 1.07, 0);
    ear.rotation.z = -side * 0.3;
    for (let w = 0; w < 2; w++) {
      const whisker = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 4), mat(0xffffff));
      whisker.rotation.z = Math.PI / 2 + side * (0.1 + w * 0.15);
      whisker.position.set(side * 0.18, 0.77 - w * 0.03, 0.22);
      g.add(whisker);
    }
    g.add(ear);
  }
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 10, 32), texMat(TEX.doorTex(0xff4d6d), { roughness: 0.8 }));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.58;
  g.add(scarf);
  const sack = ball(0.22, 0xc9a26b, { roughness: 0.95 }, 24);
  sack.scale.set(1, 1.1, 1);
  sack.position.set(0.32, 0.55, -0.2);
  const peek = new THREE.Mesh(new THREE.ExtrudeGeometry(heartShape(), { depth: 0.06, bevelEnabled: false }), mat(COLORS.heart, { emissive: COLORS.heart, emissiveIntensity: 0.3 }));
  peek.geometry.center();
  peek.scale.setScalar(0.28);
  peek.position.set(0.32, 0.8, -0.2);
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 24, Math.PI * 1.2), fur);
  tail.position.set(-0.2, 0.3, -0.25);
  tail.rotation.y = Math.PI / 2;
  g.add(sack, peek, tail);
  return shadowed(g);
}

const BOSS_MAKERS = { mol: makeMol, pinguin: makePinguin, golem: makeGolem, inktvis: makeInktvis, draak: makeDraak, spook: makeSpook, jeti: makeJeti, dief: makeDief };

// The snapping flower of the flower trap: a pad with two big jaws.
function makeFlowerTrap() {
  const g = new THREE.Group();
  const leaf = mat(0x5fc46a, { roughness: 0.6, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const petal = ball(0.16, 0xff8fbf, { roughness: 0.5 }, 16);
    const a = (i / 6) * Math.PI * 2;
    petal.scale.set(1, 0.25, 0.6);
    petal.position.set(Math.cos(a) * 0.28, 0.04, Math.sin(a) * 0.28);
    petal.rotation.y = -a;
    g.add(petal);
  }
  const jaws = [-1, 1].map((side) => {
    const jaw = new THREE.Group();
    const half = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), leaf);
    half.scale.set(1, 0.6, 0.55);
    jaw.add(half);
    for (let k = -2; k <= 2; k++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 6), mat(0xffffff));
      tooth.position.set(k * 0.1, 0.01, 0.15);
      jaw.add(tooth);
    }
    jaw.rotation.x = side * 1.2;
    jaw.position.y = 0.06;
    jaw.rotation.y = side > 0 ? Math.PI : 0;
    g.add(jaw);
    return jaw;
  });
  g.userData.jaws = jaws;
  return shadowed(g);
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
  // How high a tile's floor sits. Stairs sit halfway between two levels.
  const levelOf = (level, r, c) => { const h = AREAS[level].heights; return h ? Number(h[r][c]) || 0 : 0; };
  const liftOf = (level, r, c) => STEP_H * (levelOf(level, r, c) - (AREAS[level].map[r][c] === '/' ? 0.5 : 0));
  const toWorld = (level, [r, c]) => new THREE.Vector3(offsets[level] + c, liftOf(level, r, c), r - (size(level).h - 1) / 2);

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
  const HEAD = [0.78, 0.98]; // where a heart floats above each character

  const effects = [];
  const debris = [];
  let pTimer = 0;
  function warpFx(pos, color) {
    const fx = makeWarp(color);
    fx.g.position.copy(pos);
    fx.t0 = performance.now();
    scene.add(fx.g);
    effects.push(fx);
  }
  let prevParts = null; // the area just left, so its hearts can settle back
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 16), mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.4 }));
  marker.rotation.x = Math.PI;
  scene.add(marker);

  const DIR = new THREE.Vector3(1, 1.15, 1).normalize();
  const VIEW = new THREE.Matrix4().lookAt(DIR, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)).invert();
  const cam = { target: new THREE.Vector3(), hw: 6, hh: 6, goal: { target: new THREE.Vector3(), hw: 6, hh: 6 }, aspect: 1 };

  // Half width/height on screen of an area seen from the camera direction.
  function fit(level, w = size(level).w, h = size(level).h) {
    const top = Math.max(0, ...(AREAS[level].heights || ['0']).join('').split('').map(Number)) * STEP_H;
    let hw = 0, hh = 0;
    for (const x of [-w / 2, w / 2]) for (const z of [-h / 2, h / 2]) for (const y of [-0.2, top + 1]) {
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
    const parts = { doors: [], plates: [], tunnels: [], hearts: [], water: [], keys: [], locks: [], levers: [], crates: [], bricks: [], coins: [], springs: [], switches: [], pblocks: [], traps: [], crumbles: [], cracks: [] };
    const tile = (r, c) => g.tiles[r] && g.tiles[r][c];
    const open = (t) => t && t !== '#' && t !== 'o';

    const floorGeo = new THREE.BoxGeometry(0.98, 0.2, 0.98);
    const floorMats = [0, 1].map((v) => texMat(TEX.floorTex(zone, v), { roughness: 0.92 }));
    const snowMat = zone === 'berg' ? texMat(TEX.floorTex(zone, 2), { roughness: 0.7 }) : null;
    const crackedMat = texMat(TEX.crackedTex(zone), { roughness: 0.95, bumpScale: 3 });
    const wallGeo = new THREE.BoxGeometry(1, WALL_H, 1);
    const side = texMat(TEX.wallTex(zone, false), { roughness: 0.8, bumpScale: 2.5 });
    const top = texMat(TEX.wallTex(zone, true), { roughness: 0.75, bumpScale: 2 });
    const wallMat = [side, side, top, side, side, side]; // box faces: +x -x +y -y +z -z
    const iceMat = texMat(TEX.iceTex(), shiny({ color: 0xcfe6ff, roughness: 0.08, bumpScale: 0.3, envMapIntensity: 0.35 }));
    const plankMat = texMat(TEX.plankTex(), { roughness: 0.8, bumpScale: 2 });
    const deepMat = texMat(TEX.waterTex(), shiny({ color: 0x5a7fc4, roughness: 0.1, transparent: true, opacity: 0.95, bumpScale: 0.5, envMapIntensity: 0.6 }));
    const waterMat = texMat(TEX.waterTex(), shiny({ roughness: 0.1, transparent: true, opacity: 0.9, bumpScale: 0.5, envMapIntensity: 0.7 }));

    const lift = (r, c) => liftOf(level, r, c);
    const add = (mesh, r, c, y) => { mesh.position.set(c, y + lift(r, c), r); group.add(mesh); return mesh; };
    // Rock under raised tiles, so plateaus read as solid cliffs.
    const cliff = (r, c, top) => {
      if (top <= 0.001) return;
      const rock = new THREE.Mesh(new THREE.BoxGeometry(0.999, top, 0.999), side);
      rock.position.set(c, top / 2 - 0.2, r);
      rock.castShadow = true;
      rock.receiveShadow = true;
      group.add(rock);
    };

    g.tiles.forEach((row, r) => row.forEach((t, c) => {
      if (t === '#') {
        const near = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]
          .some(([dr, dc]) => open(tile(r + dr, c + dc)) || tile(r + dr, c + dc) === 'o');
        if (!near) return;
        const wall = add(new THREE.Mesh(wallGeo, wallMat), r, c, WALL_H / 2 - 0.2);
        wall.castShadow = true; wall.receiveShadow = true;
        cliff(r, c, lift(r, c));
        return;
      }
      if (t === '/') {
        // Three steps climbing away from the lower neighbour.
        const h = levelOf(level, r, c);
        const low = [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dr, dc]) => open(tile(r + dr, c + dc)) && levelOf(level, r + dr, c + dc) === h - 1) || [0, -1];
        for (let i = 0; i < 3; i++) {
          const top = STEP_H * (h - 1 + (i + 1) / 3);
          const off = (1 - i) / 3;
          const step = new THREE.Mesh(new THREE.BoxGeometry(low[1] ? 0.33 : 0.98, top + 0.2, low[0] ? 0.33 : 0.98), [side, side, floorMats[i % 2], side, side, side]);
          step.position.set(c + low[1] * off, (top - 0.2) / 2, r + low[0] * off);
          step.castShadow = true;
          step.receiveShadow = true;
          group.add(step);
        }
        return;
      }
      if (t === 'q0' || t === 'q1') {
        // Dotted outlines over the water that turn into solid blocks.
        add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 1), waterMat), r, c, -0.16);
        cliff(r, c, lift(r, c) - 0.02);
        const solid = add(new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.2, 0.94), texMat(TEX.pBlockTex(), { roughness: 0.5, transparent: true })), r, c, -0.1);
        solid.receiveShadow = true;
        const outline = add(new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(0.9, 0.18, 0.9)),
          new THREE.LineDashedMaterial({ color: COLORS.pblue, dashSize: 0.08, gapSize: 0.06 }),
        ), r, c, -0.05);
        outline.computeLineDistances();
        parts.pblocks.push({ r, c, solid, outline, on: t === 'q1' });
        return;
      }
      if (t === '%' || t === 'Q0' || t === 'Q1') {
        // Deep water; a crumbly bridge block may hang over it.
        add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 1), deepMat), r, c, -0.24);
        cliff(r, c, lift(r, c) - 0.1);
        if (t !== '%') {
          const block = add(new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.24, 0.96), texMat(TEX.crackedTex(zone), { roughness: 0.9, bumpScale: 3, transparent: true })), r, c, -0.1);
          block.receiveShadow = true;
          block.castShadow = true;
          parts.crumbles.push({ mesh: block, r, c, base: block.position.y, up: t === 'Q1' });
        }
        return;
      }
      if (t === 'Z' || t === 'Z+') {
        // A golden cage around the hearts that sinks away once the boss is beaten.
        add(new THREE.Mesh(floorGeo, floorMats[(r + c) % 2]), r, c, -0.1).receiveShadow = true;
        cliff(r, c, lift(r, c));
        const cage = new THREE.Group();
        const gold = mat(COLORS.gold, shiny({ metalness: 0.85, roughness: 0.25 }));
        for (const [x, z] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36], [0, -0.36], [0, 0.36], [-0.36, 0], [0.36, 0]]) {
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, WALL_H + 0.15, 8), gold);
          bar.position.set(x, (WALL_H + 0.15) / 2, z);
          bar.castShadow = true;
          cage.add(bar);
        }
        const rim = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.8), gold);
        rim.position.y = WALL_H + 0.15;
        cage.add(rim);
        add(cage, r, c, 0);
        parts.doors.push({ mesh: cage, r, c, y: cage.position.y, open: t === 'Z+' });
        return;
      }
      if (t === '~' || t === '=') {
        const water = add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 1), waterMat), r, c, -0.16);
        cliff(r, c, lift(r, c) - 0.02);
        const plank = add(new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.2, 0.92), plankMat), r, c, -0.1);
        plank.receiveShadow = true;
        plank.visible = t === '=';
        parts.water.push({ r, c, water, plank });
        return;
      }
      const floorMat = t === '_' ? iceMat : t === 'x' ? crackedMat
        : snowMat && levelOf(level, r, c) >= 3 ? snowMat : floorMats[(r + c) % 2];
      const floor = add(new THREE.Mesh(floorGeo, floorMat), r, c, t === 'x' || t === 'h' ? -0.12 : -0.1);
      floor.receiveShadow = true;
      cliff(r, c, lift(r, c));
      if (t === 'x' || t === 'h') {
        // A cracked floor a boss can crash through, leaving a dark hole.
        const hole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.22, 24), mat(0x140d22, { roughness: 1 })), r, c, -0.1);
        hole.visible = t === 'h';
        floor.visible = t !== 'h';
        parts.cracks.push({ floor, hole, r, c });
      }
      if (t === 'T') {
        const trap = add(makeFlowerTrap(), r, c, 0.01);
        parts.traps.push({ obj: trap, at: 0 });
      }

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
        parts.plates.push({ mesh: plate, r, c, base: lift(r, c) });
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
        parts.keys.push({ mesh: key, r, c, base: lift(r, c) });
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
        parts.locks.push({ mesh: lock, r, c, open: t === 'K+', base: lift(r, c) });
      } else if (/^[1-4]$/.test(t)) {
        add(makePipe(COLORS.pipes[t]), r, c, 0);
      } else if (t === 'r') {
        const brick = add(new THREE.Mesh(new THREE.BoxGeometry(0.96, WALL_H + 0.05, 0.96), texMat(TEX.brickTex(), { roughness: 0.7, bumpScale: 2.5, transparent: true })), r, c, (WALL_H + 0.05) / 2);
        brick.castShadow = true;
        brick.receiveShadow = true;
        parts.bricks.push({ mesh: brick, r, c, broken: false });
      } else if (t === 'j') {
        const spring = add(makeSpring(), r, c, 0);
        parts.springs.push({ obj: spring, r, c, at: 0 });
      } else if (t === '*') {
        const coin = add(makeCoin(), r, c, 0.4);
        parts.coins.push({ mesh: coin, r, c, taken: 0, base: lift(r, c) });
      } else if (t === 'S' || t === 'S+') {
        const door = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, WALL_H + 0.1, 0.9), texMat(TEX.starDoorTex(), shiny({ roughness: 0.3, bumpScale: 1.5, envMapIntensity: 0.5 }))), r, c, (WALL_H + 0.1) / 2);
        door.castShadow = true;
        parts.doors.push({ mesh: door, r, c, y: door.position.y, open: t === 'S+' });
      } else if (t === 'p') {
        const sw = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.06, 32), mat(COLORS.steel, { roughness: 0.4 }));
        base.position.y = 0.03;
        const top = TEX.pSwitchTex();
        const button = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.5), [mat(COLORS.pblue, { roughness: 0.35 }), mat(COLORS.pblue, { roughness: 0.35 }), texMat(top, { roughness: 0.35, bumpScale: 0.5 }), mat(COLORS.pblue), mat(COLORS.pblue, { roughness: 0.35 }), mat(COLORS.pblue, { roughness: 0.35 })]);
        button.position.y = 0.19;
        button.castShadow = true;
        sw.add(base, button);
        add(sw, r, c, 0);
        parts.switches.push({ button, r, c });
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
        parts.hearts.push({ mesh: heart, x: offsets[level] + c, z: r - (g.tiles.length - 1) / 2, base: lift(r, c) });
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
      if (b) crate.position.set(b[1], lift(b[0], b[1]), b[0]); else crate.visible = false;
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
    prevParts = live;
    groups.set(g.level, buildArea(g.level, g, true));
    live = groups.get(g.level).parts;
    setBoss(g);
    if (g.level + 1 < AREAS.length && !groups.has(g.level + 1)) {
      groups.set(g.level + 1, buildArea(g.level + 1, window.Samen.preview(g.level + 1), false));
    }
    const { w, h } = size(g.level);
    cam.goal.target.set(offsets[g.level] + (w - 1) / 2, 0, 0);
    Object.assign(cam.goal, fit(g.level));
    // Areas bigger than the screen get a camera that follows the players.
    cam.full = fit(g.level);
    cam.window = fit(g.level, Math.min(w, 12), Math.min(h, 10));
    cam.follow = cam.full.hw > cam.window.hw * 1.15 || cam.full.hh > cam.window.hh * 1.15;
    cam.bounds = { x0: offsets[g.level] + 2, x1: offsets[g.level] + w - 3, z: Math.max(0, (h - 1) / 2 - 2) };
    sun.shadow.mapSize.set(cam.follow ? 2048 : 1024, cam.follow ? 2048 : 1024);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    sun.position.set(cam.goal.target.x - w * 0.3, 10, -h * 0.2);
    sun.target.position.copy(cam.goal.target);
    const half = Math.max(w, h) / 2 + 2;
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half });
    sun.shadow.camera.updateProjectionMatrix();
  }

  // ---------- The boss ----------
  let boss = null;

  function placeBoss(level, pos) {
    const p = toWorld(level, pos);
    if (boss && boss.swim) p.y = -0.32;
    return p;
  }

  function setBoss(g) {
    if (boss) { dispose(boss.obj); boss = null; }
    if (!g.boss || !g.boss.pos || !BOSS_MAKERS[g.boss.look]) return;
    const obj = BOSS_MAKERS[g.boss.look]();
    obj.rotation.y = Math.PI / 4;
    obj.scale.setScalar(BOSS_SIZE);
    boss = { obj, look: g.boss.look, swim: !!g.boss.swim, hits: g.boss.hits, path: [], t0: 0, dur: 1, hop: 0, level: g.level };
    obj.position.copy(placeBoss(g.level, g.boss.pos));
    boss.path = [obj.position.clone()];
    scene.add(obj);
    obj.traverse((o) => { if (o.material && o.material.emissive) o.userData.glow = [o.material.emissive.getHex(), o.material.emissiveIntensity]; });
  }

  function updateBoss(g) {
    if (!boss || !g.boss) return;
    const now = performance.now();
    if (g.boss.hits > boss.hits) {
      // Hit! Flash, puff, and pop back up at the start (or vanish for good).
      boss.hits = g.boss.hits;
      boss.hitAt = now;
      boss.from = boss.obj.position.clone();
      boss.to = g.boss.pos ? placeBoss(g.level, g.boss.pos) : null;
      if (live) for (const tr of live.traps) tr.at = now;
      return;
    }
    if (!g.boss.pos || boss.hitAt) return;
    const target = placeBoss(g.level, g.boss.pos);
    if (boss.path[boss.path.length - 1].distanceTo(target) > 1e-6) {
      walk(boss, [target], STEP_MS * Math.max(1, Math.round(boss.obj.position.distanceTo(target))) ** 0.7, boss.swim ? 0.05 : 0.12);
    }
  }

  function animateBoss(now) {
    if (!boss) return;
    const o = boss.obj;
    if (boss.hitAt) {
      const t = now - boss.hitAt;
      const flash = t < 600 && Math.sin(t / 45) > 0;
      o.traverse((m) => {
        if (!m.material || !m.material.emissive) return;
        m.material.emissive.setHex(flash ? 0xff3355 : m.userData.glow[0]);
        m.material.emissiveIntensity = flash ? 0.8 : m.userData.glow[1];
      });
      if (t < 600) {
        o.position.copy(boss.from);
        o.position.x += Math.sin(t / 25) * 0.06;
        return;
      }
      if (!boss.puffed) { boss.puffed = true; warpFx(boss.from, boss.to ? 0xffffff : COLORS.gold); }
      if (!boss.to) {
        // Beaten: spin up into a burst of stars.
        const k = Math.min(1, (t - 600) / 700);
        o.rotation.y = Math.PI / 4 + k * Math.PI * 6;
        o.scale.setScalar(Math.max(0.001, 1 - k) * BOSS_SIZE);
        o.position.copy(boss.from).add(new THREE.Vector3(0, k * 1.2, 0));
        if (k >= 1) { dispose(o); boss = null; }
        return;
      }
      const k = Math.min(1, (t - 600) / 500);
      o.scale.setScalar(Math.max(0.001, k < 0.5 ? 1 - k * 2 : (k - 0.5) * 2) * BOSS_SIZE);
      o.position.copy(k < 0.5 ? boss.from : boss.to);
      if (k >= 1) {
        o.scale.setScalar(BOSS_SIZE);
        boss.hitAt = 0;
        boss.puffed = false;
        boss.path = [boss.to.clone()];
        boss.t0 = 0;
      }
      return;
    }
    const t = Math.min(1, Math.max(0, (now - boss.t0) / boss.dur));
    const p = along(boss.path, t);
    p.y += boss.hop * Math.abs(Math.sin(Math.PI * t)) + Math.sin(now / 380) * (boss.swim ? 0.04 : 0.02);
    o.position.copy(p);
    o.scale.set(BOSS_SIZE * (1 + Math.sin(now / 260) * 0.02), BOSS_SIZE * (1 - Math.sin(now / 260) * 0.02), BOSS_SIZE);
    if (boss.look === 'inktvis') o.children.forEach((c) => { if (c.userData.wave !== undefined) c.rotation.y = Math.sin(now / 300 + c.userData.wave) * 0.4; });
    if (boss.look === 'spook') o.position.y += 0.15 + Math.sin(now / 500) * 0.06;
  }

  // Keeps both players in view where possible. Online, when they are far
  // apart, each phone follows its own player.
  function followPlayers(level) {
    if (!cam.follow) return;
    const pts = players.map((p) => p.grid && toWorld(level, p.grid));
    if (!pts[0] || !pts[1]) return;
    const [a, b] = pts.map((v) => v.clone().applyMatrix4(VIEW));
    const need = { hw: Math.abs(a.x - b.x) / 2 + 2.5, hh: Math.abs(a.y - b.y) / 2 + 2.2 };
    const both = you < 0 || (need.hw <= cam.window.hw * 1.5 && need.hh <= cam.window.hh * 1.5);
    const focus = both ? pts[0].clone().add(pts[1]).multiplyScalar(0.5) : pts[you].clone();
    const clamp = (v, lo, hi) => Math.min(Math.max(v, Math.min(lo, hi)), Math.max(lo, hi));
    cam.goal.target.set(clamp(focus.x, cam.bounds.x0, cam.bounds.x1), 0, clamp(focus.z, -cam.bounds.z, cam.bounds.z));
    cam.goal.hw = both ? Math.min(cam.full.hw, Math.max(cam.window.hw, need.hw)) : cam.window.hw;
    cam.goal.hh = both ? Math.min(cam.full.hh, Math.max(cam.window.hh, need.hh)) : cam.window.hh;
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
      setLevel(g);
      if (travelling) {
        // Warp out of the solved area and into the new one: no walking
        // through walls.
        players.forEach((p, seat) => {
          p.grid = g.players[seat].slice();
          p.pipe = null;
          p.then = null;
          p.warp = { from: p.obj.position.clone(), to: toWorld(g.level, g.players[seat]), t0: performance.now() + seat * 160, stage: 0 };
        });
      } else {
        players.forEach((p, seat) => {
          p.grid = g.players[seat].slice();
          p.pipe = null;
          p.then = null;
          p.warp = null;
          p.obj.visible = true;
          p.obj.scale.setScalar(1);
          p.obj.position.copy(toWorld(g.level, g.players[seat]));
          walk(p, [], 1, 0);
        });
        followPlayers(g.level);
        cam.target.copy(cam.goal.target);
        cam.hw = cam.goal.hw;
        cam.hh = cam.goal.hh;
      }
      current = g.level;
    } else {
      players.forEach((p, seat) => {
        const target = toWorld(g.level, g.players[seat]);
        if (p.warp) { p.warp.to = target; return; }
        const from = p.grid;
        p.grid = g.players[seat].slice();
        const [r, c] = g.players[seat];
        const tile = (rr, cc) => g.tiles[rr] && g.tiles[rr][cc];
        if (/^[1-4]$/.test(tile(r, c))) target.y += PIPE_TOP; // stand on top of a pipe
        if (p.path[p.path.length - 1].distanceTo(target) <= 1e-6) return;
        // Came out of a warp pipe: dive into the other one, pop out here.
        if (from && /^[1-4]$/.test(tile(r, c))) {
          const entry = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dr, dc]) => [from[0] + dr, from[1] + dc])
            .find(([rr, cc]) => tile(rr, cc) === tile(r, c) && (rr !== r || cc !== c));
          if (entry) {
            p.pipe = { a: toWorld(g.level, entry), b: target, t0: performance.now() };
            return;
          }
        }
        // Bounced off a springboard on the way: a big leap.
        if (live && from && (from[0] === r || from[1] === c)) {
          const spring = live.springs.find((sp) => (sp.r === r && sp.r === from[0] && (sp.c - from[1]) * (sp.c - c) < 0)
            || (sp.c === c && sp.c === from[1] && (sp.r - from[0]) * (sp.r - r) < 0));
          if (spring) {
            spring.used = true;
            const springAt = toWorld(g.level, [spring.r, spring.c]);
            walk(p, [springAt], STEP_MS, p.hopHeight);
            p.then = { points: [target], dur: 420, hop: 1.1, at: performance.now() + STEP_MS };
            return;
          }
        }
        walk(p, [target], STEP_MS * Math.max(1, Math.round(p.obj.position.distanceTo(target))) ** 0.7, p.hopHeight);
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
        const target = new THREE.Vector3(b[1], liftOf(g.level, b[0], b[1]), b[0]);
        crate.obj.visible = true;
        if (crate.path[crate.path.length - 1].distanceTo(target) > 1e-6) {
          walk(crate, [target], STEP_MS * Math.max(1, crate.obj.position.distanceTo(target)) ** 0.7, 0);
        }
      } else if (crate.obj.visible && !crate.sinking) {
        // Find the water this crate just went into and slide it under.
        const spot = parts.water.find((w) => w.sinkAt && performance.now() - w.sinkAt < 50 && !w.taken);
        if (spot) {
          spot.taken = true;
          const y = liftOf(g.level, spot.r, spot.c);
          walk(crate, [new THREE.Vector3(spot.c, y, spot.r), new THREE.Vector3(spot.c, y - 0.9, spot.r)], 420, 0);
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
    const now = performance.now();
    for (const b of parts.bricks) {
      const broken = g.tiles[b.r][b.c] === '.';
      if (broken && !b.broken) { b.at = now; smash(b.mesh.parent.position.x + b.c, b.r - (g.tiles.length - 1) / 2); }
      b.broken = broken;
    }
    for (const k of parts.coins) if (g.tiles[k.r][k.c] !== '*' && !k.taken) k.taken = now;
    for (const sp of parts.springs) if (sp.used) { sp.at = now; sp.used = false; }
    for (const q of parts.pblocks) q.on = g.tiles[q.r][q.c] === 'q1';
    pTimer = g.ptimer;
    for (const k of parts.cracks) {
      const hole = g.tiles[k.r][k.c] === 'h';
      if (hole && !k.hole.visible) smash(k.floor.parent.position.x + k.c, k.r - (g.tiles.length - 1) / 2);
      k.hole.visible = hole;
      k.floor.visible = !hole;
    }
    for (const q of parts.crumbles) q.up = g.tiles[q.r][q.c] === 'Q1';
    updateBoss(g);
    for (const sw of parts.switches) sw.pressed = g.ptimer > 0;
  }

  // Brick crumbs flying off when Maxi smashes a block.
  function smash(x, z) {
    const brickMat = texMat(TEX.brickTex(), { roughness: 0.7 });
    for (let i = 0; i < 8; i++) {
      const bit = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.18), brickMat);
      bit.position.set(x + (Math.random() - 0.5) * 0.5, 0.3 + Math.random() * 0.2, z + (Math.random() - 0.5) * 0.5);
      bit.userData.v = new THREE.Vector3((Math.random() - 0.5) * 3, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 3);
      bit.castShadow = true;
      scene.add(bit);
      debris.push({ bit, t0: performance.now() });
    }
  }

  function bump(seat) {
    if (players[seat]) players[seat].shake = performance.now();
  }

  function resize() {
    const w = container.clientWidth || 300;
    const h = container.clientHeight || 300;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.w = w;
    cam.h = h;
  }

  // The part of the canvas (in pixels) the world should fit in, or null for
  // all of it.
  let safe = null;
  function setSafeArea(rect) {
    safe = rect && rect.x1 - rect.x0 > 80 && rect.y1 - rect.y0 > 80 ? rect : null;
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

  // A heart with a character on its tile floats above that character's head
  // like a little crown, instead of sitting inside it.
  function animateHearts(hearts, now) {
    hearts.forEach((h, i) => {
      const seat = players.findIndex((p) => p.obj.visible && Math.abs(p.obj.position.x - h.x) < 0.3 && Math.abs(p.obj.position.z - h.z) < 0.3);
      const p = players[seat];
      const y = p ? p.obj.position.y + HEAD[seat] * p.obj.scale.y + 0.12 + Math.sin(now / 300 + i) * 0.03 : h.base + 0.48 + Math.sin(now / 400 + i) * 0.05;
      const scale = p ? 0.5 * p.obj.scale.y : 0.78;
      h.mesh.position.y += (y - h.mesh.position.y) * 0.25;
      h.mesh.scale.setScalar(h.mesh.scale.x + (scale - h.mesh.scale.x) * 0.25);
      h.mesh.rotation.y = Math.PI / 4 + Math.sin(now / (p ? 350 : 600) + i) * (p ? 0.35 : 0.45);
    });
  }

  const WARP_OUT = 450, WARP_GAP = 650, WARP_IN = 520;
  function animateWarp(m, seat, now) {
    const w = m.warp;
    const t = now - w.t0;
    const obj = m.obj;
    const color = seat ? COLORS.maxi : COLORS.mini;
    if (t < 0) return;
    if (w.stage === 0) { warpFx(w.from, color); w.stage = 1; }
    if (t < WARP_OUT) {
      const k = t / WARP_OUT;
      obj.scale.setScalar(Math.max(0.001, 1 - k * k));
      obj.rotation.y = Math.PI / 4 + k * k * Math.PI * 4;
      obj.position.copy(w.from).add(new THREE.Vector3(0, k * 0.6, 0));
    } else if (t < WARP_OUT + WARP_GAP) {
      obj.visible = false;
      obj.position.copy(w.to);
    } else {
      if (w.stage === 1) { warpFx(w.to, color); w.stage = 2; obj.visible = true; }
      const k = Math.min(1, (t - WARP_OUT - WARP_GAP) / WARP_IN);
      const back = 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2; // ease out with a little overshoot
      obj.scale.setScalar(Math.max(0.001, back));
      obj.rotation.y = Math.PI / 4 + (1 - k) * Math.PI * 4;
      obj.position.copy(w.to).add(new THREE.Vector3(0, (1 - k) * 0.7, 0));
      if (k >= 1) {
        obj.scale.setScalar(1);
        obj.rotation.y = Math.PI / 4;
        m.warp = null;
        m.path = [w.to.clone()];
        m.t0 = 0;
        m.dur = 1;
      }
    }
  }

  // Down one pipe, up the other.
  function animatePipe(m, now) {
    const { a, b, t0 } = m.pipe;
    const t = now - t0;
    const obj = m.obj;
    if (t < 160) {
      obj.position.lerpVectors(obj.position, a, 0.5);
      obj.position.y = a.y + PIPE_TOP;
    } else if (t < 420) {
      const k = (t - 160) / 260;
      obj.position.set(a.x, a.y + PIPE_TOP - k * 0.9, a.z);
      obj.scale.setScalar(1 - k * 0.4);
    } else if (t < 560) {
      obj.visible = false;
    } else if (t < 860) {
      const k = (t - 560) / 300;
      obj.visible = true;
      obj.position.set(b.x, b.y - 0.9 + k * 0.9 + Math.sin(k * Math.PI) * 0.35, b.z);
      obj.scale.setScalar(0.6 + k * 0.4);
    } else {
      obj.scale.setScalar(1);
      obj.position.copy(b);
      m.pipe = null;
      m.path = [obj.position.clone()];
      m.t0 = 0;
    }
  }

  function animateEffects(now) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const fx = effects[i];
      const t = (now - fx.t0) / 1000;
      if (t >= 1) {
        scene.remove(fx.g);
        fx.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        effects.splice(i, 1);
        continue;
      }
      fx.beam.material.opacity = Math.sin(Math.PI * t) * 0.5;
      fx.beam.scale.set(1 - t * 0.5, 1, 1 - t * 0.5);
      fx.ring.scale.setScalar(1 + t * 1.6);
      fx.ring.material.opacity = 1 - t;
      for (const sp of fx.sparks) {
        const { a, r, v } = sp.userData;
        const ang = a + t * 5;
        sp.position.set(Math.cos(ang) * (r + t * 0.3), t * 1.8 * v, Math.sin(ang) * (r + t * 0.3));
        sp.material.opacity = 1 - t;
      }
    }
  }

  function animate() {
    // Same clock as the moves themselves; the frame timestamp can lag behind
    // it, which made a fresh step briefly run backwards.
    const now = performance.now();
    if (current >= 0) {
      players.forEach((m, seat) => {
        if (m.warp) return animateWarp(m, seat, now);
        if (m.pipe) return animatePipe(m, now);
        if (m.then && now >= m.then.at) { walk(m, m.then.points, m.then.dur, m.then.hop); m.then = null; }
        const t = Math.min(1, (now - m.t0) / m.dur);
        const p = along(m.path, t);
        p.y += m.hop * Math.abs(Math.sin(Math.PI * t));
        if (m.shake && now - m.shake < 260) p.x += Math.sin((now - m.shake) / 18) * 0.06;
        m.obj.position.copy(p);
        // Little steps while moving.
        m.obj.userData.feet.forEach((f, i) => {
          f.position.z = 0.05 + (t < 1 ? Math.sin(t * Math.PI * 2 + i * Math.PI) * 0.07 : 0);
        });
      });
      animateEffects(now);
      animateBoss(now);
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        const t = (now - d.t0) / 1000;
        d.bit.position.addScaledVector(d.bit.userData.v, 1 / 60);
        d.bit.userData.v.y -= 9.8 / 60;
        d.bit.rotation.x += 0.2;
        if (t > 0.9) { scene.remove(d.bit); d.bit.geometry.dispose(); debris.splice(i, 1); }
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
          p.mesh.position.y += (p.base + (p.pressed ? 0.01 : 0.05) - p.mesh.position.y) * 0.3;
          p.mesh.material[1].emissiveIntensity = p.pressed ? 0.45 : 0;
        }
        for (const t of live.tunnels) t.mesh.material.opacity = t.inside ? 0.35 : 1;
        const ripple = TEX.waterTex().map;
        ripple.offset.set(now / 9000, Math.sin(now / 2600) * 0.04);
        for (const l of live.locks) {
          l.mesh.position.y += (l.base + (l.open ? -WALL_H - 0.2 : 0) - l.mesh.position.y) * 0.15;
        }
        for (const l of live.levers) {
          const target = l.on ? 0.6 : -0.6;
          l.stick.rotation.z += (target - l.stick.rotation.z) * 0.25;
        }
        for (const b of live.bricks) {
          if (!b.broken) continue;
          const k = Math.min(1, (now - (b.at || 0)) / 180);
          b.mesh.scale.setScalar(Math.max(0.001, 1 - k));
          b.mesh.visible = k < 1;
        }
        live.coins.forEach((k, i) => {
          if (k.taken) {
            const t = (now - k.taken) / 450;
            k.mesh.position.y = k.base + 0.4 + t * 1.2;
            k.mesh.rotation.y += 0.5;
            k.mesh.visible = t < 1;
          } else {
            k.mesh.rotation.y = now / 400 + i;
            k.mesh.position.y = k.base + 0.4 + Math.sin(now / 350 + i) * 0.05;
          }
        });
        for (const sp of live.springs) {
          const t = (now - sp.at) / 400;
          const squash = t < 1 ? 1 - Math.sin(t * Math.PI) * 0.45 * (1 - t) : 1;
          sp.obj.userData.coil.scale.y = squash;
          sp.obj.userData.top.position.y = 0.06 + 0.27 * squash;
        }
        for (const q of live.crumbles) {
          const target = q.up ? q.base : q.base - 1.6;
          q.mesh.position.y += (target - q.mesh.position.y) * (q.up ? 0.15 : 0.08);
          q.mesh.material.opacity = Math.min(1, Math.max(0, 1 + (q.mesh.position.y - q.base) / 1.2));
          q.mesh.visible = q.mesh.material.opacity > 0.02;
        }
        for (const tr of live.traps) {
          const t = (now - tr.at) / 700;
          const shut = t < 1 ? Math.sin(Math.min(1, t * 3) * Math.PI / 2) * (t < 0.6 ? 1 : (1 - t) / 0.4) : 0;
          tr.obj.userData.jaws.forEach((j, i) => { j.rotation.x = (i ? 1 : -1) * 1.2 * (1 - shut) + Math.sin(now / 500 + i) * 0.05; });
        }
        for (const sw of live.switches) sw.button.scale.y += ((sw.pressed ? 0.3 : 1) - sw.button.scale.y) * 0.3;
        for (const q of live.pblocks) {
          // Blink when the blocks are about to vanish again.
          const blink = q.on && pTimer <= 2 && Math.sin(now / 70) > 0;
          q.solid.visible = q.on;
          q.solid.material.opacity = blink ? 0.45 : 1;
          q.outline.visible = !q.on;
        }
        live.keys.forEach((k, i) => { k.mesh.rotation.y = now / 500 + i; k.mesh.position.y = k.base + 0.4 + Math.sin(now / 350 + i) * 0.05; });
      }
      for (const parts of [live, prevParts]) if (parts) animateHearts(parts.hearts, now);
      const mine = players[you];
      marker.visible = !!mine;
      marker.visible = !!mine && mine.obj.visible && !mine.warp;
      if (mine) marker.position.set(mine.obj.position.x, mine.obj.position.y + HEAD[you] + 0.5 + Math.sin(now / 250) * 0.06, mine.obj.position.z);

      // Glide the camera towards the current area (or the players in it).
      followPlayers(current);
      cam.target.lerp(cam.goal.target, 0.06);
      cam.hw += (cam.goal.hw - cam.hw) * 0.06;
      cam.hh += (cam.goal.hh - cam.hh) * 0.06;
      camera.position.copy(cam.target).addScaledVector(DIR, 40);
      camera.lookAt(cam.target);
      if (safe) {
        // Fit the world into the free part of the screen (between the
        // floating joypads, under the title) and centre it there.
        const u = Math.max((2 * cam.hw) / (safe.x1 - safe.x0), (2 * cam.hh) / (safe.y1 - safe.y0));
        const cx = (safe.x0 + safe.x1) / 2;
        const cy = (safe.y0 + safe.y1) / 2;
        Object.assign(camera, { left: -cx * u, right: (cam.w - cx) * u, top: cy * u, bottom: -(cam.h - cy) * u });
      } else {
        let halfW = cam.hw, halfH = cam.hh;
        if (halfW / halfH > cam.aspect) halfH = halfW / cam.aspect; else halfW = halfH * cam.aspect;
        Object.assign(camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
      }
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);
  }
  resize();
  requestAnimationFrame(animate);
  window.addEventListener('resize', resize);

  return { update, bump, resize, setSafeArea };
}
