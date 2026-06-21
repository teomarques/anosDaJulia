// Cat — a stick-art feline companion.
//
// Implements the same public API as Dog so the Scene can treat cats and dogs
// uniformly (update / draw / approachPet / startChase / stopChase / setAction
// / x / y / action / happy / facing / scale / buddy).
//
// Three palettes are used:
//   - BLACK_CAT   : solid black cat
//   - BROWN_CAT   : marrom/tabby cat
//   - TUXEDO_CAT  : white-and-black (tuxedo) cat
//
// Behaviours mirror Dog (wander / play / chase / approach / petted / return)
// with cat-appropriate tuning: more bursts of speed, higher jumps, longer
// idle pauses (cats lounge), and a sinuous tail.

import { clamp, damp, dist, lerp, rand } from "./utils";

export type CatAction = "wander" | "play" | "chase" | "approach" | "petted" | "return";

export interface CatPalette {
  body: string;
  bodyDark: string;
  belly: string;
  // Optional patch colour for tuxedo-style markings.
  patch?: string;
}

export class Cat {
  x: number;
  y: number;
  groundY: number;
  scale: number;
  facing: 1 | -1 = 1;
  palette: CatPalette;

  action: CatAction = "wander";
  actionTime = 0;
  tx: number;
  ty: number;
  speed = 70; // cats: a touch slower sustained, but bursty
  phase = rand(0, 10);
  jumpY = 0;
  jumpVel = 0;
  tailPhase = rand(0, 10);
  headPhase = rand(0, 10);
  happy = 0;
  buddy?: Cat | import("./Dog").Dog;
  cursor?: { x: number; y: number } | null;
  // Personal wander range — lets each pet claim a part of the ground so
  // the group spreads out instead of clumping. Used by wanderTo().
  wanderMin = 0;
  wanderMax = 0;

  private nextDecision = rand(1.5, 3.5);
  // Accumulated age (seconds) — used to enforce a minimum interval between
  // facing changes so the cat can't flip left/right rapidly.
  private age = 0;
  private lastFacingFlip = -10;
  // Minimum seconds the cat must keep its current facing before it may
  // turn around. Prevents the left/right flicker glitch.
  private static readonly FACING_COOLDOWN = 0.5;

  /** Set facing only if the cooldown has elapsed. Single choke point that
   *  prevents rapid left/right flicker. */
  private tryFace(f: 1 | -1) {
    if (f === this.facing) return;
    if (this.age - this.lastFacingFlip < Cat.FACING_COOLDOWN) return;
    this.facing = f;
    this.lastFacingFlip = this.age;
  }

  constructor(x: number, groundY: number, scale: number, palette: CatPalette) {
    this.x = x;
    this.y = groundY;
    this.groundY = groundY;
    this.scale = scale;
    this.palette = palette;
    this.tx = x;
    this.ty = groundY;
  }

  wanderTo(minX: number, maxX: number) {
    // Use the pet's personal range if set, otherwise the passed range.
    const lo = this.wanderMax > this.wanderMin ? this.wanderMin : minX;
    const hi = this.wanderMax > this.wanderMin ? this.wanderMax : maxX;
    this.tx = rand(lo, hi);
    if (Math.abs(this.tx - this.x) > 10 * this.scale) {
      this.tryFace(this.tx >= this.x ? 1 : -1);
    }
    this.nextDecision = rand(1.8, 4.5); // cats lounge longer between moves
  }

  setAction(a: CatAction) {
    this.action = a;
    this.actionTime = 0;
  }

  approachPet(stickmanX: number, stickmanSide: 1 | -1) {
    this.tx = stickmanX + stickmanSide * 50 * this.scale;
    this.tryFace(stickmanSide > 0 ? -1 : 1);
    this.setAction("approach");
  }

  startChase(cursor: { x: number; y: number }) {
    this.cursor = cursor;
    if (this.action !== "chase") {
      this.setAction("chase");
      this.jumpVel = 240; // cats pounce higher
    }
    this.happy = clamp(this.happy + 0.2, 0, 1);
  }

  stopChase() {
    if (this.action === "chase") {
      this.cursor = null;
      this.setAction("wander");
    }
  }

  update(dt: number, minX: number, maxX: number, stickmanX: number) {
    this.actionTime += dt;
    this.age += dt;
    this.tailPhase += dt * (5 + this.happy * 8);
    this.headPhase += dt * 2;
    this.phase += dt * 7;

    // Jump physics
    if (this.jumpY > 0 || this.jumpVel > 0) {
      this.jumpVel -= 950 * dt;
      this.jumpY += this.jumpVel * dt;
      if (this.jumpY <= 0) {
        this.jumpY = 0;
        this.jumpVel = 0;
      }
    }

    const HYSTERESIS = 6 * this.scale;
    const move = (targetX: number, speed: number) => {
      const dx = targetX - this.x;
      const step = speed * this.scale * dt;
      if (Math.abs(dx) <= step) {
        this.x = targetX;
        return true;
      }
      this.x += Math.sign(dx) * step;
      if (Math.abs(dx) > HYSTERESIS) {
        this.tryFace(dx >= 0 ? 1 : -1);
      }
      return false;
    };

    switch (this.action) {
      case "wander": {
        this.happy = lerp(this.happy, 0, dt * 0.5);
        this.nextDecision -= dt;
        if (this.nextDecision <= 0) this.wanderTo(minX, maxX);
        move(this.tx, this.speed);
        // cats occasionally groom or sit — represented as brief stillness
        if (this.buddy && Math.random() < 0.003) this.setAction("play");
        break;
      }
      case "play": {
        this.happy = lerp(this.happy, 0.7, dt * 1.5);
        if (this.buddy) {
          const d = dist(this.x, this.y, this.buddy.x, this.buddy.y);
          if (d > 80 * this.scale) {
            this.tx = this.buddy.x;
            move(this.tx, this.speed * 1.6);
          } else {
            if (this.jumpY === 0 && Math.random() < 0.04) this.jumpVel = 220;
            this.tx = this.buddy.x + rand(-50, 50) * this.scale;
            if (Math.abs(this.tx - this.x) > 14 * this.scale) {
              this.tryFace(this.tx >= this.x ? 1 : -1);
            }
          }
        }
        if (this.actionTime > rand(2.5, 5)) this.setAction("wander");
        break;
      }
      case "chase": {
        this.happy = 1;
        if (this.cursor) {
          this.tx = this.cursor.x;
          const dx = this.cursor.x - this.x;
          const step = this.speed * 1.8 * this.scale * dt;
          if (Math.abs(dx) > 8) {
            this.x += Math.sign(dx) * step;
            if (Math.abs(dx) > 12 * this.scale) {
              this.tryFace(dx >= 0 ? 1 : -1);
            }
          }
          if (this.jumpY === 0 && Math.random() < 0.025) this.jumpVel = 230;
        }
        break;
      }
      case "approach": {
        move(this.tx, this.speed * 1.3);
        if (Math.abs(this.x - this.tx) < 2) {
          this.setAction("petted");
        }
        break;
      }
      case "petted": {
        this.happy = lerp(this.happy, 1, dt * 2);
        if (this.jumpY === 0 && Math.random() < 0.01) this.jumpVel = 80;
        // cats purr (slight body rise) — handled via tail wag
        if (this.actionTime > 2.0) {
          this.setAction("return");
          this.tx = rand(minX, maxX);
        }
        break;
      }
      case "return": {
        move(this.tx, this.speed);
        if (Math.abs(this.x - this.tx) < 2) this.setAction("wander");
        break;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const s = this.scale;
    const face = this.facing;
    const baseY = this.groundY - this.jumpY * s;

    ctx.save();
    ctx.translate(this.x, baseY);
    ctx.scale(face, 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const bodyLen = 40 * s;
    const bodyH = 16 * s;
    const legLen = 16 * s;

    const swing = (off: number) => Math.sin(this.phase + off) * 5 * s;
    const swingY = (off: number) => Math.max(0, Math.cos(this.phase + off)) * 3 * s;

    const back = -bodyLen * 0.5;
    const front = bodyLen * 0.5;

    // ---- Legs ----
    ctx.strokeStyle = this.palette.bodyDark;
    ctx.lineWidth = 3.5 * s;
    const leg = (x: number, off: number) => {
      const topY = -bodyH * 0.15;
      const footX = x + swing(off);
      const footY = legLen - swingY(off);
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(footX, topY + footY);
      ctx.stroke();
    };
    leg(back + 5 * s, 0);
    leg(back + 5 * s, Math.PI);
    leg(front - 5 * s, Math.PI);
    leg(front - 5 * s, 0);

    // ---- Body ----
    ctx.fillStyle = this.palette.body;
    ctx.strokeStyle = this.palette.bodyDark;
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.moveTo(back, -bodyH * 0.1);
    ctx.quadraticCurveTo(back, -bodyH, back + bodyLen * 0.25, -bodyH * 0.95);
    ctx.quadraticCurveTo(front, -bodyH, front, -bodyH * 0.15);
    ctx.quadraticCurveTo(front, 0, front - bodyLen * 0.1, 0);
    ctx.quadraticCurveTo(back + bodyLen * 0.5, bodyH * 0.5, back, bodyH * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Belly
    ctx.fillStyle = this.palette.belly;
    ctx.beginPath();
    ctx.ellipse(0, bodyH * 0.15, bodyLen * 0.3, bodyH * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Patch marking (tuxedo / tabby)
    if (this.palette.patch) {
      ctx.fillStyle = this.palette.patch;
      ctx.beginPath();
      ctx.ellipse(-bodyLen * 0.1, -bodyH * 0.35, bodyLen * 0.22, bodyH * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- Tail (long, sinuous) ----
    const wag = Math.sin(this.tailPhase) * (0.5 + this.happy * 0.7);
    ctx.strokeStyle = this.palette.bodyDark;
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(back, -bodyH * 0.2);
    ctx.quadraticCurveTo(
      back - 12 * s,
      -bodyH * 1.0 - wag * 8 * s,
      back - 20 * s,
      -bodyH * 1.8 - wag * 16 * s,
    );
    ctx.quadraticCurveTo(
      back - 14 * s,
      -bodyH * 2.3 - wag * 22 * s,
      back - 6 * s - wag * 6 * s,
      -bodyH * 2.5 - wag * 26 * s,
    );
    ctx.stroke();

    // ---- Head ----
    const headBob = Math.sin(this.headPhase) * 1 * s;
    const headCX = front + 9 * s;
    const headCY = -bodyH * 0.6 + headBob;
    const headR = 10 * s;
    ctx.fillStyle = this.palette.body;
    ctx.strokeStyle = this.palette.bodyDark;
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // ---- Ears (triangular, pointed) ----
    ctx.fillStyle = this.palette.body;
    ctx.beginPath();
    ctx.moveTo(headCX - headR * 0.7, headCY - headR * 0.5);
    ctx.lineTo(headCX - headR * 0.2, headCY - headR * 1.5);
    ctx.lineTo(headCX + headR * 0.2, headCY - headR * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(headCX + headR * 0.1, headCY - headR * 0.6);
    ctx.lineTo(headCX + headR * 0.7, headCY - headR * 1.5);
    ctx.lineTo(headCX + headR * 0.9, headCY - headR * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Inner ears (pink)
    ctx.fillStyle = "rgba(232,128,143,0.7)";
    ctx.beginPath();
    ctx.moveTo(headCX - headR * 0.5, headCY - headR * 0.7);
    ctx.lineTo(headCX - headR * 0.2, headCY - headR * 1.2);
    ctx.lineTo(headCX + headR * 0.05, headCY - headR * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headCX + headR * 0.2, headCY - headR * 0.7);
    ctx.lineTo(headCX + headR * 0.55, headCY - headR * 1.2);
    ctx.lineTo(headCX + headR * 0.75, headCY - headR * 0.5);
    ctx.closePath();
    ctx.fill();

    // ---- Eyes (cats: almond-shaped, two of them) ----
    ctx.fillStyle = "#1a1410";
    const eyeY = headCY - headR * 0.1;
    ctx.beginPath();
    ctx.ellipse(headCX + headR * 0.15, eyeY, 1.6 * s, 2.2 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(headCX + headR * 0.65, eyeY, 1.6 * s, 2.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // ---- Nose (tiny triangle) ----
    ctx.fillStyle = "#e8808f";
    ctx.beginPath();
    ctx.moveTo(headCX + headR * 1.05, headCY + headR * 0.35);
    ctx.lineTo(headCX + headR * 1.25, headCY + headR * 0.35);
    ctx.lineTo(headCX + headR * 1.15, headCY + headR * 0.55);
    ctx.closePath();
    ctx.fill();

    // ---- Whiskers ----
    ctx.strokeStyle = "rgba(26,20,16,0.5)";
    ctx.lineWidth = 0.8 * s;
    for (let i = 0; i < 2; i++) {
      const yy = headCY + headR * (0.4 + i * 0.25);
      ctx.beginPath();
      ctx.moveTo(headCX + headR * 0.8, yy);
      ctx.lineTo(headCX + headR * 1.9, yy - 1 * s);
      ctx.moveTo(headCX + headR * 0.8, yy);
      ctx.lineTo(headCX + headR * 1.9, yy + 1 * s);
      ctx.stroke();
    }

    // Happy expression (mouth + tongue) when chasing/petted
    if (this.happy > 0.55) {
      ctx.strokeStyle = "#1a1410";
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.arc(headCX + headR * 0.5, headCY + headR * 0.5, headR * 0.22 * s, 0, Math.PI);
      ctx.stroke();
    }

    ctx.restore();
  }
}
