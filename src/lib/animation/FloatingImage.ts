// FloatingImage — a photo that travels through several lifecycle states:
//
//   thrown    : flying along a parabolic arc from the stickman's hand to a
//               landing spot on the opposite side of the screen.
//   grounded  : lying on the ground for a moment after landing.
//   rising    : begins to lift off, growing as it "comes forward" (3D feel).
//   floating  : drifts upward swaying side-to-side with a gentle rotation.
//   ascending : near the top, shrinks and fades out (flies away).
//   done      : ready to be recycled by the Scene into a new carousel entry.
//
// The 3D carousel illusion comes from scaling (depth) + slight rotation +
// opacity fade, all driven by the image's vertical progress.

import { clamp, lerp, rand, smootherstep } from "./utils";

export type ImageState = "thrown" | "grounded" | "rising" | "floating" | "ascending" | "done";

export class FloatingImage {
  img: HTMLImageElement;
  state: ImageState = "thrown";
  t = 0; // time in current state

  // Position & motion
  x: number;
  y: number;
  startX: number;
  startY: number;
  landX: number;
  landY: number;
  // Throw physics
  vx = 0;
  vy = 0;
  gravity = 0;
  // Floating drift
  driftPhase: number;
  driftAmp: number;
  riseSpeed: number;
  rot = 0;
  rotSpeed: number;
  // Visual
  scale = 0.5;
  opacity = 1;
  baseW = 0;
  baseH = 0;

  constructor(img: HTMLImageElement) {
    this.img = img;
    this.driftPhase = rand(0, Math.PI * 2);
    this.driftAmp = rand(20, 60);
    this.riseSpeed = rand(40, 70);
    this.rotSpeed = rand(-0.3, 0.3);
    this.baseW = img.naturalWidth || 200;
    this.baseH = img.naturalHeight || 200;
  }

  /** Launch the image from (sx,sy) toward (lx,ly) with a fixed flight time. */
  launch(sx: number, sy: number, lx: number, ly: number, flightTime = 0.9) {
    this.state = "thrown";
    this.t = 0;
    this.x = sx;
    this.y = sy;
    this.startX = sx;
    this.startY = sy;
    this.landX = lx;
    this.landY = ly;
    // Solve for initial velocity so we land at (lx,ly) after flightTime,
    // with gravity pulling down. y is screen-down positive.
    this.gravity = 1400;
    this.vx = (lx - sx) / flightTime;
    this.vy = (ly - sy) / flightTime - 0.5 * this.gravity * flightTime;
    this.scale = 0.42;
    this.opacity = 1;
    this.rot = rand(-0.3, 0.3);
  }

  /** Skip the throw and just place it on the ground (used for recycling). */
  placeOnGround(x: number, y: number) {
    this.state = "grounded";
    this.t = 0;
    this.x = x;
    this.y = y;
    this.landX = x;
    this.landY = y;
    this.scale = 0.4;
    this.opacity = 1;
    this.rot = rand(-0.4, 0.4);
  }

  /** Begin floating up from its current grounded position. */
  beginFloat() {
    this.state = "rising";
    this.t = 0;
    this.driftPhase = rand(0, Math.PI * 2);
    this.driftAmp = rand(20, 70);
    this.riseSpeed = rand(45, 80);
    this.rotSpeed = rand(-0.4, 0.4);
  }

  update(dt: number, groundY: number, topY: number) {
    this.t += dt;
    switch (this.state) {
      case "thrown": {
        this.vy += this.gravity * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.rot += this.rotSpeed * dt * 2;
        // grow slightly as it flies
        this.scale = lerp(this.scale, 0.5, dt * 2);
        if (this.y >= this.landY) {
          this.y = this.landY;
          this.state = "grounded";
          this.t = 0;
          this.rotSpeed = 0;
        }
        break;
      }
      case "grounded": {
        // settle + wait
        this.rot = lerp(this.rot, Math.round(this.rot / 0.3) * 0.3, dt * 4);
        if (this.t > 0.5) {
          this.beginFloat();
        }
        break;
      }
      case "rising": {
        // lift off and grow to carousel size
        const k = smootherstep(0, 0.8, this.t);
        this.scale = lerp(0.45, 0.95, k);
        this.y -= this.riseSpeed * 0.4 * dt;
        if (this.t > 0.8) {
          this.state = "floating";
          this.t = 0;
        }
        break;
      }
      case "floating": {
        this.driftPhase += dt * 1.2;
        this.x += Math.sin(this.driftPhase) * this.driftAmp * dt * 0.1;
        this.y -= this.riseSpeed * dt;
        this.rot += this.rotSpeed * dt;
        this.rot = clamp(this.rot, -0.5, 0.5);
        // subtle breathing scale
        this.scale = 0.95 + Math.sin(this.t * 1.5) * 0.03;
        // Start fading as we approach the top quarter
        const fadeStart = groundY - (groundY - topY) * 0.7;
        if (this.y < fadeStart) {
          this.state = "ascending";
          this.t = 0;
        }
        break;
      }
      case "ascending": {
        this.y -= this.riseSpeed * 1.3 * dt;
        this.driftPhase += dt * 1.5;
        this.x += Math.sin(this.driftPhase) * this.driftAmp * dt * 0.08;
        this.rot += this.rotSpeed * dt * 1.5;
        const k = clamp(this.t / 1.2, 0, 1);
        this.scale = lerp(0.95, 0.15, k);
        this.opacity = lerp(1, 0, k);
        if (this.opacity <= 0.02) {
          this.state = "done";
        }
        break;
      }
      case "done":
        break;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.opacity <= 0.01) return;
    const w = this.baseW * this.scale * 0.4;
    const h = this.baseH * this.scale * 0.4;
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.translate(this.x, this.y - h / 2);
    ctx.rotate(this.rot);

    // Soft shadow / frame for the polaroid feel
    const frame = Math.max(4, w * 0.06);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.strokeStyle = "rgba(58,46,42,0.35)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, -w / 2 - frame, -h / 2 - frame, w + frame * 2, h + frame * 2.4, 6);
    ctx.fill();
    ctx.stroke();

    // The photo itself
    ctx.drawImage(this.img, -w / 2, -h / 2, w, h);

    ctx.restore();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
