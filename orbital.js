/* =========================================================================
   ORBITAL SANDBOX — orbital.js (v5.1 Patch)
   N-body gravity simulation with collisions, trails, presets, and export.
   ========================================================================= */

(function () {
  "use strict";

  /* =======================================================================
     DOM
     ======================================================================= */
  const canvas         = document.getElementById("orbitCanvas");
  const ctx            = canvas.getContext("2d");
  const btnPlayPause   = document.getElementById("btnPlayPause");
  const playbackChip   = document.getElementById("playbackChip");
  const bodyChip       = document.getElementById("bodyChip");
  const canvasHint     = document.getElementById("canvasHint");

  const bodyType       = document.getElementById("bodyType");
  const spawnMass      = document.getElementById("spawnMass");
  const valSpawnMass   = document.getElementById("valSpawnMass");
  const orbitAssist    = document.getElementById("orbitAssist");
  const btnPresetSolar = document.getElementById("btnPresetSolar");
  const btnPresetBinary= document.getElementById("btnPresetBinary");
  const btnPresetChaos = document.getElementById("btnPresetChaos");

  const speed          = document.getElementById("speed");
  const gravityStrength= document.getElementById("gravityStrength");
  const collisionMode  = document.getElementById("collisionMode");
  const trailLength    = document.getElementById("trailLength");

  const showVectors    = document.getElementById("showVectors");
  const showStarfield  = document.getElementById("showStarfield");
  const showParticles  = document.getElementById("showParticles");
  const btnClearAll    = document.getElementById("btnClearAll");
  const btnDeleteSelected = document.getElementById("btnDeleteSelected");

  const exportScale    = document.getElementById("exportScale");
  const exportName     = document.getElementById("exportName");

  const presetList     = document.getElementById("presetList");
  const btnSavePreset  = document.getElementById("btnSavePreset");
  const btnLoadPreset  = document.getElementById("btnLoadPreset");
  const btnDeletePreset= document.getElementById("btnDeletePreset");

  const btnExportPng   = document.getElementById("btnExportPng");
  const btnExportJpg   = document.getElementById("btnExportJpg");
  const btnRecenter    = document.getElementById("btnRecenter");

  /* =======================================================================
     CANVAS SIZING
     ======================================================================= */
  let cw = 0, ch = 0;
  let dpr = window.devicePixelRatio || 1;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const newDpr = window.devicePixelRatio || 1;
    const newCw = rect.width;
    const newCh = rect.height;
    if (newCw === cw && newCh === ch && newDpr === dpr) return;
    dpr = newDpr;
    cw = newCw;
    ch = newCh;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStarfield();
  }

  window.addEventListener("resize", resizeCanvas);

  /* =======================================================================
     BODY TYPES
     ======================================================================= */
  const BODY_TYPES = {
    // ---- Star ----
    star: {
      baseMass: 30, radiusFactor: 3.2,
      color: "#ffb347", glow: "#ffd257", isStar: true
    },

    // ---- Planets ----
    planet_terrestrial: {
      baseMass: 5, radiusFactor: 2.2,
      color: "#4d8dff", glow: "#2a5fc0"
    },
    planet_ocean: {
      baseMass: 6, radiusFactor: 2.4,
      color: "#2060c0", glow: "#1a4a90"
    },
    planet_desert: {
      baseMass: 7, radiusFactor: 2.6,
      color: "#d89050", glow: "#8a5020"
    },
    planet_ice: {
      baseMass: 4, radiusFactor: 2.4,
      color: "#c8e8ff", glow: "#6ab0e0"
    },
    planet_lava: {
      baseMass: 5, radiusFactor: 2.4,
      color: "#3a1810", glow: "#ff5020", isLava: true
    },
    planet_gas: {
      baseMass: 18, radiusFactor: 4.0,
      color: "#e0b878", glow: "#a87c3a"
    },
    planet_super: {
      baseMass: 45, radiusFactor: 6.0,
      color: "#c08850", glow: "#7a4020"
    },

    // ---- Small bodies ----
    moon: {
      baseMass: 0.5, radiusFactor: 1.8,
      color: "#c0c5d4", glow: "#8b90a6"
    },
    asteroid: {
      baseMass: 0.1, radiusFactor: 1.2,
      color: "#a89070", glow: "#5a4d38"
    },
    comet: {
      baseMass: 0.3, radiusFactor: 1.4,
      color: "#a8e0ff", glow: "#7fb0ff", isComet: true
    },

    // ---- Exotic ----
    blackhole: {
      baseMass: 40, radiusFactor: 3.4,
      color: "#0a0212", glow: "#a020f0", isBlackhole: true
    }
  };

  // Alias so old saved scenes still resolve
  BODY_TYPES.planet = BODY_TYPES.planet_terrestrial;

  /* =======================================================================
     STATE
     ======================================================================= */
  let bodies = [];
  let particles = [];
  let starfield = [];
  let running = true;
  let lastTs = 0;
  let nextId = 1;
  let camera = { x: 0, y: 0 };

  /* =======================================================================
     STARFIELD
     ======================================================================= */
  function buildStarfield() {
    starfield = [];
    const count = Math.round((cw * ch) / 3500);
    for (let i = 0; i < count; i++) {
      starfield.push({
        x: Math.random() * cw,
        y: Math.random() * ch,
        r: Math.random() * 1.1 + 0.15,
        a: Math.random() * 0.55 + 0.15,
        tw: Math.random() * Math.PI * 2
      });
    }
  }

  /* =======================================================================
     TRAIL RING BUFFER
     ======================================================================= */
  function ensureTrailCapacity(body, cap) {
    if (body.trailCap === cap) return;
    if (cap === 0) {
      body.trail = null;
      body.trailCap = 0;
      body.trailHead = 0;
      body.trailCount = 0;
      return;
    }
    const newBuf = new Float32Array(cap * 2);
    if (body.trail && body.trailCount > 0) {
      const keep = Math.min(body.trailCount, cap);
      const oldCap = body.trailCap;
      const oldHead = body.trailHead;
      for (let i = 0; i < keep; i++) {
        const srcIdx = ((oldHead - keep + i) % oldCap + oldCap) % oldCap;
        newBuf[i * 2]     = body.trail[srcIdx * 2];
        newBuf[i * 2 + 1] = body.trail[srcIdx * 2 + 1];
      }
      body.trail = newBuf;
      body.trailHead = keep % cap;
      body.trailCount = keep;
    } else {
      body.trail = newBuf;
      body.trailHead = 0;
      body.trailCount = 0;
    }
    body.trailCap = cap;
  }

  function pushTrailPoint(body, x, y) {
    if (!body.trail || body.trailCap === 0) return;
    const idx = body.trailHead * 2;
    body.trail[idx]     = x;
    body.trail[idx + 1] = y;
    body.trailHead = (body.trailHead + 1) % body.trailCap;
    if (body.trailCount < body.trailCap) body.trailCount++;
  }

  /* =======================================================================
     BODY CREATION
     ======================================================================= */
  function createBody(x, y, vx, vy, type, mass) {
    const t = BODY_TYPES[type] || BODY_TYPES.planet_terrestrial;
    const m = Math.max(0.01, mass !== undefined ? mass : t.baseMass);
    const radius = Math.pow(m, 0.35) * t.radiusFactor + 2;
    const cap = parseInt(trailLength.value, 10) || 0;
    const body = {
      id: nextId++,
      x, y, vx, vy,
      mass: m,
      radius,
      type,
      color: t.color,
      glow: t.glow,
      isStar: !!t.isStar,
      isComet: !!t.isComet,
      isBlackhole: !!t.isBlackhole,
      isLava: !!t.isLava,
      trail: null,
      trailCap: 0,
      trailHead: 0,
      trailCount: 0,
      selected: false,
      age: 0
    };
    ensureTrailCapacity(body, cap);
    return body;
  }

  /* =======================================================================
     CANVAS ↔ WORLD COORDS
     ======================================================================= */
  function canvasToWorld(cx, cy) {
    return { x: cx - cw / 2 + camera.x, y: cy - ch / 2 + camera.y };
  }
  function worldToCanvas(wx, wy) {
    return { x: wx + cw / 2 - camera.x, y: wy + ch / 2 - camera.y };
  }

  /* =======================================================================
     PHYSICS
     ======================================================================= */
  function physicsStep(dt) {
    const G = parseFloat(gravityStrength.value) * 10;
    const n = bodies.length;

    for (let i = 0; i < n; i++) {
      bodies[i].ax = 0;
      bodies[i].ay = 0;
    }

    if (G > 0) {
      const soft = 25;
      for (let i = 0; i < n; i++) {
        const a = bodies[i];
        for (let j = i + 1; j < n; j++) {
          const b = bodies[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy + soft;
          const invDist = 1 / Math.sqrt(distSq);
          const invDist3 = invDist * invDist * invDist;
          const force = G * invDist3;

          a.ax += force * b.mass * dx;
          a.ay += force * b.mass * dy;
          b.ax -= force * a.mass * dx;
          b.ay -= force * a.mass * dy;
        }
      }
    }

    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      b.vx += b.ax * dt;
      b.vy += b.ay * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.age += dt;
    }

    handleCollisions();

    const FAR = 8000;
    bodies = bodies.filter(b => Math.abs(b.x) < FAR && Math.abs(b.y) < FAR);
  }

  function handleCollisions() {
    const mode = collisionMode.value;
    if (mode === "none") return;

    if (mode === "bounce") {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i];
          const b = bodies[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy;
          const minDist = a.radius + b.radius;
          if (distSq < minDist * minDist && distSq > 0.0001) {
            bounceBodies(a, b, dx, dy, Math.sqrt(distSq));
          }
        }
      }
      return;
    }

    let passes = 0;
    const maxPasses = 8;

    while (passes < maxPasses) {
      passes++;
      let didMerge = false;

      for (let i = 0; i < bodies.length && !didMerge; i++) {
        for (let j = i + 1; j < bodies.length && !didMerge; j++) {
          const a = bodies[i];
          const b = bodies[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy;
          const minDist = a.radius + b.radius;

          if (distSq < minDist * minDist && distSq > 0.0001) {
            mergeBodies(a, b);
            didMerge = true;
          }
        }
      }

      if (!didMerge) break;
    }
  }

  function mergeBodies(a, b) {
    const totalMass = a.mass + b.mass;
    const newVx = (a.vx * a.mass + b.vx * b.mass) / totalMass;
    const newVy = (a.vy * a.mass + b.vy * b.mass) / totalMass;
    const newX = (a.x * a.mass + b.x * b.mass) / totalMass;
    const newY = (a.y * a.mass + b.y * b.mass) / totalMass;

    const winner = a.mass >= b.mass ? a : b;
    let type = winner.type;
    let color = winner.color;
    let glow = winner.glow;
    let isStar = winner.isStar;
    let isBlackhole = winner.isBlackhole;

    if (a.isBlackhole || b.isBlackhole) {
      type = "blackhole";
      color = BODY_TYPES.blackhole.color;
      glow = BODY_TYPES.blackhole.glow;
      isStar = false;
      isBlackhole = true;
    } else if (a.isStar || b.isStar) {
      const starObj = a.isStar ? a : b;
      type = starObj.type;
      color = starObj.color;
      glow = starObj.glow;
      isStar = true;
      isBlackhole = false;
    }

    const radius = Math.pow(totalMass, 0.35) *
                   (BODY_TYPES[type] ? BODY_TYPES[type].radiusFactor : 2.2) + 2;

    const cap = parseInt(trailLength.value, 10) || 0;
    const survivor = {
      id: nextId++,
      x: newX, y: newY,
      vx: newVx, vy: newVy,
      mass: totalMass,
      radius,
      type, color, glow, isStar,
      isComet: false,
      isBlackhole,
      isLava: !!winner.isLava,
      trail: null,
      trailCap: 0,
      trailHead: 0,
      trailCount: 0,
      selected: false,
      age: Math.max(a.age, b.age)
    };
    ensureTrailCapacity(survivor, cap);

    if (showParticles.value === "on") {
      spawnSparks(newX, newY, Math.min(30, 6 + Math.round(Math.sqrt(totalMass) * 2)),
        winner.color || "#ffffff");
    }

    bodies = bodies.filter(x => x !== a && x !== b);
    bodies.push(survivor);
  }

  function bounceBodies(a, b, dx, dy, dist) {
    const nx = dx / dist;
    const ny = dy / dist;
    const dvx = b.vx - a.vx;
    const dvy = b.vy - a.vy;
    const dvn = dvx * nx + dvy * ny;
    if (dvn > 0) return;

    const m1 = a.mass, m2 = b.mass;
    const impulse = -2 * dvn / (1 / m1 + 1 / m2);

    a.vx -= impulse / m1 * nx;
    a.vy -= impulse / m1 * ny;
    b.vx += impulse / m2 * nx;
    b.vy += impulse / m2 * ny;

    const overlap = (a.radius + b.radius) - dist;
    if (overlap > 0) {
      const push = overlap / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
    }
  }

  /* =======================================================================
     PARTICLES
     ======================================================================= */
  function spawnSparks(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 120;
      particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 1.0,
        color: color || "#ffffff",
        size: 1 + Math.random() * 2
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt * 1.2;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  /* =======================================================================
     TRAILS
     ======================================================================= */
  let lastTrailCap = -1;

  function updateTrails() {
    const cap = parseInt(trailLength.value, 10) || 0;

    if (cap !== lastTrailCap) {
      lastTrailCap = cap;
      for (const b of bodies) ensureTrailCapacity(b, cap);
    }

    if (cap === 0) return;
    for (const b of bodies) pushTrailPoint(b, b.x, b.y);
  }

  /* =======================================================================
     RENDERING
     ======================================================================= */
  let twinkle = 0;

  function render(dt) {
    ctx.fillStyle = "#02030a";
    ctx.fillRect(0, 0, cw, ch);

    if (showStarfield.value === "on") {
      twinkle += dt;
      for (const s of starfield) {
        const a = s.a + Math.sin(twinkle * 1.5 + s.tw) * 0.15;
        ctx.fillStyle = `rgba(220, 225, 245, ${Math.max(0.05, a)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const b of bodies) {
      if (!b.trail || b.trailCount < 1) continue;
      const cap = b.trailCap;
      const head = b.trailHead;
      const count = b.trailCount;
      const startIdx = ((head - count) % cap + cap) % cap;

      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const idx = ((startIdx + i) % cap) * 2;
        const wx = b.trail[idx];
        const wy = b.trail[idx + 1];
        const p = worldToCanvas(wx, wy);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      const curP = worldToCanvas(b.x, b.y);
      ctx.lineTo(curP.x, curP.y);

      ctx.strokeStyle = hexAlpha(b.glow, 0.35);
      ctx.lineWidth = Math.max(1, Math.min(3, b.radius * 0.4));
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    for (const b of bodies) {
      const p = worldToCanvas(b.x, b.y);
      if (p.x < -b.radius * 6 || p.x > cw + b.radius * 6 ||
          p.y < -b.radius * 6 || p.y > ch + b.radius * 6) continue;

      if (b.isStar || b.isBlackhole || b.isLava) {
        const glowR = b.radius * (b.isBlackhole ? 5 : b.isLava ? 3 : 4);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
        grad.addColorStop(0, hexAlpha(b.glow, 0.6));
        grad.addColorStop(0.4, hexAlpha(b.glow, 0.18));
        grad.addColorStop(1, hexAlpha(b.glow, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
        ctx.fill();
      }

      if (b.isComet && (Math.abs(b.vx) + Math.abs(b.vy)) > 2) {
        const ang = Math.atan2(-b.vy, -b.vx);
        const len = Math.min(80, b.radius * 15);
        const gx = p.x + Math.cos(ang) * len;
        const gy = p.y + Math.sin(ang) * len;
        const grad = ctx.createLinearGradient(p.x, p.y, gx, gy);
        grad.addColorStop(0, hexAlpha("#a8e0ff", 0.7));
        grad.addColorStop(1, hexAlpha("#a8e0ff", 0));
        ctx.strokeStyle = grad;
        ctx.lineWidth = b.radius * 0.9;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(gx, gy);
        ctx.stroke();
      }

      if (b.isBlackhole) {
        const ringR = b.radius * 1.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = hexAlpha(b.glow, 0.7);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      const grad2 = ctx.createRadialGradient(
        p.x - b.radius * 0.3, p.y - b.radius * 0.3, b.radius * 0.1,
        p.x, p.y, b.radius
      );
      grad2.addColorStop(0, lighten(b.color, 25));
      grad2.addColorStop(1, b.color);

      ctx.fillStyle = grad2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, b.radius, 0, Math.PI * 2);
      ctx.fill();

      if (b.selected) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, b.radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffd257";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (showVectors.value === "on") {
        const vLen = Math.min(80, Math.sqrt(b.vx * b.vx + b.vy * b.vy) * 0.35);
        if (vLen > 2) {
          const ux = b.vx / Math.sqrt(b.vx * b.vx + b.vy * b.vy);
          const uy = b.vy / Math.sqrt(b.vx * b.vx + b.vy * b.vy);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + ux * vLen, p.y + uy * vLen);
          ctx.strokeStyle = hexAlpha("#ffffff", 0.5);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    if (dragState.active && dragState.moved) {
      const p1 = worldToCanvas(dragState.startWorld.x, dragState.startWorld.y);
      const p2 = worldToCanvas(dragState.currentWorld.x, dragState.currentWorld.y);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = hexAlpha("#7fb0ff", 0.7);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#7fb0ff";
      ctx.fill();
    }

    for (const p of particles) {
      const q = worldToCanvas(p.x, p.y);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function hexAlpha(hex, a) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function lighten(hex, amt) {
    const h = hex.replace("#", "");
    let r = parseInt(h.substring(0, 2), 16);
    let g = parseInt(h.substring(2, 4), 16);
    let b = parseInt(h.substring(4, 6), 16);
    r = Math.min(255, r + amt);
    g = Math.min(255, g + amt);
    b = Math.min(255, b + amt);
    return `rgb(${r},${g},${b})`;
  }

  /* =======================================================================
     INPUT
     ======================================================================= */
  const dragState = {
    active: false,
    moved: false,
    startCanvas: { x: 0, y: 0 },
    startWorld: { x: 0, y: 0 },
    currentWorld: { x: 0, y: 0 },
    startTime: 0
  };

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const p = pointerPos(e);
    const w = canvasToWorld(p.x, p.y);
    dragState.active = true;
    dragState.moved = false;
    dragState.startCanvas = p;
    dragState.startWorld = w;
    dragState.currentWorld = w;
    dragState.startTime = performance.now();
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragState.active) return;
    const p = pointerPos(e);
    const w = canvasToWorld(p.x, p.y);
    dragState.currentWorld = w;
    const dx = p.x - dragState.startCanvas.x;
    const dy = p.y - dragState.startCanvas.y;
    if (dx * dx + dy * dy > 100) dragState.moved = true;
  });

  canvas.addEventListener("pointerup", (e) => {
    if (!dragState.active) return;
    dragState.active = false;

    const type = bodyType.value;
    const mass = parseFloat(spawnMass.value);

    if (dragState.moved) {
      const dx = dragState.currentWorld.x - dragState.startWorld.x;
      const dy = dragState.currentWorld.y - dragState.startWorld.y;

      let mult = 1.5;
      const target = findStrongestAttractor(dragState.startWorld);
      if (target) {
        const G = parseFloat(gravityStrength.value) * 10;
        const dxA = dragState.startWorld.x - target.x;
        const dyA = dragState.startWorld.y - target.y;
        const dist = Math.max(30, Math.sqrt(dxA * dxA + dyA * dyA));
        const circularV = Math.sqrt(G * target.mass / dist);
        mult = Math.max(0.8, Math.min(10, circularV / 80));
      }
      const vx = dx * mult;
      const vy = dy * mult;

      bodies.push(createBody(dragState.startWorld.x, dragState.startWorld.y, vx, vy, type, mass));
      announceFirstPlacement();
    } else {
      const hitBody = bodyAtPoint(dragState.startWorld.x, dragState.startWorld.y);
      const hadSelection = bodies.some(b => b.selected);

      if (hitBody) {
        for (const b of bodies) b.selected = false;
        hitBody.selected = true;
      } else if (hadSelection) {
        // Deselect current body on empty space click instead of accidental spawning
        for (const b of bodies) b.selected = false;
      } else {
        const assist = orbitAssist.value === "on";
        let vx = 0, vy = 0;
        if (assist) {
          const target = findStrongestAttractor(dragState.startWorld);
          if (target) {
            const dx = dragState.startWorld.x - target.x;
            const dy = dragState.startWorld.y - target.y;
            const r = Math.sqrt(dx * dx + dy * dy);
            if (r > 1) {
              const G = parseFloat(gravityStrength.value) * 10;
              const spd = Math.sqrt(G * target.mass / r);
              // Relative velocity patch: add attractor's vx/vy
              vx = target.vx + (-dy / r) * spd;
              vy = target.vy + (dx / r) * spd;
            }
          }
        }
        bodies.push(createBody(dragState.startWorld.x, dragState.startWorld.y, vx, vy, type, mass));
        announceFirstPlacement();
      }
    }

    updateBodyChip();
  });

  canvas.addEventListener("pointercancel", () => {
    dragState.active = false;
  });

  function bodyAtPoint(wx, wy) {
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      const dx = b.x - wx;
      const dy = b.y - wy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < b.radius + 12) return b;
    }
    return null;
  }

  function findStrongestAttractor(worldPos) {
    let best = null;
    let bestScore = 0;
    for (const b of bodies) {
      if (b.mass <= 0) continue;
      const dx = worldPos.x - b.x;
      const dy = worldPos.y - b.y;
      const r2 = dx * dx + dy * dy;
      if (r2 < 1) continue;
      const score = b.mass / r2;
      if (score > bestScore) { bestScore = score; best = b; }
    }
    return best;
  }

  let firstPlacementDone = false;
  function announceFirstPlacement() {
    if (firstPlacementDone) return;
    firstPlacementDone = true;
    canvasHint.classList.add("hidden");
  }

  /* =======================================================================
     PLAY/PAUSE
     ======================================================================= */
  function updatePlaybackUI() {
    const spd = parseFloat(speed.value);
    if (running && spd > 0) {
      playbackChip.textContent = `Playing · ${spd}x`;
      playbackChip.classList.remove("paused");
      btnPlayPause.textContent = "Pause";
    } else {
      playbackChip.textContent = `Paused · ${spd}x`;
      playbackChip.classList.add("paused");
      btnPlayPause.textContent = "Play";
    }
  }

  btnPlayPause.addEventListener("click", () => {
    const spd = parseFloat(speed.value);
    if (!running || spd === 0) {
      running = true;
      if (spd === 0) speed.value = "1";
    } else {
      running = false;
    }
    updatePlaybackUI();
  });

  speed.addEventListener("change", () => {
    if (parseFloat(speed.value) > 0) {
      running = true;
    } else {
      running = false;
    }
    updatePlaybackUI();
  });

  /* =======================================================================
     BODY CHIP
     ======================================================================= */
  function updateBodyChip() {
    bodyChip.textContent = `${bodies.length} bod${bodies.length === 1 ? "y" : "ies"}`;
  }

  /* =======================================================================
     PRESETS
     ======================================================================= */
  function clearAll(silent) {
    if (!silent) {
      if (!confirm("Clear all bodies?")) return;
    }
    bodies = [];
    particles = [];
    camera.x = 0;
    camera.y = 0;
    updateBodyChip();
    firstPlacementDone = false;
    canvasHint.classList.remove("hidden");
  }

  function loadSolar() {
    clearAll(true);
    const G = parseFloat(gravityStrength.value) * 10;
    const sun = createBody(0, 0, 0, 0, "star", 40);
    bodies.push(sun);

    const planets = [
      { dist: 90,  mass: 4,  type: "planet_terrestrial" },
      { dist: 130, mass: 6,  type: "planet_ocean" },
      { dist: 180, mass: 7,  type: "planet_desert" },
      { dist: 250, mass: 18, type: "planet_gas" },
      { dist: 340, mass: 45, type: "planet_super" },
      { dist: 440, mass: 4,  type: "planet_ice" }
    ];
    for (const p of planets) {
      const v = Math.sqrt(G * sun.mass / p.dist);
      const b = createBody(p.dist, 0, 0, v, p.type, p.mass);
      bodies.push(b);
    }
    updateBodyChip();
    firstPlacementDone = true;
    canvasHint.classList.add("hidden");
  }

  function loadBinary() {
    clearAll(true);
    const G = parseFloat(gravityStrength.value) * 10;
    const starMass = 25;
    const separation = 160;
    const v = Math.sqrt(G * starMass / (separation * 2));
    const a = createBody(-separation / 2, 0, 0, v, "star", starMass);
    const b = createBody(separation / 2, 0, 0, -v, "star", starMass);
    b.color = "#ff80a0";
    b.glow = "#ff5c6a";
    bodies.push(a, b);

    for (let i = 0; i < 4; i++) {
      const dist = 380 + i * 80;
      const vv = Math.sqrt(G * starMass * 2 / dist);
      const p = createBody(0, dist, -vv, 0, "planet_ice", 3 + i);
      bodies.push(p);
    }
    updateBodyChip();
    firstPlacementDone = true;
    canvasHint.classList.add("hidden");
  }

  function loadChaos() {
    clearAll(true);
    const types = [
      "planet_terrestrial","planet_ocean","planet_desert","planet_lava",
      "planet_ice","planet_gas","planet_super","star"
    ];
    for (let i = 0; i < 30; i++) {
      const x = (Math.random() - 0.5) * 400;
      const y = (Math.random() - 0.5) * 400;
      const vx = (Math.random() - 0.5) * 40;
      const vy = (Math.random() - 0.5) * 40;
      const type = types[Math.floor(Math.random() * types.length)];
      const isStar = type === "star";
      const mass = isStar ? 15 + Math.random() * 20 : 1 + Math.random() * 12;
      bodies.push(createBody(x, y, vx, vy, type, mass));
    }
    updateBodyChip();
    firstPlacementDone = true;
    canvasHint.classList.add("hidden");
  }

  btnPresetSolar.addEventListener("click", loadSolar);
  btnPresetBinary.addEventListener("click", loadBinary);
  btnPresetChaos.addEventListener("click", loadChaos);

  /* =======================================================================
     SPAWN MASS / TYPE
     ======================================================================= */
  bodyType.addEventListener("change", () => {
    const t = BODY_TYPES[bodyType.value];
    if (t) {
      spawnMass.value = t.baseMass;
      valSpawnMass.textContent = t.baseMass.toFixed(2);
    }
  });

  spawnMass.addEventListener("input", () => {
    valSpawnMass.textContent = parseFloat(spawnMass.value).toFixed(2);
  });

  /* =======================================================================
     DELETE / CLEAR
     ======================================================================= */
  btnClearAll.addEventListener("click", () => clearAll(false));

  btnDeleteSelected.addEventListener("click", () => {
    const before = bodies.length;
    bodies = bodies.filter(b => !b.selected);
    if (bodies.length === before) return;
    updateBodyChip();
  });

  /* =======================================================================
     RECENTER
     ======================================================================= */
  btnRecenter.addEventListener("click", () => {
    if (bodies.length === 0) {
      camera.x = 0; camera.y = 0;
      return;
    }
    let mx = 0, my = 0, mt = 0;
    for (const b of bodies) {
      mx += b.x * b.mass;
      my += b.y * b.mass;
      mt += b.mass;
    }
    if (mt > 0) {
      camera.x = mx / mt;
      camera.y = my / mt;
    }
  });

  /* =======================================================================
     EXPORT
     ======================================================================= */
  function exportImage(format) {
    const mult = parseInt(exportScale.value, 10) || 1;
    const outW = Math.round(cw * dpr * mult);
    const outH = Math.round(ch * dpr * mult);

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const octx = out.getContext("2d");
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(canvas, 0, 0, outW, outH);

    const mime = format === "jpg" ? "image/jpeg" : "image/png";
    const quality = format === "jpg" ? 0.92 : undefined;
    const dataUrl = out.toDataURL(mime, quality);

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = (exportName.value || "orbital") + "." + (format === "jpg" ? "jpg" : "png");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  btnExportPng.addEventListener("click", () => exportImage("png"));
  btnExportJpg.addEventListener("click", () => exportImage("jpg"));

  /* =======================================================================
     PRESET SAVES (scenes)
     ======================================================================= */
  const PRESET_KEY = "orbital_sandbox_scenes_v2";

  function loadPresets() {
    try {
      const raw = localStorage.getItem(PRESET_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function savePresets(obj) {
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(obj));
    } catch (e) {}
  }

  function refreshPresetList() {
    const presets = loadPresets();
    presetList.innerHTML = '<option value="">— none —</option>';
    Object.keys(presets).forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      presetList.appendChild(opt);
    });
  }

  function serializeScene() {
    return {
      bodies: bodies.map(b => ({
        x: b.x, y: b.y, vx: b.vx, vy: b.vy,
        mass: b.mass, type: b.type
      })),
      gravity: gravityStrength.value,
      collisionMode: collisionMode.value,
      trailLength: trailLength.value
    };
  }

  function loadScene(scene) {
    if (!scene) return;
    clearAll(true);
    bodies = [];
    for (const bd of scene.bodies) {
      bodies.push(createBody(bd.x, bd.y, bd.vx, bd.vy, bd.type, bd.mass));
    }
    if (scene.gravity) gravityStrength.value = scene.gravity;
    if (scene.collisionMode) collisionMode.value = scene.collisionMode;
    if (scene.trailLength) trailLength.value = scene.trailLength;
    lastTrailCap = -1;
    updateBodyChip();
    firstPlacementDone = true;
    canvasHint.classList.add("hidden");
  }

  btnSavePreset.addEventListener("click", () => {
    const name = prompt("Name this scene:");
    if (!name) return;
    const presets = loadPresets();
    presets[name] = serializeScene();
    savePresets(presets);
    refreshPresetList();
    presetList.value = name;
  });

  btnLoadPreset.addEventListener("click", () => {
    const name = presetList.value;
    if (!name) return;
    const presets = loadPresets();
    if (presets[name]) loadScene(presets[name]);
  });

  btnDeletePreset.addEventListener("click", () => {
    const name = presetList.value;
    if (!name) return;
    if (!confirm(`Delete scene "${name}"?`)) return;
    const presets = loadPresets();
    delete presets[name];
    savePresets(presets);
    refreshPresetList();
  });

  /* =======================================================================
     MAIN LOOP
     ======================================================================= */
  function loop(ts) {
    if (!lastTs) lastTs = ts;
    const rawDt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    const spd = parseFloat(speed.value);
    if (running && spd > 0 && bodies.length > 0) {
      const totalDt = rawDt * spd;
      const maxStep = 0.008;
      const steps = Math.max(1, Math.ceil(totalDt / maxStep));
      const dt = totalDt / steps;
      for (let i = 0; i < steps; i++) {
        physicsStep(dt);
      }
      updateTrails();
    }

    updateParticles(rawDt);
    render(rawDt);
    updateBodyChip();

    requestAnimationFrame(loop);
  }

  /* =======================================================================
     INIT
     ======================================================================= */
  function init() {
    resizeCanvas();
    refreshPresetList();
    updatePlaybackUI();
    updateBodyChip();
    valSpawnMass.textContent = parseFloat(spawnMass.value).toFixed(2);
    requestAnimationFrame(loop);
  }

  init();

})();
