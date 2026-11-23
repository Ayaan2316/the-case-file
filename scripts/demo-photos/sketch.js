// drawing kit for the placeholder exhibit images - pencil "witness sketches" on old paper.
// loaded into headless chrome by demo-photos.mjs, same result every time per slug
(() => {
  const W = 1200;
  const H = 1200;
  const PAPER = "#e6ddc6";
  const INK = "rgba(38, 31, 25, 0.66)";
  const LIGHT = "rgba(38, 31, 25, 0.3)";
  const RED = "rgba(176, 32, 38, 0.85)";
  const HAND = "'Caveat', cursive";
  const TYPE = "'Special Elite', monospace";

  function mulberry32(a) {
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) {
    let h = 2166136261;
    for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
  }

  function kit(ctx, rand) {
    const j = (a) => (rand() - 0.5) * 2 * a;
    const pen = (style, width) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width * (0.75 + rand() * 0.5);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };

    function line(x1, y1, x2, y2, { passes = 2, wobble = 1.8, style = INK, width = 2.2 } = {}) {
      for (let p = 0; p < passes; p++) {
        pen(style, width);
        ctx.beginPath();
        ctx.moveTo(x1 + j(wobble), y1 + j(wobble));
        ctx.quadraticCurveTo(
          (x1 + x2) / 2 + j(wobble * 2),
          (y1 + y2) / 2 + j(wobble * 2),
          x2 + j(wobble),
          y2 + j(wobble),
        );
        ctx.stroke();
      }
    }

    // smooth hand drawn path through the points
    function curve(pts, { passes = 2, wobble = 1.5, style = INK, width = 2.2, dash, closed } = {}) {
      const src = closed ? [...pts, pts[0], pts[1]] : pts;
      for (let p = 0; p < passes; p++) {
        pen(style, width);
        ctx.setLineDash(dash ?? []);
        const q = src.map(([x, y]) => [x + j(wobble), y + j(wobble)]);
        ctx.beginPath();
        ctx.moveTo(...(closed ? mid(q[0], q[1]) : q[0]));
        for (let i = 1; i < q.length - 1; i++) {
          ctx.quadraticCurveTo(q[i][0], q[i][1], ...mid(q[i], q[i + 1]));
        }
        if (!closed) ctx.lineTo(...q[q.length - 1]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

    function ellipse(cx, cy, rx, ry = rx, opts = {}) {
      const { passes = 2, style = INK, width = 2.2, start = 0, sweep = Math.PI * 2 } = opts;
      for (let p = 0; p < passes; p++) {
        pen(style, width);
        const full = sweep >= Math.PI * 2;
        const a0 = start + (full ? rand() * 6 : j(0.04));
        const total = sweep + (full ? 0.2 + rand() * 0.25 : 0);
        ctx.beginPath();
        for (let i = 0; i <= 64; i++) {
          const a = a0 + total * (i / 64);
          const r = 1 + Math.sin(a * 3 + p) * 0.012;
          const x = cx + Math.cos(a) * rx * r + j(0.6);
          const y = cy + Math.sin(a) * ry * r + j(0.6);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }

    function rect(x, y, w, h, opts) {
      line(x, y, x + w, y, opts);
      line(x + w, y, x + w, y + h, opts);
      line(x + w, y + h, x, y + h, opts);
      line(x, y + h, x, y, opts);
    }

    function roundRectPath(x, y, w, h, r) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
    }
    function roundRect(x, y, w, h, r, opts = {}) {
      const pts = [];
      const corners = [
        [x + w - r, y + r, -Math.PI / 2],
        [x + w - r, y + h - r, 0],
        [x + r, y + h - r, Math.PI / 2],
        [x + r, y + r, Math.PI],
      ];
      for (const [cx, cy, a0] of corners) {
        for (let i = 0; i <= 3; i++) {
          const a = a0 + (Math.PI / 2) * (i / 3);
          pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
      }
      curve(pts, { closed: true, ...opts });
    }

    // fill a region with paper so whatever's behind it is hidden
    function knockout(pathFn) {
      ctx.save();
      pathFn();
      ctx.fillStyle = PAPER;
      ctx.fill();
      ctx.restore();
    }

    function hatch(pathFn, { angle = -Math.PI / 4, gap = 10, style = LIGHT, width = 1.5 } = {}) {
      ctx.save();
      pathFn();
      ctx.clip();
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      for (let d = -1100; d < 1100; d += gap + j(gap * 0.25)) {
        const cx = W / 2 - s * d;
        const cy = H / 2 + c * d;
        line(cx - c * 1100, cy - s * 1100, cx + c * 1100, cy + s * 1100, {
          passes: 1,
          wobble: 4,
          style,
          width,
        });
      }
      ctx.restore();
    }

    function waves(pathFn, { gap = 18, amp = 5, style = LIGHT } = {}) {
      ctx.save();
      pathFn();
      ctx.clip();
      for (let y = 0; y < H; y += gap) {
        const pts = [];
        const phase = rand() * 6;
        for (let x = -20; x <= W + 20; x += 24) pts.push([x, y + Math.sin(x / 22 + phase) * amp]);
        curve(pts, { passes: 1, style, width: 1.6, wobble: 0.8 });
      }
      ctx.restore();
    }

    function text(
      str,
      x,
      y,
      { size = 46, font = HAND, style = INK, align = "left", rotate = 0 } = {},
    ) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotate);
      ctx.font = `${size}px ${font}`;
      ctx.fillStyle = style;
      ctx.textAlign = align;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(str, 0, 0);
      ctx.restore();
    }

    function arrow(x1, y1, x2, y2, { bend = 0.18, style = INK, width = 2.2 } = {}) {
      const mx = (x1 + x2) / 2 - (y2 - y1) * bend;
      const my = (y1 + y2) / 2 + (x2 - x1) * bend;
      const pts = [];
      for (let t = 0; t <= 1.0001; t += 0.1) {
        pts.push([
          (1 - t) ** 2 * x1 + 2 * (1 - t) * t * mx + t * t * x2,
          (1 - t) ** 2 * y1 + 2 * (1 - t) * t * my + t * t * y2,
        ]);
      }
      curve(pts, { passes: 1, style, width });
      const a = Math.atan2(y2 - my, x2 - mx);
      for (const side of [-1, 1]) {
        line(x2, y2, x2 - Math.cos(a + side * 0.45) * 22, y2 - Math.sin(a + side * 0.45) * 22, {
          passes: 1,
          style,
          width,
        });
      }
    }

    function dot(x, y, r, style = INK) {
      ctx.beginPath();
      ctx.arc(x + j(0.8), y + j(0.8), r, 0, Math.PI * 2);
      ctx.fillStyle = style;
      ctx.fill();
    }

    function cross(x, y, s, opts) {
      line(x - s, y - s, x + s, y + s, opts);
      line(x + s, y - s, x - s, y + s, opts);
    }

    return {
      ctx,
      rand,
      j,
      line,
      curve,
      ellipse,
      rect,
      roundRect,
      roundRectPath,
      knockout,
      hatch,
      waves,
      text,
      arrow,
      dot,
      cross,
    };
  }

  // ---------------------------------------------------------------- paper + finishing

  function paper(ctx, rand) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) {
      const x = rand() * W;
      const y = rand() * H;
      const r = 150 + rand() * 420;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(150, 118, 70, ${0.04 + rand() * 0.06})`);
      g.addColorStop(1, "rgba(150, 118, 70, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function finish(ctx, rand) {
    // coffee ring
    const cx = 120 + rand() * 960;
    const cy = 120 + rand() * 300;
    const k = kit(ctx, rand);
    k.ellipse(cx, cy, 95, 92, {
      passes: 3,
      style: "rgba(120, 80, 40, 0.16)",
      width: 7,
      start: rand() * 6,
      sweep: 4.6,
    });
    // vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, W * 0.38, W / 2, H / 2, W * 0.78);
    v.addColorStop(0, "rgba(70, 45, 20, 0)");
    v.addColorStop(1, "rgba(70, 45, 20, 0.32)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    // grain over everything, pencil too
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rand() - 0.5) * 13;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n * 0.9;
    }
    ctx.putImageData(img, 0, 0);
  }

  // what the drawing stands in for, stamped under it (by slug, default is a missing photo)
  const STAMPS = {
    "data-privacy": ["CLASSIFIED", "UNTIL SUBMISSION"],
    "sealed-f": ["SEALED", "CASE STILL OPEN"],
    "sealed-g": ["SEALED", "CASE STILL OPEN"],
  };

  function stamp(k, x, y, rot, [top, bottom] = ["WITNESS SKETCH", "PHOTO PENDING"]) {
    const { ctx, rand } = k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalCompositeOperation = "multiply";
    ctx.strokeStyle = RED;
    ctx.lineWidth = 6;
    ctx.strokeRect(-190, -62, 380, 124);
    ctx.lineWidth = 2;
    ctx.strokeRect(-178, -50, 356, 100);
    ctx.fillStyle = RED;
    ctx.textAlign = "center";
    ctx.font = `34px ${TYPE}`;
    ctx.fillText(top, 0, -6);
    ctx.font = `${bottom.length > 16 ? 21 : 26}px ${TYPE}`;
    ctx.fillText(bottom, 0, 32);
    // worn ink, knock paper coloured specks out of the stamp
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = PAPER;
    for (let i = 0; i < 260; i++) {
      ctx.globalAlpha = 0.5 + rand() * 0.5;
      ctx.beginPath();
      ctx.arc((rand() - 0.5) * 390, (rand() - 0.5) * 130, rand() * 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function caption(k, ex) {
    k.line(80, 1010, 1120, 1010, { width: 2.6 });
    k.text(`EXHIBIT ${ex.id}`, 80, 1068, { size: 36, font: TYPE, style: RED });
    // title stops before the stamp
    const title = ex.title.toUpperCase();
    let size = 58;
    k.ctx.font = `${size}px ${TYPE}`;
    while (k.ctx.measureText(title).width > 620 && size > 30)
      k.ctx.font = `${(size -= 2)}px ${TYPE}`;
    k.text(title, 80, 1130, { size, font: TYPE, style: "rgba(38, 31, 25, 0.92)" });
    stamp(k, 925, 1092, -0.09, STAMPS[ex.slug]);
  }

  // ---------------------------------------------------------------- the sketches

  const sketches = {
    airmouse(k) {
      const { ctx, rand } = k;
      // micromouse style grid underneath
      const cell = 104;
      const x0 = 80;
      const y0 = 70;
      for (let r = 0; r <= 9; r++) {
        for (let c = 0; c <= 10; c++) {
          const x = x0 + c * cell;
          const y = y0 + r * cell;
          k.dot(x, y, 3, LIGHT);
          if (c < 10 && rand() < 0.3)
            k.line(x, y, x + cell, y, { passes: 1, style: LIGHT, width: 2 });
          if (r < 9 && rand() < 0.3)
            k.line(x, y, x, y + cell, { passes: 1, style: LIGHT, width: 2 });
        }
      }
      const path = [
        [132, 914],
        [132, 706],
        [340, 706],
        [340, 498],
        [548, 498],
        [756, 498],
        [756, 290],
        [964, 290],
        [964, 122],
      ];
      k.curve(path, { passes: 1, style: RED, width: 4, dash: [3, 16], wobble: 1 });

      const cx = 600;
      const cy = 520;
      const motors = [
        [-225, -205],
        [225, -205],
        [225, 205],
        [-225, 205],
      ];
      for (const [dx, dy] of motors) {
        const len = Math.hypot(dx, dy);
        const nx = (-dy / len) * 12;
        const ny = (dx / len) * 12;
        k.knockout(() => {
          ctx.beginPath();
          ctx.moveTo(cx + nx, cy + ny);
          ctx.lineTo(cx + dx + nx, cy + dy + ny);
          ctx.lineTo(cx + dx - nx, cy + dy - ny);
          ctx.lineTo(cx - nx, cy - ny);
          ctx.closePath();
        });
        k.line(cx + nx, cy + ny, cx + dx + nx, cy + dy + ny);
        k.line(cx - nx, cy - ny, cx + dx - nx, cy + dy - ny);
      }
      for (const [dx, dy] of motors) {
        const mx = cx + dx;
        const my = cy + dy;
        k.ellipse(mx, my, 140, 140, { passes: 1, style: LIGHT, width: 1.6 });
        for (let i = 0; i < 3; i++) {
          k.ellipse(mx, my, 118 - i * 16, 118 - i * 16, {
            passes: 1,
            style: INK,
            width: 1.6,
            start: rand() * 6,
            sweep: 0.9 + rand() * 0.6,
          });
        }
        k.knockout(() => {
          ctx.beginPath();
          ctx.arc(mx, my, 40, 0, Math.PI * 2);
        });
        k.ellipse(mx, my, 40);
        k.ellipse(mx, my, 15);
        k.hatch(
          () => {
            ctx.beginPath();
            ctx.arc(mx, my, 40, 0, Math.PI * 2);
          },
          { gap: 8 },
        );
      }
      const body = () => k.roundRectPath(cx - 100, cy - 135, 200, 270, 34);
      k.knockout(body);
      k.hatch(body, { gap: 12, angle: Math.PI / 5 });
      k.roundRect(cx - 100, cy - 135, 200, 270, 34, { width: 2.8 });
      k.knockout(() => {
        ctx.beginPath();
        ctx.arc(cx, cy - 10, 62, 0, Math.PI * 2);
      });
      k.ellipse(cx, cy - 10, 62);
      k.ellipse(cx, cy - 10, 34);
      k.hatch(
        () => {
          ctx.beginPath();
          ctx.arc(cx, cy - 10, 34, 0, Math.PI * 2);
        },
        { gap: 6, style: INK },
      );
      k.rect(cx - 32, cy - 182, 64, 42);
      k.ellipse(cx, cy - 161, 12);

      k.arrow(935, 230, cx + 70, cy - 40, { bend: -0.2 });
      k.text("2D LiDAR", 900, 210, { size: 52, rotate: -0.05 });
      k.arrow(215, 890, 300, 735, { bend: 0.25, style: RED });
      k.text("grid by grid, no GPS", 70, 960, { size: 48, style: RED, rotate: -0.03 });
    },

    nayan(k) {
      const { ctx } = k;
      const xs = [220, 470, 720, 960];
      const ys = [220, 420, 620, 840];
      for (const x of xs) {
        k.line(x - 11, 80, x - 11, 960, { style: LIGHT, width: 2 });
        k.line(x + 11, 80, x + 11, 960, { style: LIGHT, width: 2 });
      }
      for (const y of ys) {
        k.line(60, y - 11, 1140, y - 11, { style: LIGHT, width: 2 });
        k.line(60, y + 11, 1140, y + 11, { style: LIGHT, width: 2 });
      }
      k.curve(
        [
          [60, 560],
          [300, 470],
          [600, 760],
          [900, 700],
          [1140, 520],
        ],
        {
          style: LIGHT,
          width: 2,
          passes: 2,
        },
      );

      const blob = (cx, cy, r, seed) => () => {
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const rr = r * (1 + 0.18 * Math.sin(a * 3 + seed) + 0.1 * Math.cos(a * 5 + seed * 2));
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr * 0.8;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.closePath();
      };
      for (const [cx, cy, r, s] of [
        [470, 420, 100, 1.3],
        [850, 335, 70, 4.1],
      ]) {
        const p = blob(cx, cy, r, s);
        k.knockout(p);
        k.waves(p, { style: INK, gap: 15 });
        ctx.save();
        p();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.restore();
      }
      for (let i = 0; i < 70; i++) {
        const a = k.rand() * Math.PI * 2;
        const r = Math.sqrt(k.rand()) * 62;
        k.dot(720 + Math.cos(a) * r, 840 + Math.sin(a) * r * 0.7, 4 + k.rand() * 3);
      }

      k.line(220, 620, 220, 420, { style: LIGHT, width: 3 });
      k.line(220, 420, 440, 420, { style: LIGHT, width: 3 });
      k.cross(470, 420, 30, { style: RED, width: 5 });

      k.curve(
        [
          [220, 840],
          [220, 760],
          [220, 620],
          [470, 620],
          [720, 620],
          [720, 420],
          [720, 220],
          [960, 220],
        ],
        {
          style: RED,
          width: 7,
          passes: 2,
          wobble: 1,
        },
      );
      const pin = (x, y, label) => {
        k.knockout(() => {
          ctx.beginPath();
          ctx.arc(x, y - 54, 30, 0, Math.PI * 2);
        });
        k.ellipse(x, y - 54, 30, 30, { style: RED, width: 3 });
        k.line(x - 24, y - 38, x, y, { style: RED, width: 3 });
        k.line(x + 24, y - 38, x, y, { style: RED, width: 3 });
        k.text(label, x, y - 42, { size: 36, font: TYPE, style: RED, align: "center" });
      };
      pin(220, 840, "A");
      pin(960, 220, "B");

      k.text("waterlogged", 300, 300, { size: 50, rotate: -0.06 });
      k.arrow(390, 310, 440, 365, { bend: 0.2 });
      k.text("crowd", 820, 930, { size: 50 });
      k.text("route that fits", 520, 690, { size: 46, style: RED, rotate: -0.02 });
      k.text("the vehicle", 560, 735, { size: 46, style: RED, rotate: -0.02 });
      // compass
      k.line(1080, 150, 1080, 80, { width: 2.6 });
      k.line(1080, 80, 1066, 104, { passes: 1 });
      k.line(1080, 80, 1094, 104, { passes: 1 });
      k.text("N", 1080, 70, { size: 34, font: TYPE, align: "center" });
    },

    "llm-forge"(k) {
      const words = ["the", "case", "is", "still", "open"];
      words.forEach((w, i) => {
        const x = 130 + i * 192;
        k.roundRect(x, 870, 160, 66, 10);
        k.text(w, x + 80, 914, { size: 30, font: TYPE, align: "center" });
        k.arrow(x + 80, 862, x + 80, 812, { bend: 0 });
      });
      k.roundRect(130, 740, 928, 62, 14, { width: 2.6 });
      k.text("token + position embedding", 594, 782, { size: 30, font: TYPE, align: "center" });

      for (const [i, y] of [560, 400, 240].entries()) {
        const box = () => k.roundRectPath(250, y, 700, 130, 22);
        k.knockout(box);
        if (i === 0) k.hatch(box, { gap: 16 });
        k.roundRect(250, y, 700, 130, 22, { width: 2.8 });
        k.roundRect(280, y + 28, 290, 74, 12);
        k.text("self-attention", 425, y + 75, { size: 28, font: TYPE, align: "center" });
        k.roundRect(630, y + 28, 290, 74, 12);
        k.text("MLP", 775, y + 75, { size: 28, font: TYPE, align: "center" });
        k.arrow(572, y + 65, 626, y + 65, { bend: 0 });
        k.arrow(600, y + 175, 600, y + 136, { bend: 0 });
        k.curve(
          [
            [955, y + 120],
            [1000, y + 65],
            [955, y + 10],
          ],
          { style: LIGHT, width: 2 },
        );
      }
      k.text("× N", 1010, 450, { size: 80, style: RED });
      k.arrow(600, 232, 600, 192, { bend: 0 });
      k.roundRect(430, 110, 340, 74, 18, { width: 2.8 });
      k.text("next token → ?", 600, 158, { size: 32, font: TYPE, align: "center" });

      // causal mask doodle in the margin
      const g = 22;
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
          const x = 60 + c * g;
          const y = 380 + r * g;
          k.rect(x, y, g, g, { passes: 1, style: LIGHT, width: 1.4, wobble: 0.8 });
          if (c <= r)
            k.hatch(() => k.roundRectPath(x, y, g, g, 0), { gap: 5, style: INK, width: 1.2 });
        }
      }
      k.text("causal", 64, 540, { size: 38 });
      k.text("mask", 70, 574, { size: 38 });
      k.text("built from scratch", 70, 90, { size: 56, style: RED, rotate: -0.04 });
      k.arrow(330, 110, 420, 140, { bend: -0.2, style: RED });
    },

    "desk-robot"(k) {
      const { ctx } = k;
      k.line(40, 905, 1160, 905, { width: 2.6 });
      k.line(40, 940, 1160, 940, { style: LIGHT });
      // LAN brain box
      k.roundRect(960, 380, 180, 130, 16);
      for (let i = 0; i < 3; i++)
        k.line(985, 420 + i * 30, 1110, 420 + i * 30, { passes: 1, style: LIGHT });
      k.text("LAN brain", 1050, 560, { size: 44, align: "center" });
      for (let i = 0; i < 3; i++) {
        k.ellipse(890, 470, 30 + i * 26, 30 + i * 26, {
          passes: 1,
          style: RED,
          width: 2.4,
          start: -0.7,
          sweep: 1.4,
        });
      }

      // base + servo neck
      const base = () => k.roundRectPath(420, 760, 360, 140, 26);
      k.knockout(base);
      k.hatch(() => k.roundRectPath(660, 760, 120, 140, 0), { gap: 9 });
      k.roundRect(420, 760, 360, 140, 26, { width: 2.8 });
      for (let i = 0; i < 6; i++) k.ellipse(480 + i * 48, 835, 11, 11, { style: RED, width: 2.4 });
      k.rect(565, 690, 70, 72);
      k.ellipse(600, 712, 14);

      // head
      const head = () => k.roundRectPath(330, 290, 540, 410, 52);
      k.knockout(head);
      k.roundRect(330, 290, 540, 410, 52, { width: 3 });
      const screen = () => k.roundRectPath(392, 340, 416, 296, 22);
      k.hatch(screen, { gap: 7, style: INK, width: 1.4 });
      k.hatch(screen, { gap: 9, angle: Math.PI / 4, style: LIGHT, width: 1.2 });
      k.roundRect(392, 340, 416, 296, 22, { width: 2.6 });
      for (const ex of [515, 685]) {
        k.knockout(() => {
          ctx.beginPath();
          ctx.ellipse(ex, 470, 54, 76, 0, 0, Math.PI * 2);
        });
        k.ellipse(ex, 470, 54, 76, { width: 2.6 });
        k.dot(ex + 8, 482, 20);
        k.dot(ex + 16, 470, 6, "rgba(230, 221, 198, 0.95)");
      }
      k.knockout(() => {
        ctx.beginPath();
        ctx.ellipse(600, 568, 70, 30, 0, 0, Math.PI);
      });
      k.ellipse(600, 568, 70, 30, { start: 0.15, sweep: Math.PI - 0.3, width: 3 });
      for (let i = 0; i < 9; i++) k.dot(440 + i * 40, 670, 5);
      k.line(600, 290, 600, 240, { width: 2.6 });
      k.ellipse(600, 228, 14);

      k.text("I2S mic", 640, 200, { size: 48 });
      k.arrow(630, 210, 612, 230, { bend: 0 });
      k.text("LVGL face", 40, 250, { size: 48 });
      k.text("on an ILI9341", 40, 294, { size: 48 });
      k.arrow(200, 315, 395, 430, { bend: 0.2 });
      k.text("servo neck", 120, 760, { size: 48 });
      k.arrow(330, 750, 560, 722, { bend: -0.15 });
    },

    "case-file"(k) {
      const { ctx } = k;
      ctx.save();
      ctx.translate(600, 500);
      ctx.rotate(-0.07);
      ctx.translate(-600, -500);
      // back panel + tab
      const back = () => {
        ctx.beginPath();
        ctx.moveTo(150, 230);
        ctx.lineTo(150, 170);
        ctx.lineTo(420, 170);
        ctx.lineTo(450, 230);
        ctx.lineTo(1030, 230);
        ctx.lineTo(1030, 840);
        ctx.lineTo(150, 840);
        ctx.closePath();
      };
      k.knockout(back);
      k.curve(
        [
          [150, 840],
          [150, 170],
          [420, 170],
          [450, 230],
          [1030, 230],
          [1030, 840],
        ],
        { width: 2.6 },
      );
      // polaroid peeking out
      k.knockout(() => k.roundRectPath(700, 140, 230, 250, 4));
      k.rect(700, 140, 230, 250);
      k.hatch(() => k.roundRectPath(718, 158, 194, 180, 0), { gap: 7, style: INK, width: 1.3 });
      k.rect(718, 158, 194, 180, { passes: 1 });
      // front panel
      const front = () => k.roundRectPath(130, 280, 920, 580, 10);
      k.knockout(front);
      k.hatch(front, { gap: 22, angle: -0.2, style: "rgba(38, 31, 25, 0.12)" });
      k.roundRect(130, 280, 920, 580, 10, { width: 3 });
      // label
      k.rect(200, 360, 480, 150);
      k.text("CASE No. 2316", 230, 420, { size: 44, font: TYPE });
      k.text("SUBJECT: A. BAGAWAN", 230, 474, { size: 30, font: TYPE });
      // stamp on the folder
      ctx.save();
      ctx.translate(780, 650);
      ctx.rotate(-0.18);
      ctx.strokeStyle = RED;
      ctx.lineWidth = 5;
      ctx.strokeRect(-170, -45, 340, 90);
      ctx.fillStyle = RED;
      ctx.font = `52px ${TYPE}`;
      ctx.textAlign = "center";
      ctx.fillText("CLASSIFIED", 0, 18);
      ctx.restore();
      // paperclip
      k.curve(
        [
          [860, 250],
          [860, 330],
          [890, 345],
          [915, 330],
          [915, 215],
          [895, 200],
          [878, 215],
          [878, 310],
        ],
        {
          width: 3,
        },
      );
      ctx.restore();

      // magnifying glass lying across
      k.line(395, 885, 255, 975, { width: 9, passes: 2 });
      k.line(405, 870, 270, 960, { width: 2, passes: 1 });
      k.knockout(() => {
        ctx.beginPath();
        ctx.arc(500, 780, 130, 0, Math.PI * 2);
      });
      k.ellipse(500, 780, 130, 130, { width: 3.4 });
      k.ellipse(500, 780, 116, 116, { width: 1.6, passes: 1 });
      k.ellipse(500, 780, 95, 95, {
        passes: 1,
        style: LIGHT,
        width: 6,
        start: 3.6,
        sweep: 1.2,
      });

      k.text("you are here", 820, 960, { size: 58, style: RED, rotate: -0.05 });
      k.arrow(860, 920, 700, 820, { bend: 0.25, style: RED });
    },

    "openfoam-llm"(k) {
      const { ctx } = k;
      const R = 92;
      const ox = 400;
      const oy = 380;
      const vel = (x, y) => {
        const dx = x - ox;
        const dy = y - oy;
        const r2 = dx * dx + dy * dy;
        const r4 = r2 * r2;
        return [1 - (R * R * (dx * dx - dy * dy)) / r4, (-2 * R * R * dx * dy) / r4];
      };
      for (let y0 = 110; y0 <= 650; y0 += 34) {
        if (Math.abs(y0 - oy) < 6) continue;
        const pts = [];
        let x = 60;
        let y = y0;
        while (x < 1140 && pts.length < 600) {
          pts.push([x, y]);
          const [u1, v1] = vel(x, y);
          const [u2, v2] = vel(x + u1 * 4, y + v1 * 4);
          const u = (u1 + u2) / 2;
          const v = (v1 + v2) / 2;
          const n = Math.hypot(u, v) || 1;
          x += (u / n) * 8;
          y += (v / n) * 8;
        }
        k.curve(
          pts.filter((_, i) => i % 3 === 0),
          { passes: 1, style: Math.abs(y0 - oy) < 120 ? INK : LIGHT, width: 1.8 },
        );
      }
      // von Kármán-ish wake
      for (const [i, [vx, vy]] of [
        [600, 330],
        [740, 440],
        [880, 330],
        [1020, 440],
      ].entries()) {
        const pts = [];
        for (let t = 0; t < 18; t += 0.35) {
          const r = 52 - t * 2.6;
          const a = (i % 2 ? -1 : 1) * t;
          pts.push([vx + Math.cos(a) * r, vy + Math.sin(a) * r * 0.8]);
        }
        k.knockout(() => {
          ctx.beginPath();
          ctx.ellipse(vx, vy, 52, 42, 0, 0, Math.PI * 2);
        });
        k.curve(pts, { passes: 1, width: 1.8 });
      }
      k.knockout(() => {
        ctx.beginPath();
        ctx.arc(ox, oy, R, 0, Math.PI * 2);
      });
      k.hatch(
        () => {
          ctx.beginPath();
          ctx.arc(ox, oy, R, 0, Math.PI * 2);
        },
        { gap: 8, style: INK, width: 1.4 },
      );
      k.ellipse(ox, oy, R, R, { width: 3 });
      k.arrow(70, 70, 230, 70, { bend: 0 });
      k.text("U", 250, 82, { size: 40, font: TYPE });

      // terminal
      const term = () => k.roundRectPath(560, 690, 580, 270, 16);
      k.knockout(term);
      k.roundRect(560, 690, 580, 270, 16, { width: 2.8 });
      k.line(560, 735, 1140, 735, { passes: 1 });
      for (const c of [0, 1, 2]) k.ellipse(590 + c * 30, 712, 8, 8, { passes: 1 });
      const lines = ["$ blockMesh", "$ simpleFoam", "> llm: fixing fvSchemes", "> rerun ... ok"];
      lines.forEach((l, i) =>
        k.text(l, 590, 785 + i * 44, { size: 28, font: TYPE, style: i === 2 ? RED : INK }),
      );

      k.text("chooses, generates,", 70, 790, { size: 50, style: RED, rotate: -0.04 });
      k.text("runs, debugs", 90, 850, { size: 50, style: RED, rotate: -0.04 });
      k.arrow(400, 845, 545, 800, { bend: -0.15, style: RED });
    },
  };

  Object.assign(sketches, {
    // confidential paper: title typed, body redacted, padlock in the margin
    "data-privacy"(k) {
      const { ctx, rand } = k;
      ctx.save();
      ctx.translate(600, 500);
      ctx.rotate(0.04);
      ctx.translate(-600, -500);
      const sheet = () => k.roundRectPath(230, 90, 740, 860, 4);
      k.knockout(sheet);
      k.roundRect(230, 90, 740, 860, 4, { width: 2.6 });
      k.text("RESEARCH PAPER", 290, 175, { size: 40, font: TYPE });
      k.text("TOPIC: DATA PRIVACY", 290, 230, { size: 34, font: TYPE });
      k.line(290, 262, 910, 262, { passes: 1 });
      // body: pencil lines, most of them blacked out
      for (let i = 0; i < 13; i++) {
        const y = 320 + i * 46;
        const w = 420 + rand() * 200;
        if (rand() < 0.72) {
          ctx.fillStyle = "rgba(24, 20, 16, 0.86)";
          ctx.fillRect(290 + k.j(3), y - 22 + k.j(2), w, 28);
        } else {
          k.line(290, y - 6, 290 + w, y - 6, { passes: 1, style: LIGHT, width: 2 });
        }
      }
      ctx.restore();
      // padlock
      k.roundRect(1010, 360, 120, 100, 10, { width: 2.8 });
      k.ellipse(1070, 360, 40, 46, { start: Math.PI, sweep: Math.PI, width: 2.8 });
      k.dot(1070, 405, 9);
      k.line(1070, 405, 1070, 432, { width: 3 });
      // the stamp across the paper
      ctx.save();
      ctx.translate(600, 560);
      ctx.rotate(-0.2);
      ctx.globalCompositeOperation = "multiply";
      ctx.strokeStyle = RED;
      ctx.lineWidth = 7;
      ctx.strokeRect(-250, -62, 500, 124);
      ctx.fillStyle = RED;
      ctx.font = `78px ${TYPE}`;
      ctx.textAlign = "center";
      ctx.fillText("CLASSIFIED", 0, 26);
      ctx.restore();
      // margin note, clear of the paper
      k.text("w/ faculty", 995, 560, { size: 42, rotate: -0.08 });
      k.text("mentor, DSU", 995, 606, { size: 42, rotate: -0.08 });
      k.arrow(1050, 630, 985, 720, { bend: -0.25 });
    },

    // sealed evidence envelope, red tape over the flap
    "sealed-f"(k) {
      const { ctx } = k;
      ctx.save();
      ctx.translate(600, 520);
      ctx.rotate(-0.05);
      ctx.translate(-600, -520);
      const env = () => k.roundRectPath(170, 170, 860, 700, 6);
      k.knockout(env);
      k.hatch(env, { gap: 26, angle: 0.3, style: "rgba(150, 110, 60, 0.18)" });
      k.roundRect(170, 170, 860, 700, 6, { width: 3 });
      // flap
      k.curve(
        [
          [170, 170],
          [600, 470],
          [1030, 170],
        ],
        { width: 2.6 },
      );
      // the form on the front
      k.text("EVIDENCE", 250, 560, { size: 52, font: TYPE });
      const rows = [
        ["CASE No.", "2316"],
        ["EXHIBIT", "F"],
        ["CONTENTS", ""],
        ["STATUS", "OPEN"],
      ];
      rows.forEach(([label, value], i) => {
        const y = 630 + i * 56;
        k.text(`${label}:`, 250, y, { size: 30, font: TYPE });
        k.line(470, y + 6, 940, y + 6, { passes: 1, style: LIGHT });
        if (value) k.text(value, 490, y, { size: 44 });
      });
      k.text("?", 620, 742, { size: 70, style: RED });
      // red tape
      ctx.save();
      ctx.translate(600, 330);
      ctx.rotate(-0.32);
      ctx.fillStyle = "rgba(176, 32, 38, 0.82)";
      ctx.fillRect(-520, -42, 1040, 84);
      ctx.fillStyle = "rgba(240, 230, 210, 0.92)";
      ctx.font = `44px ${TYPE}`;
      ctx.textAlign = "center";
      ctx.fillText("SEALED  ·  SEALED  ·  SEALED  ·  SEALED", 0, 15);
      ctx.restore();
      ctx.restore();
      k.text("coming soon", 690, 960, { size: 56, style: RED, rotate: -0.05 });
    },

    // something under a dust sheet with a tag tied on
    "sealed-g"(k) {
      const { ctx } = k;
      const drape = () => {
        ctx.beginPath();
        ctx.moveTo(240, 860);
        ctx.bezierCurveTo(250, 600, 300, 330, 470, 290);
        ctx.bezierCurveTo(600, 260, 760, 270, 850, 320);
        ctx.bezierCurveTo(960, 380, 990, 620, 990, 860);
        ctx.closePath();
      };
      k.knockout(drape);
      k.hatch(drape, { gap: 16, angle: -0.9, style: "rgba(38, 31, 25, 0.12)" });
      k.curve(
        [
          [240, 860],
          [262, 600],
          [330, 360],
          [470, 290],
          [660, 268],
          [850, 320],
          [960, 420],
          [990, 860],
        ],
        { width: 3 },
      );
      // folds falling to the floor
      for (const [a, b] of [
        [380, 330],
        [520, 500],
        [700, 720],
        [860, 900],
      ]) {
        k.curve(
          [
            [a, 330],
            [(a + b) / 2 + 12, 600],
            [b, 860],
          ],
          { passes: 1, width: 1.8, style: LIGHT },
        );
      }
      k.line(200, 862, 1030, 862, { width: 2.6 });
      // a tag on a string
      k.curve(
        [
          [850, 330],
          [900, 380],
          [930, 440],
        ],
        { passes: 1, width: 1.8 },
      );
      ctx.save();
      ctx.translate(950, 520);
      ctx.rotate(0.18);
      k.knockout(() => k.roundRectPath(-90, -70, 200, 150, 10));
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.4;
      ctx.strokeRect(-90, -70, 200, 150);
      ctx.fillStyle = INK;
      ctx.font = `24px ${TYPE}`;
      ctx.fillText("DO NOT OPEN", -72, -24);
      ctx.fillText("UNTIL IT", -72, 10);
      ctx.fillText("SHIPS", -72, 44);
      ctx.restore();
      k.text("watch this space", 120, 210, { size: 58, style: RED, rotate: -0.06 });
      k.arrow(430, 225, 540, 285, { bend: 0.2, style: RED });
    },
  });

  window.demoSketches = Object.keys(sketches);

  window.renderDemo = (ex) => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const rand = mulberry32(hash(ex.slug));
    paper(ctx, rand);
    const k = kit(ctx, rand);
    sketches[ex.slug](k);
    caption(k, ex);
    finish(ctx, rand);
    return canvas.toDataURL("image/webp", 0.8);
  };
})();
