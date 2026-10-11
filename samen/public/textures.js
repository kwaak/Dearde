// Procedural textures for the Samen world, painted on canvases at start-up
// so the game needs no image files. Each texture is also used as its own
// bump map, which gives planks, bricks and pebbles a little relief.
import * as THREE from './vendor/three.module.min.js';

const cache = new Map();

// Older browsers lack roundRect on canvases; square corners will do there.
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
}

// Small deterministic random generator, so every load looks the same.
function rng(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
function shade(color, amount) {
  const c = new THREE.Color(color);
  c.offsetHSL(0, 0, amount);
  return '#' + c.getHexString();
}

function make(key, size, draw, { repeat = 1 } = {}) {
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size, rng([...key].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7)));
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.anisotropy = 4;
  const bump = new THREE.CanvasTexture(canvas);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(repeat, repeat);
  const tex = { map, bump };
  cache.set(key, tex);
  return tex;
}

// ---------- Painting helpers ----------

function speckle(ctx, s, rand, colors, count, min, max) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    const r = min + rand() * (max - min);
    ctx.beginPath();
    ctx.ellipse(rand() * s, rand() * s, r, r * (0.6 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function bricks(ctx, s, rand, base, mortar, rows, cols, jitter) {
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, s, s);
  const h = s / rows;
  const w = s / cols;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? w / 2 : 0;
    for (let c = -1; c <= cols; c++) {
      ctx.fillStyle = shade(base, (rand() - 0.5) * jitter);
      const x = c * w + off + 2;
      const y = r * h + 2;
      ctx.beginPath();
      ctx.roundRect(x, y, w - 4, h - 4, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.fillRect(x + 2, y + 1, w - 8, 2);
    }
  }
}

function grain(ctx, s, rand, color, lines, vertical) {
  ctx.strokeStyle = color;
  for (let i = 0; i < lines; i++) {
    ctx.lineWidth = 0.6 + rand() * 1.2;
    ctx.globalAlpha = 0.25 + rand() * 0.35;
    const p = rand() * s;
    ctx.beginPath();
    for (let t = 0; t <= s; t += 8) {
      const wobble = Math.sin(t / (14 + rand() * 6) + i) * 2;
      if (vertical) ctx.lineTo(p + wobble, t); else ctx.lineTo(t, p + wobble);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function planks(ctx, s, rand, base, count, vertical) {
  const w = s / count;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = shade(base, (rand() - 0.5) * 0.08);
    if (vertical) ctx.fillRect(i * w, 0, w, s); else ctx.fillRect(0, i * w, s, w);
  }
  grain(ctx, s, rand, shade(base, -0.18), count * 7, vertical);
  ctx.fillStyle = shade(base, -0.25);
  for (let i = 1; i < count; i++) {
    if (vertical) ctx.fillRect(i * w - 1.5, 0, 3, s); else ctx.fillRect(0, i * w - 1.5, s, 3);
  }
}

function heartPath(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.6, y - r * 1.2, x, y - r * 0.4);
  ctx.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  ctx.fill();
}

function cracks(ctx, s, rand, color) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    let x = s * (0.2 + rand() * 0.6);
    let y = s * (0.2 + rand() * 0.6);
    ctx.lineWidth = 3 - i * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rand() - 0.5) * s * 0.3;
      y += (rand() - 0.5) * s * 0.3;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// ---------- Zone floors and walls ----------

const FLOORS = {
  tuin(ctx, s, rand, v) {
    ctx.fillStyle = v ? '#e4f2cc' : '#ecf6d8';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#9bcf7a';
    for (let i = 0; i < 90; i++) {
      const x = rand() * s, y = rand() * s;
      ctx.globalAlpha = 0.35 + rand() * 0.4;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 6, y - 5 - rand() * 6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 5; i++) {
      const x = rand() * s, y = rand() * s;
      ctx.fillStyle = ['#ffffff', '#ffd1e0', '#fff1a8'][i % 3];
      for (let p = 0; p < 5; p++) {
        ctx.beginPath();
        ctx.arc(x + Math.cos(p * 1.26) * 3, y + Math.sin(p * 1.26) * 3, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffc94d';
      ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  },
  ijs(ctx, s, rand, v) {
    ctx.fillStyle = v ? '#eaf1fd' : '#f5f9ff';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rand, ['rgba(160,190,230,.25)', 'rgba(200,220,245,.35)'], 60, 2, 9);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 25; i++) ctx.fillRect(rand() * s, rand() * s, 1.5, 1.5);
  },
  grot(ctx, s, rand, v) {
    ctx.fillStyle = v ? '#e3d3bd' : '#ecdfcc';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rand, ['rgba(140,110,85,.18)', 'rgba(180,150,120,.25)'], 80, 1, 4);
    speckle(ctx, s, rand, ['#c9b49b', '#b9a286', '#d8c6ad'], 12, 3, 7);
  },
  meer(ctx, s, rand, v) {
    ctx.fillStyle = v ? '#f6e3c2' : '#fcefd6';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rand, ['rgba(190,150,100,.3)', 'rgba(255,255,255,.5)'], 220, 0.6, 1.4);
    ctx.strokeStyle = 'rgba(200,160,110,.25)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const y = rand() * s;
      for (let x = 0; x <= s; x += 6) ctx.lineTo(x, y + Math.sin(x / 10 + i) * 2);
      ctx.stroke();
    }
  },
  kasteel(ctx, s, rand, v) {
    ctx.fillStyle = '#bdb6c8';
    ctx.fillRect(0, 0, s, s);
    const pts = [[0, 0, s / 2, s / 2], [s / 2, 0, s / 2, s / 2], [0, s / 2, s / 2, s / 2], [s / 2, s / 2, s / 2, s / 2]];
    for (const [x, y, w, h] of pts) {
      ctx.fillStyle = shade(v ? '#e2dbe9' : '#ece7f1', (rand() - 0.5) * 0.06);
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 5);
      ctx.fill();
    }
    speckle(ctx, s, rand, ['rgba(120,110,140,.15)'], 40, 1, 3);
  },
  hart(ctx, s, rand, v) {
    ctx.fillStyle = '#f6c6d6';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = v ? '#fde3ec' : '#ffeef4';
    ctx.beginPath(); ctx.roundRect(3, 3, s - 6, s - 6, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,120,160,.35)';
    heartPath(ctx, s * 0.22, s * 0.24, s * 0.07);
    heartPath(ctx, s * 0.76, s * 0.74, s * 0.05);
  },
};

const WALLS = {
  tuin(ctx, s, rand, top) {
    ctx.fillStyle = top ? '#78c97c' : '#56a85c';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rand, top ? ['#8fd98f', '#6cbd70', '#a5e3a0'] : ['#4a9a51', '#68bb6c', '#3f8c47', '#7acb7a'], 260, 3, 8);
    if (top) speckle(ctx, s, rand, ['#ffd1e0', '#ffffff'], 6, 2, 3);
  },
  ijs(ctx, s, rand, top) {
    if (top) {
      ctx.fillStyle = '#d9ebff';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, rand, ['#ffffff', '#c6defa'], 40, 3, 10);
      return;
    }
    bricks(ctx, s, rand, '#8fb8e8', '#cfe2f8', 3, 2, 0.08);
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const x = rand() * s, y = rand() * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 10, y - 10); ctx.stroke();
    }
  },
  grot(ctx, s, rand, top) {
    ctx.fillStyle = top ? '#a4907e' : '#86705f';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rand, top ? ['#b29e8c', '#978270', '#c0ad9a'] : ['#79624f', '#957f6d', '#6b5646', '#a18a77'], 70, 6, 16);
    if (!top) cracks(ctx, s, rand, 'rgba(60,45,35,.5)');
  },
  meer(ctx, s, rand, top) {
    if (top) { planks(ctx, s, rand, '#b98652', 4, false); return; }
    planks(ctx, s, rand, '#4f9fb8', 4, true);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(0, s * 0.12, s, 4);
  },
  kasteel(ctx, s, rand, top) {
    if (top) {
      ctx.fillStyle = '#b4afc2';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#c4bfd1';
      ctx.beginPath(); ctx.roundRect(5, 5, s - 10, s - 10, 6); ctx.fill();
      speckle(ctx, s, rand, ['rgba(90,85,110,.2)'], 30, 1, 3);
      return;
    }
    bricks(ctx, s, rand, '#8f8a9e', '#6f6a7e', 4, 2, 0.1);
  },
  hart(ctx, s, rand, top) {
    if (top) {
      ctx.fillStyle = '#e584ae';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      heartPath(ctx, s / 2, s / 2, s * 0.14);
      return;
    }
    bricks(ctx, s, rand, '#c95f8f', '#f0a4c4', 3, 2, 0.08);
  },
};

export function floorTex(zone, variant) {
  return make(`floor-${zone}-${variant}`, 128, (ctx, s, rand) => FLOORS[zone](ctx, s, rand, variant));
}

export function crackedTex(zone) {
  return make(`cracked-${zone}`, 128, (ctx, s, rand) => {
    FLOORS[zone](ctx, s, rand, 1);
    ctx.fillStyle = 'rgba(120,90,60,.12)';
    ctx.fillRect(0, 0, s, s);
    cracks(ctx, s, rand, '#6e5442');
  });
}

export function wallTex(zone, top) {
  return make(`wall-${zone}-${top ? 'top' : 'side'}`, 128, (ctx, s, rand) => WALLS[zone](ctx, s, rand, top));
}

// ---------- Objects ----------

export function crateTex() {
  return make('crate', 256, (ctx, s, rand) => {
    planks(ctx, s, rand, '#c98b52', 4, false);
    const b = s * 0.12;
    ctx.fillStyle = '#9c6534';
    ctx.fillRect(0, 0, s, b); ctx.fillRect(0, s - b, s, b);
    ctx.fillRect(0, 0, b, s); ctx.fillRect(s - b, 0, b, s);
    grain(ctx, s, rand, '#7a4b24', 10, false);
    ctx.save();
    ctx.translate(s / 2, s / 2);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#a86f3c';
    ctx.fillRect(-s * 0.62, -b / 2, s * 1.24, b);
    ctx.strokeStyle = '#7a4b24';
    ctx.lineWidth = 2;
    ctx.strokeRect(-s * 0.62, -b / 2, s * 1.24, b);
    ctx.restore();
    ctx.fillStyle = '#5b5c66';
    for (const x of [b / 2, s - b / 2]) for (const y of [b / 2, s - b / 2]) {
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }
  });
}

export function plankTex() {
  return make('plank', 128, (ctx, s, rand) => planks(ctx, s, rand, '#b98652', 3, true));
}

export function iceTex() {
  return make('ice', 128, (ctx, s, rand) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#d8efff'); g.addColorStop(1, '#bfe0fb');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    for (let i = 0; i < 7; i++) {
      ctx.lineWidth = 1 + rand() * 2;
      const x = rand() * s;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - s * 0.4, s); ctx.stroke();
    }
    speckle(ctx, s, rand, ['rgba(255,255,255,.6)'], 12, 1, 3);
  });
}

export function waterTex() {
  return make('water', 128, (ctx, s, rand) => {
    ctx.fillStyle = '#3d9ad6';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const y = rand() * s;
      const x = rand() * s;
      ctx.beginPath();
      for (let t = 0; t < 28; t += 2) ctx.lineTo(x + t, y + Math.sin(t / 4) * 2);
      ctx.stroke();
    }
    speckle(ctx, s, rand, ['rgba(120,200,255,.35)', 'rgba(20,90,160,.3)'], 30, 4, 10);
  }, { repeat: 1 });
}

export function doorTex(color) {
  return make('door-' + color, 128, (ctx, s) => {
    ctx.fillStyle = shade(color, -0.12);
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = hex(color);
    ctx.beginPath(); ctx.roundRect(10, 10, s - 20, s - 20, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    for (let y = 22; y < s - 20; y += 18) ctx.fillRect(18, y, s - 36, 7);
    ctx.fillStyle = shade(color, -0.25);
    for (const x of [16, s - 16]) for (const y of [16, s - 16]) {
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
  });
}

export function lockDoorTex() {
  return make('lockdoor', 128, (ctx, s, rand) => {
    planks(ctx, s, rand, '#9a7a5a', 4, true);
    ctx.fillStyle = '#5b5c66';
    for (const y of [s * 0.2, s * 0.72]) {
      ctx.fillRect(0, y, s, 10);
      ctx.fillStyle = '#7d7f8c';
      for (let x = 8; x < s; x += 22) { ctx.beginPath(); ctx.arc(x, y + 5, 2.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#5b5c66';
    }
  });
}

export function plateTex(color) {
  return make('plate-' + color, 128, (ctx, s) => {
    const g = ctx.createRadialGradient(s * 0.4, s * 0.4, 4, s / 2, s / 2, s / 2);
    g.addColorStop(0, shade(color, 0.18)); g.addColorStop(1, shade(color, -0.08));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.32, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.18, 0, Math.PI * 2); ctx.stroke();
  });
}

// A soft studio-like environment, so gloss, gold and ice catch some light.
export function environment(renderer) {
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'varying vec3 p; void main(){ float h = normalize(p).y * .5 + .5; gl_FragColor = vec4(mix(vec3(.72,.62,.86), vec3(1.,.96,.93), h), 1.); }',
    }),
  );
  env.add(sky);
  for (const [x, y, z] of [[4, 6, 3], [-5, 4, -2]]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    env.add(panel);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  return tex;
}
