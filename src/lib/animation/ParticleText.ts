// ParticleText — renders the opening "Feliz Aniversário, Julia!" message as a
// cloud of coloured particles sampled from a rasterised text canvas.
//
// Lifecycle:
//   hold   : particles sit at their text positions (the message is readable).
//   melt   : gravity pulls particles down; they pool and spread at the bottom
//            like melting wax (viscous drag + horizontal jitter).
//   gather : particles migrate toward a gathering point (where the stickman
//            will form), spiralling inward.
//   fade   : particles fade out as the stickman fades in.

import { clamp, lerp, rand } from "./utils";

interface Particle {
  x: number;
  y: number;
  ox: number; // origin (text) position
  oy: number;
  vx: number;
  vy: number;
  r: number;
  hue: number;
  light: number;
  a: number; // alpha
}

export type TextPhase = "hold" | "melt" | "gather" | "fade" | "done";

export class ParticleText {
  particles: Particle[] = [];
  phase: TextPhase = "hold";
  t = 0;
  gatherX = 0;
  gatherY = 0;
  // warm party palette
  baseHue = 340;

  constructor(width: number, height: number, text: string, dpr: number) {
    this.build(width, height, text, dpr);
  }

  private build(width: number, height: number, text: string, dpr: number) {
    // Offscreen canvas to rasterise the text.
    const off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    const o = off.getContext("2d")!;
    o.fillStyle = "#fff";
    o.textAlign = "center";
    o.textBaseline = "middle";
    // Fit font size to width — split into two lines for long text.
    const lines = text.split("\n");
    let fontSize = Math.floor(width / (text.length * 0.5));
    fontSize = clamp(fontSize, 24, Math.floor(height / (lines.length * 1.6)));
    o.font = `800 ${fontSize}px Geist, system-ui, sans-serif`;
    // shrink if too wide
    while (o.measureText(lines[0]).width > width * 0.92 && fontSize > 16) {
      fontSize -= 2;
      o.font = `800 ${fontSize}px Geist, system-ui, sans-serif`;
    }
    const lh = fontSize * 1.15;
    lines.forEach((line, i) => {
      const y = height / 2 - ((lines.length - 1) * lh) / 2 + i * lh;
      o.fillText(line, width / 2, y);
    });

    // Sample pixels into particles.
    const data = o.getImageData(0, 0, width, height).data;
    const stride = Math.max(3, Math.round(width / 260)); // density control
    for (let y = 0; y < height; y += stride) {
      for (let x = 0; x < width; x += stride) {
        const idx = (y * width + x) * 4;
        const alpha = data[idx + 3];
        if (alpha < 128) continue;
        // Hue varies across x for a festive gradient feel.
        const hue = (this.baseHue + (x / width) * 80) % 360;
        this.particles.push({
          x, y, ox: x, oy: y,
          vx: 0, vy: 0,
          r: stride * 0.6,
          hue,
          light: 58 + rand(-8, 8),
          a: 1,
        });
      }
    }
  }

  setGatherPoint(x: number, y: number) {
    this.gatherX = x;
    this.gatherY = y;
  }

  startMelt() {
    if (this.phase === "hold") {
      this.phase = "melt";
      this.t = 0;
    }
  }

  startGather() {
    if (this.phase === "melt") {
      this.phase = "gather";
      this.t = 0;
    }
  }

  startFade() {
    if (this.phase !== "fade" && this.phase !== "done") {
      this.phase = "fade";
      this.t = 0;
    }
  }

  update(dt: number, floorY: number) {
    this.t += dt;
    const parts = this.particles;
    switch (this.phase) {
      case "hold":
        // gentle breathing
        for (const p of parts) {
          p.x = p.ox + Math.sin(this.t * 2 + p.oy * 0.05) * 0.6;
          p.y = p.oy + Math.cos(this.t * 2 + p.ox * 0.05) * 0.6;
        }
        break;
      case "melt": {
        // Gravity + viscous drag so particles pool like melting wax.
        const g = 520;
        const drag = 0.86;
        for (const p of parts) {
          p.vy += g * dt;
          p.vx *= drag;
          p.vy *= drag;
          // horizontal jitter grows as it falls
          p.vx += rand(-1, 1) * 30 * dt * (1 + (p.y - p.oy) / 200);
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.y > floorY) {
            p.y = floorY;
            p.vy *= -0.18; // tiny bounce
            p.vx *= 0.8;
          }
        }
        break;
      }
      case "gather": {
        // Spiral inward toward the gather point.
        for (const p of parts) {
          const dx = this.gatherX - p.x;
          const dy = this.gatherY - p.y;
          const d = Math.hypot(dx, dy) + 0.01;
          const pull = lerp(40, 320, clamp(d / 300, 0, 1));
          p.vx += (dx / d) * pull * dt;
          p.vy += (dy / d) * pull * dt;
          // perpendicular swirl
          p.vx += (-dy / d) * 80 * dt;
          p.vy += (dx / d) * 80 * dt;
          p.vx *= 0.9;
          p.vy *= 0.9;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        break;
      }
      case "fade": {
        for (const p of parts) {
          p.a = clamp(1 - this.t / 0.8, 0, 1);
        }
        if (this.t > 0.9) this.phase = "done";
        break;
      }
      case "done":
        break;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.phase === "done") return;
    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = p.a;
      ctx.fillStyle = `hsl(${p.hue}, 80%, ${p.light}%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
