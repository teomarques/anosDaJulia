// Stickman — the main character of the birthday scene.
//
// Built with forward-kinematics: each limb is a chain of segments defined by
// angles (measured clockwise from the "down" direction, so 0 = straight down,
// +90° = pointing right, -90° = pointing left). Poses are sets of target
// angles that we smoothly damp toward every frame, which gives natural motion
// and makes transitions between behaviours trivial.
//
// Behaviours (driven by the Scene):
//   - forming      : particles gather to build him (drawn faintly)
//   - walkTo(x)    : walks to a target x on the ground
//   - throwTo(p)   : wind-up + release an image toward a landing point
//   - sitDown()    : folds legs and lowers to the ground
//   - read()       : idle reading pose (book in hands)
//   - pet(dog)     : leans and reaches a hand out to scratch a dog
//   - standUp()    : rises from sitting back to standing

import { clamp, damp, lerp, rand, smootherstep } from "./utils";

interface Pose {
  torso: number;       // torso lean (0 = upright), radians
  head: number;        // head tilt, radians
  uArmL: number;       // upper-arm L angle (from down)
  lArmL: number;       // lower-arm L angle (relative to upper arm)
  uArmR: number;
  lArmR: number;
  uLegL: number;       // upper-leg L angle (from down)
  lLegL: number;       // lower-leg L angle (relative to upper leg)
  uLegR: number;
  lLegR: number;
  hipY: number;        // hip height offset from ground (0 = standing root)
}

// Segment lengths in scene units (scaled later by `scale`).
const SEG = {
  torso: 58,
  neck: 14,
  headR: 15,
  uArm: 30,
  lArm: 28,
  uLeg: 34,
  lLeg: 32,
  hand: 6,
  foot: 12,
};

// Direction vector for an angle measured clockwise from straight-down.
const dir = (a: number): [number, number] => [Math.sin(a), Math.cos(a)];

const POSE_STAND: Pose = {
  torso: 0, head: 0,
  uArmL: 0.18, lArmL: 0.12,
  uArmR: -0.18, lArmR: -0.12,
  uLegL: 0.14, lLegL: 0.05,
  uLegR: -0.14, lLegR: -0.05,
  hipY: 0,
};

export type StickmanAction =
  | "forming"
  | "idle"
  | "walk"
  | "throw"
  | "sitDown"
  | "reading"
  | "pet"
  | "standUp";

export class Stickman {
  // World position of the feet midpoint on the ground line.
  x: number;
  groundY: number;
  scale: number;

  // Current joint angles (the values we actually render).
  p: Pose = { ...POSE_STAND };
  // Target pose we damp toward.
  target: Pose = { ...POSE_STAND };

  action: StickmanAction = "forming";
  actionTime = 0;       // seconds since action started
  actionDur = 1;        // duration of current action
  facing: 1 | -1 = 1;   // 1 = facing right, -1 = facing left

  // Walk state
  walkTargetX: number;
  walkSpeed = 120;      // scene units / second
  walkPhase = 0;

  // Throw state
  throwLandingX = 0;
  throwLandingY = 0;
  throwReleased = false;     // set true once the image leaves the hand
  throwOnRelease?: () => void;

  // Book / pet state
  bookOpen = 0;          // 0..1 how open the book is
  petTargetX = 0;
  petTargetY = 0;

  // Opacity used during the "forming" intro.
  opacity = 0;

  constructor(x: number, groundY: number, scale: number) {
    this.x = x;
    this.groundY = groundY;
    this.scale = scale;
    this.walkTargetX = x;
  }

  // ---- Behaviour triggers (called by Scene) -------------------------------

  appear() {
    this.action = "forming";
    this.actionTime = 0;
    this.actionDur = 1.0;
    this.opacity = 0;
  }

  walkTo(x: number) {
    this.walkTargetX = x;
    this.facing = x >= this.x ? 1 : -1;
    this.action = "walk";
    this.actionTime = 0;
    this.walkPhase = 0;
  }

  throwTo(landingX: number, landingY: number, onRelease: () => void) {
    this.throwLandingX = landingX;
    this.throwLandingY = landingY;
    this.throwOnRelease = onRelease;
    this.throwReleased = false;
    this.facing = landingX >= this.x ? 1 : -1;
    this.action = "throw";
    this.actionTime = 0;
    this.actionDur = 0.9;
  }

  sitDown() {
    this.action = "sitDown";
    this.actionTime = 0;
    this.actionDur = 1.0;
  }

  read() {
    this.action = "reading";
    this.actionTime = 0;
    this.bookOpen = 0;
  }

  pet(dogX: number, dogY: number) {
    this.petTargetX = dogX;
    this.petTargetY = dogY;
    this.facing = dogX >= this.x ? 1 : -1;
    this.action = "pet";
    this.actionTime = 0;
    this.actionDur = 1.6;
  }

  standUp() {
    this.action = "standUp";
    this.actionTime = 0;
    this.actionDur = 0.6;
  }

  // ---- Per-frame update ---------------------------------------------------

  update(dt: number) {
    this.actionTime += dt;

    switch (this.action) {
      case "forming": {
        const t = smootherstep(0, this.actionDur, this.actionTime);
        this.opacity = t;
        this.target = { ...POSE_STAND };
        if (this.actionTime >= this.actionDur) {
          this.opacity = 1;
          this.action = "idle";
        }
        break;
      }
      case "idle": {
        this.target = { ...POSE_STAND };
        break;
      }
      case "walk": {
        const dx = this.walkTargetX - this.x;
        const step = this.walkSpeed * this.scale * dt;
        if (Math.abs(dx) <= step) {
          this.x = this.walkTargetX;
          this.target = { ...POSE_STAND };
          this.action = "idle";
          this.actionTime = 0;
        } else {
          this.x += Math.sign(dx) * step;
          this.walkPhase += dt * 9;
          const swing = 0.55;
          const s = Math.sin(this.walkPhase);
          this.target = {
            ...POSE_STAND,
            uLegL: 0.14 + swing * s,
            lLegL: 0.05 + Math.max(0, s) * 0.35,
            uLegR: -0.14 + swing * -s,
            lLegR: -0.05 + Math.max(0, -s) * 0.35,
            uArmL: 0.18 + swing * -s * 0.8,
            uArmR: -0.18 + swing * s * 0.8,
            torso: 0.06,
          };
        }
        break;
      }
      case "throw": {
        // 0..0.35 wind up (arm back), 0.35..0.5 release, 0.5..0.9 recover
        const t = this.actionTime;
        const face = this.facing;
        if (t < 0.35) {
          const k = smootherstep(0, 0.35, t);
          this.target = {
            ...POSE_STAND,
            uArmR: face * lerp(-0.18, -2.4, k),
            lArmR: face * lerp(-0.12, -0.6, k),
            uArmL: 0.18 + face * 0.4 * k,
            torso: face * 0.12 * k,
            head: face * -0.1 * k,
          };
        } else if (t < 0.5) {
          const k = smootherstep(0.35, 0.5, t);
          this.target = {
            ...POSE_STAND,
            uArmR: face * lerp(-2.4, 1.1, k),
            lArmR: face * lerp(-0.6, 0.2, k),
            uArmL: 0.18,
            torso: face * lerp(0.12, -0.1, k),
            head: face * lerp(-0.1, 0.12, k),
          };
          if (!this.throwReleased && k > 0.6) {
            this.throwReleased = true;
            this.throwOnRelease?.();
          }
        } else {
          const k = smootherstep(0.5, 0.9, t);
          this.target = {
            ...POSE_STAND,
            uArmR: face * lerp(1.1, -0.18, k),
            lArmR: face * lerp(0.2, -0.12, k),
            torso: face * lerp(-0.1, 0, k),
            head: face * lerp(0.12, 0, k),
          };
          if (t >= this.actionDur) {
            this.action = "idle";
            this.actionTime = 0;
          }
        }
        break;
      }
      case "sitDown": {
        // Two-stage sit for a natural motion:
        //  stage A (0..0.5): hip lowers, arms come down to a neutral forward
        //    position, legs start extending forward.
        //  stage B (0.5..1.0): legs fully stretch forward, arms settle into
        //    the book-holding position.
        const face = this.facing;
        const T = this.actionTime;
        const dur = this.actionDur;
        const sit: Pose = {
          torso: 0.05, head: 0.04,
          uArmL: -2.10, lArmL: 0.15,
          uArmR: -1.90, lArmR: 0.15,
          uLegL: face * 1.50, lLegL: 0.05,
          uLegR: face * 1.58, lLegR: 0.05,
          hipY: SEG.uLeg + SEG.lLeg - 6,
        };
        // mid pose: hip halfway down, arms hanging forward-low, legs starting
        const mid: Pose = {
          torso: 0.03, head: 0.08,
          uArmL: -2.00, lArmL: 0.10,
          uArmR: -2.00, lArmR: 0.10,
          uLegL: face * 0.75, lLegL: 0.03,
          uLegR: face * 0.79, lLegR: 0.03,
          hipY: (SEG.uLeg + SEG.lLeg - 6) * 0.5,
        };
        if (T < dur * 0.5) {
          const k = smootherstep(0, dur * 0.5, T);
          this.target = {
            torso: lerp(POSE_STAND.torso, mid.torso, k),
            head: lerp(POSE_STAND.head, mid.head, k),
            uArmL: lerp(POSE_STAND.uArmL, mid.uArmL, k),
            lArmL: lerp(POSE_STAND.lArmL, mid.lArmL, k),
            uArmR: lerp(POSE_STAND.uArmR, mid.uArmR, k),
            lArmR: lerp(POSE_STAND.lArmR, mid.lArmR, k),
            uLegL: lerp(POSE_STAND.uLegL, mid.uLegL, k),
            lLegL: lerp(POSE_STAND.lLegL, mid.lLegL, k),
            uLegR: lerp(POSE_STAND.uLegR, mid.uLegR, k),
            lLegR: lerp(POSE_STAND.lLegR, mid.lLegR, k),
            hipY: lerp(POSE_STAND.hipY, mid.hipY, k),
          };
        } else {
          const k = smootherstep(dur * 0.5, dur, T);
          this.target = {
            torso: lerp(mid.torso, sit.torso, k),
            head: lerp(mid.head, sit.head, k),
            uArmL: lerp(mid.uArmL, sit.uArmL, k),
            lArmL: lerp(mid.lArmL, sit.lArmL, k),
            uArmR: lerp(mid.uArmR, sit.uArmR, k),
            lArmR: lerp(mid.lArmR, sit.lArmR, k),
            uLegL: lerp(mid.uLegL, sit.uLegL, k),
            lLegL: lerp(mid.lLegL, sit.lLegL, k),
            uLegR: lerp(mid.uLegR, sit.uLegR, k),
            lLegR: lerp(mid.lLegR, sit.lLegR, k),
            hipY: lerp(mid.hipY, sit.hipY, k),
          };
        }
        if (T >= dur) this.read();
        break;
      }
      case "reading": {
        // Seated upright (tronco reto), legs stretched forward, both hands
        // forward and close together holding a small open book. Gentle
        // breathing bob on the torso.
        this.bookOpen = clamp(this.bookOpen + dt * 2, 0, 1);
        const face = this.facing;
        const bob = Math.sin(this.actionTime * 1.4) * 0.02;
        this.target = {
          torso: 0.05 + bob,
          head: 0.04,
          uArmL: -2.10,
          lArmL: 0.15,
          uArmR: -1.90,
          lArmR: 0.15,
          uLegL: face * 1.50,
          lLegL: 0.05,
          uLegR: face * 1.58,
          lLegR: 0.05,
          hipY: SEG.uLeg + SEG.lLeg - 6,
        };
        break;
      }
      case "pet": {
        // From the seated reading pose, close the book and reach the right
        // hand forward-down to scratch the dog, wag a little, then return.
        this.bookOpen = clamp(this.bookOpen - dt * 3, 0, 1);
        const t = this.actionTime;
        const face = this.facing;
        const sit = {
          torso: 0.05, head: 0.04,
          uArmL: -2.10, lArmL: 0.15,
          uArmR: -1.90, lArmR: 0.15,
          uLegL: face * 1.50, lLegL: 0.05,
          uLegR: face * 1.58, lLegR: 0.05,
          hipY: SEG.uLeg + SEG.lLeg - 6,
        };
        if (t < 0.3) {
          const k = smootherstep(0, 0.3, t);
          this.target = {
            torso: lerp(sit.torso, 0.14, k),
            head: lerp(sit.head, 0.0, k),
            uArmL: sit.uArmL, lArmL: sit.lArmL,
            uArmR: lerp(sit.uArmR, -2.45, k),
            lArmR: lerp(sit.lArmR, 0.35, k),
            uLegL: sit.uLegL, lLegL: sit.lLegL,
            uLegR: sit.uLegR, lLegR: sit.lLegR,
            hipY: sit.hipY,
          };
        } else if (t < this.actionDur - 0.3) {
          const wag = Math.sin((t - 0.3) * 14) * 0.12;
          this.target = {
            torso: 0.14, head: 0.0,
            uArmL: sit.uArmL, lArmL: sit.lArmL,
            uArmR: -2.45 + wag, lArmR: 0.35,
            uLegL: sit.uLegL, lLegL: sit.lLegL,
            uLegR: sit.uLegR, lLegR: sit.lLegR,
            hipY: sit.hipY,
          };
        } else {
          const k = smootherstep(this.actionDur - 0.3, this.actionDur, t);
          this.target = {
            torso: lerp(0.14, sit.torso, k),
            head: lerp(0.0, sit.head, k),
            uArmL: sit.uArmL, lArmL: sit.lArmL,
            uArmR: lerp(-2.45, sit.uArmR, k),
            lArmR: lerp(0.35, sit.lArmR, k),
            uLegL: sit.uLegL, lLegL: sit.lLegL,
            uLegR: sit.uLegR, lLegR: sit.lLegR,
            hipY: sit.hipY,
          };
          if (t >= this.actionDur) this.read();
        }
        break;
      }
      case "standUp": {
        const k = smootherstep(0, this.actionDur, this.actionTime);
        const face = this.facing;
        // read pose -> stand pose interpolation. Mirrors the `reading` pose:
        const readPose: Pose = {
          torso: 0.05, head: 0.04,
          uArmL: -2.10, lArmL: 0.15, uArmR: -1.90, lArmR: 0.15,
          uLegL: face * 1.50, lLegL: 0.05, uLegR: face * 1.58, lLegR: 0.05,
          hipY: SEG.uLeg + SEG.lLeg - 6,
        };
        this.target = {
          torso: lerp(readPose.torso, POSE_STAND.torso, k),
          head: lerp(readPose.head, POSE_STAND.head, k),
          uArmL: lerp(readPose.uArmL, POSE_STAND.uArmL, k),
          lArmL: lerp(readPose.lArmL, POSE_STAND.lArmL, k),
          uArmR: lerp(readPose.uArmR, POSE_STAND.uArmR, k),
          lArmR: lerp(readPose.lArmR, POSE_STAND.lArmR, k),
          uLegL: lerp(readPose.uLegL, POSE_STAND.uLegL, k),
          lLegL: lerp(readPose.lLegL, POSE_STAND.lLegL, k),
          uLegR: lerp(readPose.uLegR, POSE_STAND.uLegR, k),
          lLegR: lerp(readPose.lLegR, POSE_STAND.lLegR, k),
          hipY: lerp(readPose.hipY, POSE_STAND.hipY, k),
        };
        if (this.actionTime >= this.actionDur) {
          this.action = "idle";
          this.actionTime = 0;
        }
        break;
      }
    }

    // Damp current pose toward target (frame-rate independent).
    const k = damp(0.06, dt);
    const d = (a: number, b: number) => lerp(a, b, k);
    this.p.torso = d(this.p.torso, this.target.torso);
    this.p.head = d(this.p.head, this.target.head);
    this.p.uArmL = d(this.p.uArmL, this.target.uArmL);
    this.p.lArmL = d(this.p.lArmL, this.target.lArmL);
    this.p.uArmR = d(this.p.uArmR, this.target.uArmR);
    this.p.lArmR = d(this.p.lArmR, this.target.lArmR);
    this.p.uLegL = d(this.p.uLegL, this.target.uLegL);
    this.p.lLegL = d(this.p.lLegL, this.target.lLegL);
    this.p.uLegR = d(this.p.uLegR, this.target.uLegR);
    this.p.lLegR = d(this.p.lLegR, this.target.lLegR);
    this.p.hipY = d(this.p.hipY, this.target.hipY);
  }

  // ---- Rendering ----------------------------------------------------------

  draw(ctx: CanvasRenderingContext2D) {
    if (this.opacity <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = this.opacity;
    const s = this.scale;
    const face = this.facing;

    // Hip position (hipY is how far the hip sits above the ground line).
    const hipX = this.x;
    const hipY = this.groundY - (SEG.uLeg + SEG.lLeg - this.p.hipY) * s;

    // Torso goes up from hip.
    const [tx, ty] = dir(this.p.torso + Math.PI); // up
    const neckX = hipX + tx * SEG.torso * s;
    const neckY = hipY + ty * SEG.torso * s;
    const headCX = neckX + Math.sin(this.p.torso + this.p.head + Math.PI) * (SEG.neck + SEG.headR) * s;
    const headCY = neckY + Math.cos(this.p.torso + this.p.head + Math.PI) * (SEG.neck + SEG.headR) * s;

    // Shoulders at neck base.
    const shX = neckX, shY = neckY;

    // Arms (right arm uses facing so "throwing arm" is the outer one).
    const armR = (a1: number, a2: number) => {
      const [ux, uy] = dir(this.p.torso + Math.PI + a1 * face);
      const elX = shX + ux * SEG.uArm * s;
      const elY = shY + uy * SEG.uArm * s;
      const [lx, ly] = dir(this.p.torso + Math.PI + (a1 + a2) * face);
      const hX = elX + lx * SEG.lArm * s;
      const hY = elY + ly * SEG.lArm * s;
      return { elX, elY, hX, hY };
    };
    const armL = armR(this.p.uArmL, this.p.lArmL);
    const armRA = armR(this.p.uArmR, this.p.lArmR);

    // Legs from hip.
    const leg = (a1: number, a2: number) => {
      const [ux, uy] = dir(a1);
      const knX = hipX + ux * SEG.uLeg * s;
      const knY = hipY + uy * SEG.uLeg * s;
      const [lx, ly] = dir(a1 + a2);
      const ftX = knX + lx * SEG.lLeg * s;
      const ftY = knY + ly * SEG.lLeg * s;
      return { knX, knY, ftX, ftY };
    };
    const legL = leg(this.p.uLegL, this.p.lLegL);
    const legR = leg(this.p.uLegR, this.p.lLegR);

    // Styling: warm hand-drawn ink look.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#3a2e2a";
    ctx.fillStyle = "#3a2e2a";
    ctx.lineWidth = 5 * s;

    // Legs
    this.line(ctx, hipX, hipY, legL.knX, legL.knY);
    this.line(ctx, legL.knX, legL.knY, legL.ftX, legL.ftY);
    this.line(ctx, hipX, hipY, legR.knX, legR.knY);
    this.line(ctx, legR.knX, legR.knY, legR.ftX, legR.ftY);
    // Feet
    this.shoe(ctx, legL.ftX, legL.ftY, -1);
    this.shoe(ctx, legR.ftX, legR.ftY, -1);

    // Torso
    this.line(ctx, hipX, hipY, neckX, neckY);

    // Arms
    this.line(ctx, shX, shY, armL.elX, armL.elY);
    this.line(ctx, armL.elX, armL.elY, armL.hX, armL.hY);
    this.line(ctx, shX, shY, armRA.elX, armRA.elY);
    this.line(ctx, armRA.elX, armRA.elY, armRA.hX, armRA.hY);
    // Hands
    this.dot(ctx, armL.hX, armL.hY, SEG.hand * s);
    this.dot(ctx, armRA.hX, armRA.hY, SEG.hand * s);

    // Head
    ctx.beginPath();
    ctx.arc(headCX, headCY, SEG.headR * s, 0, Math.PI * 2);
    ctx.fillStyle = "#f7d9b5";
    ctx.fill();
    ctx.lineWidth = 4 * s;
    ctx.strokeStyle = "#3a2e2a";
    ctx.stroke();
    // Simple face (eyes), facing direction
    const eyeOffX = face * SEG.headR * 0.35 * s;
    const eyeOffY = -SEG.headR * 0.1 * s;
    ctx.fillStyle = "#3a2e2a";
    ctx.beginPath();
    ctx.arc(headCX + eyeOffX - 3 * s, headCY + eyeOffY, 1.6 * s, 0, Math.PI * 2);
    ctx.arc(headCX + eyeOffX + 3 * s, headCY + eyeOffY, 1.6 * s, 0, Math.PI * 2);
    ctx.fill();
    // tiny smile when reading is calm
    if (this.action === "reading" || this.action === "pet") {
      ctx.beginPath();
      ctx.arc(headCX + eyeOffX, headCY + SEG.headR * 0.25 * s, SEG.headR * 0.3 * s, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.lineWidth = 1.6 * s;
      ctx.stroke();
    }

    // Book while reading/petting/standing
    if ((this.action === "reading" || this.action === "pet" || this.action === "standUp" || this.action === "sitDown") && this.bookOpen > 0.01) {
      this.drawBook(ctx, armL.hX, armL.hY, armRA.hX, armRA.hY, this.bookOpen);
    }

    ctx.restore();
  }

  private line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  private dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private shoe(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.ellipse(dir * SEG.foot * 0.5 * this.scale, 0, SEG.foot * this.scale, SEG.foot * 0.45 * this.scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#3a2e2a";
    ctx.fill();
    ctx.restore();
  }

  private drawBook(ctx: CanvasRenderingContext2D, hLx: number, hLy: number, hRx: number, hRy: number, open: number) {
    const s = this.scale;
    // FIXED small book size — never scales with hand distance, so it can never
    // cover the stickman. Centered between the two hands, just below them.
    const cx = (hLx + hRx) / 2;
    const cy = (hLy + hRy) / 2 + 3 * s;
    const w = 30 * s;
    const h = 22 * s;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.facing * 0.12);
    // Back cover
    ctx.fillStyle = "#b23b54";
    ctx.strokeStyle = "#3a2e2a";
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fill();
    ctx.stroke();
    // Open page spread
    ctx.fillStyle = "#fff7ee";
    const spread = open * w * 0.42;
    ctx.beginPath();
    ctx.moveTo(0, -h / 2 + 1 * s);
    ctx.lineTo(spread, -h / 2 + 2 * s);
    ctx.lineTo(spread, h / 2 - 2 * s);
    ctx.lineTo(0, h / 2 - 1 * s);
    ctx.lineTo(-spread, h / 2 - 2 * s);
    ctx.lineTo(-spread, -h / 2 + 2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Spine
    ctx.strokeStyle = "rgba(58,46,42,0.5)";
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(0, -h / 2 + 1 * s);
    ctx.lineTo(0, h / 2 - 1 * s);
    ctx.stroke();
    // Text lines
    for (let i = 0; i < 3; i++) {
      const yy = -h / 2 + (i + 1) * (h / 4);
      ctx.beginPath();
      ctx.moveTo(-spread * 0.7, yy);
      ctx.lineTo(spread * 0.7, yy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Hand position (right hand) — used by Scene to know where images launch from.
  rightHand(): { x: number; y: number } {
    const s = this.scale;
    const face = this.facing;
    const hipY = this.groundY - (SEG.uLeg + SEG.lLeg - this.p.hipY) * s;
    const [tx, ty] = dir(this.p.torso + Math.PI);
    const neckY = hipY + ty * SEG.torso * s;
    const [ux, uy] = dir(this.p.torso + Math.PI + this.p.uArmR * face);
    const elY = neckY + uy * SEG.uArm * s;
    const [lx, ly] = dir(this.p.torso + Math.PI + (this.p.uArmR + this.p.lArmR) * face);
    const hX = this.x + ux * SEG.uArm * s + lx * SEG.lArm * s;
    const hY = elY + ly * SEG.lArm * s;
    return { x: hX, y: hY };
  }

  isBusy(): boolean {
    return this.action !== "idle" && this.action !== "reading";
  }

  // Random idle micro-bob for liveliness (called when reading)
  headBob(): number {
    return Math.sin(this.actionTime * 1.4) * 0.5;
  }
}
