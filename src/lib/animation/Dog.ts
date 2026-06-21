// Dog — a stick-art style quadruped.
//
// Two instances are created: one black (pitbull/labrador vibe) and one beige
// (weimaraner vibe). Each dog has a small behaviour state machine:
//   wander   -> stroll to random nearby points
//   play     -> romp / chase the other dog in a playful loop
//   chase    -> happily chase the cursor / finger (never actually catches it)
//   approach -> walk over to the stickman to be petted
//   petted   -> sit, head down, tail wagging while being scratched
//   return   -> trot back to the play area

import { clamp, damp, dist, lerp, rand, smootherstep } from "./utils";

export type DogAction = "wander" | "play" | "chase" | "approach" | "petted" | "return";

export interface DogPalette {
  body: string;
  bodyDark: string;
  belly: string;
}

export class Dog {
  x: number;
  y: number;
  groundY: number;
  scale: number;
  facing: 1 | -1 = 1;
  palette: DogPalette;

  action: DogAction = "wander";
  actionTime = 0;
  // Movement target
  tx: number;
  ty: number;
  speed = 90;
  // Animation phase for legs
  phase = rand(0, 10);
  // Vertical offset for jumps / bounce
  jumpY = 0;
  jumpVel = 0;
  // Tail wag phase
  tailPhase = rand(0, 10);
  // Head bob / sniff
  headPhase = rand(0, 10);
  // Happiness meter (rises when petted / chasing)
  happy = 0;
  // Reference to follow for "play" (the other dog)
  buddy?: Dog;
  // Cursor target (set externally when chasing)
  cursor?: { x: number; y: number } | null;
  // Personal wander range — lets each pet claim a part of the ground so
  // the group spreads out instead of clumping. Used by wanderTo().
  wanderMin = 0;
  wanderMax = 0;

  private nextDecision = 1.5;
  // Accumulated age (seconds) — used to enforce a minimum interval between
  // facing changes so the animal can't flip left/right rapidly.
  private age = 0;
  private lastFacingFlip = -10;
  // Minimum seconds the animal must keep its current facing before it may
  // turn around. Prevents the left/right flicker glitch.
  private static readonly FACING_COOLDOWN = 0.45;

  constructor(x: number, groundY: number, scale: number, palette: DogPalette) {
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
    this.tryFace(this.tx >= this.x ? 1 : -1);
    this.nextDecision = rand(1.4, 3.5);
  }

  /** Set facing only if the cooldown has elapsed. This is the single choke
   *  point that prevents rapid left/right flicker. */
  private tryFace(f: 1 | -1) {
    if (f === this.facing) return;
    if (this.age - this.lastFacingFlip < Dog.FACING_COOLDOWN) return;
    this.facing = f;
    this.lastFacingFlip = this.age;
  }

  setAction(a: DogAction) {
    this.action = a;
    this.actionTime = 0;
  }

  // Approach the stickman to be petted.
  approachPet(stickmanX: number, stickmanSide: 1 | -1) {
    // Sit just in front of the stickman, on the side he's facing.
    this.tx = stickmanX + stickmanSide * 60 * this.scale;
    this.tryFace(stickmanSide > 0 ? -1 : 1); // face the stickman
    this.setAction("approach");
  }

  // Chase the cursor. Returns true if the dog is currently chasing.
  startChase(cursor: { x: number; y: number }) {
    this.cursor = cursor;
    if (this.action !== "chase") {
      this.setAction("chase");
      // happy jump
      this.jumpVel = 220;
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
    this.tailPhase += dt * (6 + this.happy * 10);
    this.headPhase += dt * 2.5;
    this.phase += dt * 8;

    // Jump physics
    if (this.jumpY > 0 || this.jumpVel > 0) {
      this.jumpVel -= 900 * dt;
      this.jumpY += this.jumpVel * dt;
      if (this.jumpY <= 0) {
        this.jumpY = 0;
        this.jumpVel = 0;
      }
    }

    // Local move helper. Returns true when the target was reached.
    // Only flips `facing` when there is a meaningful distance to travel —
    // this prevents the rapid left/right flicker that happened when the dog
    // was sitting at its target and `dx` jittered around zero.
    const HYSTERESIS = 6 * this.scale; // ignore direction changes below this
    const move = (targetX: number, speed: number) => {
      const dx = targetX - this.x;
      const step = speed * this.scale * dt;
      if (Math.abs(dx) <= step) {
        this.x = targetX;
        return true;
      }
      this.x += Math.sign(dx) * step;
      // Only request a facing change when we're clearly moving in that
      // direction — tryFace() additionally enforces the cooldown.
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
        if (!move(this.tx, this.speed)) {
          // walking
        }
        // occasionally play with buddy
        if (this.buddy && Math.random() < 0.004) this.setAction("play");
        break;
      }
      case "play": {
        this.happy = lerp(this.happy, 0.7, dt * 1.5);
        // bounce toward/around buddy
        if (this.buddy) {
          const d = dist(this.x, this.y, this.buddy.x, this.buddy.y);
          if (d > 90 * this.scale) {
            this.tx = this.buddy.x;
            move(this.tx, this.speed * 1.4);
          } else {
            // little hops
            if (this.jumpY === 0 && Math.random() < 0.03) this.jumpVel = 180;
            this.tx = this.buddy.x + rand(-60, 60) * this.scale;
            // request facing change (cooldown-enforced) during playful bouncing
            if (Math.abs(this.tx - this.x) > 14 * this.scale) {
              this.tryFace(this.tx >= this.x ? 1 : -1);
            }
          }
        }
        if (this.actionTime > rand(3, 6)) this.setAction("wander");
        break;
      }
      case "chase": {
        this.happy = 1;
        if (this.cursor) {
          // Move toward cursor but cap speed below cursor speed so we "miss".
          this.tx = this.cursor.x;
          const dx = this.cursor.x - this.x;
          const step = this.speed * 1.6 * this.scale * dt;
          if (Math.abs(dx) > 8) {
            this.x += Math.sign(dx) * step;
            // Request facing change (cooldown-enforced) only when clearly
            // past the cursor — prevents the per-frame spasm when the
            // cursor hovers next to the dog.
            if (Math.abs(dx) > 12 * this.scale) {
              this.tryFace(dx >= 0 ? 1 : -1);
            }
          }
          // random happy hops
          if (this.jumpY === 0 && Math.random() < 0.02) this.jumpVel = 200;
        }
        break;
      }
      case "approach": {
        move(this.tx, this.speed * 1.2);
        if (Math.abs(this.x - this.tx) < 2) {
          this.setAction("petted");
        }
        break;
      }
      case "petted": {
        this.happy = lerp(this.happy, 1, dt * 2);
        // sit, wiggle
        if (this.jumpY === 0 && Math.random() < 0.008) this.jumpVel = 90;
        if (this.actionTime > 2.4) {
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

    const bodyLen = 52 * s;
    const bodyH = 22 * s;
    const legLen = 22 * s;

    // Walking leg offsets (two pairs alternate)
    const swing = (offset: number) => Math.sin(this.phase + offset) * 6 * s;
    const swingY = (offset: number) =>
      Math.max(0, Math.cos(this.phase + offset)) * 4 * s;

    const back = -bodyLen * 0.5;
    const front = bodyLen * 0.5;

    // ---- Legs (drawn first, behind body) ----
    ctx.strokeStyle = this.palette.bodyDark;
    ctx.lineWidth = 5 * s;
    const leg = (x: number, off: number) => {
      const topY = -bodyH * 0.2;
      const footX = x + swing(off);
      const footY = legLen - swingY(off);
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(footX, topY + footY);
      ctx.stroke();
    };
    leg(back + 6 * s, 0);
    leg(back + 6 * s, Math.PI);
    leg(front - 6 * s, Math.PI);
    leg(front - 6 * s, 0);

    // ---- Body ----
    ctx.fillStyle = this.palette.body;
    ctx.strokeStyle = this.palette.bodyDark;
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(back, 0);
    ctx.quadraticCurveTo(back, -bodyH, back + bodyLen * 0.2, -bodyH * 0.95);
    ctx.quadraticCurveTo(front, -bodyH, front, -bodyH * 0.2);
    ctx.quadraticCurveTo(front, 0, front - bodyLen * 0.1, 0);
    ctx.quadraticCurveTo(back + bodyLen * 0.5, bodyH * 0.55, back, bodyH * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Belly highlight
    ctx.fillStyle = this.palette.belly;
    ctx.beginPath();
    ctx.ellipse(0, bodyH * 0.2, bodyLen * 0.35, bodyH * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // ---- Tail ----
    const wag = Math.sin(this.tailPhase) * (0.4 + this.happy * 0.8);
    ctx.strokeStyle = this.palette.bodyDark;
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(back, -bodyH * 0.3);
    ctx.quadraticCurveTo(
      back - 14 * s,
      -bodyH * 0.6 - wag * 10 * s,
      back - 22 * s,
      -bodyH * 0.2 - wag * 18 * s,
    );
    ctx.stroke();

    // ---- Head ----
    const headBob = Math.sin(this.headPhase) * 1.2 * s;
    const headCX = front + 12 * s;
    const headCY = -bodyH * 0.55 + headBob;
    const headR = 13 * s;
    ctx.fillStyle = this.palette.body;
    ctx.strokeStyle = this.palette.bodyDark;
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Snout
    ctx.beginPath();
    ctx.moveTo(headCX + headR * 0.4, headCY + headR * 0.1);
    ctx.quadraticCurveTo(headCX + headR * 1.5, headCY + headR * 0.2, headCX + headR * 1.5, headCY + headR * 0.7);
    ctx.quadraticCurveTo(headCX + headR * 0.6, headCY + headR * 0.8, headCX + headR * 0.4, headCY + headR * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Nose
    ctx.fillStyle = "#1a1410";
    ctx.beginPath();
    ctx.arc(headCX + headR * 1.4, headCY + headR * 0.5, 2.4 * s, 0, Math.PI * 2);
    ctx.fill();

    // Ear (floppy)
    ctx.fillStyle = this.palette.bodyDark;
    ctx.beginPath();
    ctx.moveTo(headCX - headR * 0.2, headCY - headR * 0.7);
    ctx.quadraticCurveTo(headCX - headR * 1.1, headCY - headR * 0.2, headCX - headR * 0.6, headCY + headR * 0.6);
    ctx.quadraticCurveTo(headCX, headCY, headCX + headR * 0.1, headCY - headR * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Eye
    ctx.fillStyle = "#1a1410";
    ctx.beginPath();
    ctx.arc(headCX + headR * 0.4, headCY - headR * 0.15, 1.8 * s, 0, Math.PI * 2);
    ctx.fill();

    // Happy expression when chasing/petted
    if (this.happy > 0.5) {
      ctx.strokeStyle = "#1a1410";
      ctx.lineWidth = 1.4 * s;
      ctx.beginPath();
      ctx.arc(headCX + headR * 0.5, headCY + headR * 0.5, headR * 0.25 * s, 0, Math.PI);
      ctx.stroke();
      // tongue
      ctx.fillStyle = "#e8808f";
      ctx.beginPath();
      ctx.ellipse(headCX + headR * 1.2, headCY + headR * 0.9, headR * 0.18, headR * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
