// Scene — orchestrates the entire birthday experience.
//
// High-level timeline (driven by accumulated `time`):
//   0.0s  hold the "Feliz Aniversário, Julia!" particle text
//   2.0s  text melts down (wax-like pooling)
//   3.6s  particles gather toward the stickman spawn point
//   4.0s  stickman begins forming (opacity rises)
//   5.0s  particles fade, stickman is complete and starts walking to corner
//   ~walk stickman walks to bottom-right
//   throw stickman throws each image to the opposite (left) side
//   sit   stickman sits down and reads
//   loop  continuous carousel + dogs play + cursor chase + periodic re-throw
//
// The Scene owns the canvas, the rAF loop, all entities, and input handling.

import { Dog, DogPalette } from "./Dog";
import { Cat, CatPalette } from "./Cat";
import { FloatingImage } from "./FloatingImage";
import { ParticleText } from "./ParticleText";
import { Stickman } from "./Stickman";
import { clamp, lerp, rand, shuffle } from "./utils";

type Phase = "intro" | "melt" | "gather" | "form" | "walk" | "throw" | "sit" | "loop";

const BLACK_DOG: DogPalette = { body: "#2b2b2b", bodyDark: "#1a1a1a", belly: "#3d3d3d" };
const BEIGE_DOG: DogPalette = { body: "#d9c4a3", bodyDark: "#b59c79", belly: "#ead9bd" };
const BROWN_PUPPY: DogPalette = { body: "#a36a3d", bodyDark: "#7a4d28", belly: "#c79366" };

const BLACK_CAT: CatPalette = { body: "#2b2b2b", bodyDark: "#1a1a1a", belly: "#3d3d3d" };
const BROWN_CAT: CatPalette = {
  body: "#8a5a2b",
  bodyDark: "#5e3d1d",
  belly: "#b07d44",
  patch: "#6b4420",
};
const TUXEDO_CAT: CatPalette = {
  body: "#2b2b2b",
  bodyDark: "#1a1a1a",
  belly: "#f5f5f5",
  patch: "#f5f5f5",
};

// Common surface the Scene uses for both dogs and cats (structural typing).
export interface Pet {
  x: number;
  y: number;
  groundY: number;
  scale: number;
  facing: 1 | -1;
  action: string;
  happy: number;
  buddy?: Pet;
  update(dt: number, minX: number, maxX: number, stickmanX: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  approachPet(stickmanX: number, stickmanSide: 1 | -1): void;
  startChase(cursor: { x: number; y: number }): void;
  stopChase(): void;
  setAction(a: string): void;
}

interface Confetti {
  x: number; y: number; vx: number; vy: number;
  r: number; hue: number; rot: number; vr: number; a: number;
}

export class Scene {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr = 1;
  W = 0;
  H = 0;
  groundY = 0;

  private rafId = 0;
  private lastTime = 0;
  time = 0;
  phase: Phase = "intro";

  particleText: ParticleText | null = null;
  stickman: Stickman;
  dogBlack: Dog;
  dogBeige: Dog;
  dogPuppy: Dog;       // small brown baby dog
  catBlack: Cat;
  catBrown: Cat;
  catTuxedo: Cat;      // white-and-black cat
  private allPets: Pet[] = [];
  images: FloatingImage[] = [];
  private imageEls: HTMLImageElement[] = [];
  private throwQueue: number[] = []; // indices into imageEls
  private nextThrowAt = 0;
  private floatingCount = 0;
  private cycleOrder: number[] = [];
  private cycleIdx = 0;
  private nextRecycleAt = 0;
  private nextDogPetAt = 0;
  private nextReThrowAt = 0;

  confetti: Confetti[] = [];

  // Pointer (mouse / touch)
  pointer = { x: -9999, y: -9999, active: false };
  private pointerTimer = 0;

  onPhaseChange?: (p: Phase) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.resize();
    const sc = this.scale();
    this.stickman = new Stickman(this.W * 0.5, this.groundY, sc);

    // Give each pet a distinct home range across the ground so the group
    // spreads out instead of clumping. Ranges overlap a little so buddies
    // can still meet to play, but each animal spends most of its time in
    // its own zone. Stickman sits at ~0.78W so we keep pets out of his corner.
    const R = (a: number, b: number) => [this.W * a, this.W * b] as const;

    // Two adult dogs — centre-left zone
    {
      const [lo, hi] = R(0.12, 0.36);
      this.dogBlack = new Dog(this.W * 0.20, this.groundY, sc * 0.9, BLACK_DOG);
      this.dogBlack.wanderMin = lo;
      this.dogBlack.wanderMax = hi;
    }
    {
      const [lo, hi] = R(0.40, 0.66);
      this.dogBeige = new Dog(this.W * 0.52, this.groundY, sc * 0.85, BEIGE_DOG);
      this.dogBeige.wanderMin = lo;
      this.dogBeige.wanderMax = hi;
    }
    // Baby dog — small brown puppy, roams near the black dog (its parent)
    {
      const [lo, hi] = R(0.18, 0.42);
      this.dogPuppy = new Dog(this.W * 0.30, this.groundY, sc * 0.55, BROWN_PUPPY);
      this.dogPuppy.wanderMin = lo;
      this.dogPuppy.wanderMax = hi;
      this.dogPuppy.speed = 130; // puppies are sprightly
    }
    // Three cats — spread across the full width
    {
      const [lo, hi] = R(0.04, 0.22);
      this.catBlack = new Cat(this.W * 0.10, this.groundY, sc * 0.7, BLACK_CAT);
      this.catBlack.wanderMin = lo;
      this.catBlack.wanderMax = hi;
    }
    {
      const [lo, hi] = R(0.26, 0.48);
      this.catBrown = new Cat(this.W * 0.38, this.groundY, sc * 0.68, BROWN_CAT);
      this.catBrown.wanderMin = lo;
      this.catBrown.wanderMax = hi;
    }
    {
      const [lo, hi] = R(0.52, 0.72);
      this.catTuxedo = new Cat(this.W * 0.62, this.groundY, sc * 0.72, TUXEDO_CAT);
      this.catTuxedo.wanderMin = lo;
      this.catTuxedo.wanderMax = hi;
    }

    // Cross-link buddies so dogs play with dogs and cats play with cats
    // (and the puppy buddies up with one adult). Keep it light: each animal
    // has at most one buddy to avoid the whole crowd clumping.
    this.dogBlack.buddy = this.dogBeige;
    this.dogBeige.buddy = this.dogBlack;
    this.dogPuppy.buddy = this.dogBlack;
    this.catBlack.buddy = this.catBrown;
    this.catBrown.buddy = this.catTuxedo;
    this.catTuxedo.buddy = this.catBlack;

    this.allPets = [
      this.dogBlack,
      this.dogBeige,
      this.dogPuppy,
      this.catBlack,
      this.catBrown,
      this.catTuxedo,
    ];
    this.spawnConfetti(40);
  }

  scale(): number {
    // Base scale on height so the characters stay well-proportioned and
    // clearly visible across phone, tablet and desktop.
    return clamp(this.H / 520, 0.7, 1.7);
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.max(320, Math.floor(rect.width));
    this.H = Math.max(320, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.W * this.dpr);
    this.canvas.height = Math.floor(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.groundY = this.H * 0.86;
    // Rebuild particle text if size changed significantly
    if (this.particleText && Math.abs(this.particleText.particles.length) > 0) {
      // keep existing during intro; will be rebuilt on explicit reset
    }
  }

  /** Build (or rebuild) the particle text for the current canvas size. */
  initIntro(text: string) {
    this.particleText = new ParticleText(this.W, this.H * 0.5, text, this.dpr);
  }

  async loadImages(paths: string[]) {
    const els = await Promise.all(
      paths.map(
        (p) =>
          new Promise<HTMLImageElement>((res, rej) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = p;
          }),
      ),
    );
    this.imageEls = els;
    // Pre-create FloatingImage wrappers (one per photo, reused).
    this.images = els.map((el) => new FloatingImage(el));
    // Initial throw order is just 0..n
    this.throwQueue = els.map((_, i) => i);
    this.cycleOrder = shuffle(els.map((_, i) => i));
    this.cycleIdx = 0;
  }

  start() {
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  stop() {
    cancelAnimationFrame(this.rafId);
  }

  setPointer(x: number, y: number, active: boolean) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.active = active;
    if (active) this.pointerTimer = 0;
  }

  // ---- Main loop ---------------------------------------------------------

  private loop = (now: number) => {
    this.rafId = requestAnimationFrame(this.loop);
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.05) dt = 0.05; // clamp big frame gaps
    this.time += dt;
    this.update(dt);
    this.draw();
  };

  private setPhase(p: Phase) {
    if (this.phase === p) return;
    this.phase = p;
    this.onPhaseChange?.(p);
  }

  private update(dt: number) {
    // Advance intro timeline
    switch (this.phase) {
      case "intro": {
        if (!this.particleText) this.initIntro("Feliz Aniversário,\nJulia!");
        if (this.time > 2.0) {
          this.particleText?.startMelt();
          this.setPhase("melt");
        }
        break;
      }
      case "melt": {
        if (this.time > 3.6) {
          // gather toward stickman spawn point
          const sx = this.W * 0.5;
          const sy = this.groundY - 60 * this.scale();
          this.particleText?.setGatherPoint(sx, sy);
          this.particleText?.startGather();
          this.stickman.appear();
          this.setPhase("form");
        }
        break;
      }
      case "form": {
        if (this.time > 4.6) this.particleText?.startFade();
        if (this.time > 5.2) {
          // begin walking to bottom-right corner
          this.stickman.walkTo(this.W * 0.78);
          this.setPhase("walk");
        }
        break;
      }
      case "walk": {
        if (!this.stickman.isBusy()) {
          this.setPhase("throw");
          this.nextThrowAt = this.time + 0.2;
          this.throwQueue = this.imageEls.map((_, i) => i);
        }
        break;
      }
      case "throw": {
        if (this.time >= this.nextThrowAt && this.throwQueue.length > 0 && !this.stickman.isBusy()) {
          const idx = this.throwQueue.shift()!;
          this.throwImage(idx);
          this.nextThrowAt = this.time + 0.55;
        }
        if (this.throwQueue.length === 0 && !this.stickman.isBusy() && this.time > this.nextThrowAt) {
          // all thrown; sit down and read
          this.stickman.sitDown();
          this.setPhase("sit");
        }
        break;
      }
      case "sit": {
        if (this.stickman.action === "reading") {
          this.setPhase("loop");
          this.nextDogPetAt = this.time + rand(6, 10);
          this.nextReThrowAt = this.time + rand(12, 18);
          this.nextRecycleAt = this.time + 1.5;
        }
        break;
      }
      case "loop": {
        this.updateLoop(dt);
        break;
      }
    }

    // Always update entities (so movement looks continuous during transitions)
    this.stickman.update(dt);
    for (const pet of this.allPets) {
      pet.update(dt, this.W * 0.1, this.W * 0.72, this.stickman.x);
    }

    // Update floating images
    const topY = this.H * 0.05;
    for (const fi of this.images) {
      if (fi.state === "done") continue;
      fi.update(dt, this.groundY, topY);
    }

    // Confetti drift
    for (const c of this.confetti) {
      c.vy += 30 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      if (c.y > this.H + 20) {
        c.y = -20;
        c.x = rand(0, this.W);
        c.vy = rand(20, 60);
      }
      c.a = 0.5 + Math.sin(this.time + c.x) * 0.2;
    }

    // Particle text
    this.particleText?.update(dt, this.groundY);

    // Pointer decay
    this.pointerTimer += dt;
    if (this.pointerTimer > 2.5) this.pointer.active = false;

    // Dog cursor chase logic
    this.updateDogChase(dt);
  }

  private updateLoop(dt: number) {
    // Recycle finished images back into the carousel (random order/direction)
    if (this.time >= this.nextRecycleAt) {
      this.recycleOne();
      this.nextRecycleAt = this.time + rand(0.8, 1.8);
    }

    // Periodic full re-throw by the stickman for liveliness (rare, so reading
    // is the dominant idle state).
    if (this.time >= this.nextReThrowAt && !this.stickman.isBusy()) {
      this.stickman.standUp();
      this.rethrowOne();
      this.nextReThrowAt = this.time + rand(25, 40);
    }

    // Periodic pet approaches the stickman to be scratched.
    // Any pet (dog or cat) can wander over while the stickman is reading.
    if (this.time >= this.nextDogPetAt && !this.stickman.isBusy() && this.stickman.action === "reading") {
      const candidates = this.allPets.filter(
        (p) => p.action === "wander" || p.action === "play",
      );
      if (candidates.length > 0) {
        const pet = candidates[Math.floor(Math.random() * candidates.length)];
        pet.approachPet(this.stickman.x, this.stickman.facing);
        this.pendingPetDog = pet;
      }
      this.nextDogPetAt = this.time + rand(8, 16);
    }

    // When the approaching pet arrives, trigger the pet/scratch.
    if (this.pendingPetDog && this.pendingPetDog.action === "petted" && !this.stickman.isBusy() && this.stickman.action === "reading") {
      this.stickman.pet(this.pendingPetDog.x, this.pendingPetDog.y);
      this.pendingPetDog = null;
    }
  }

  private pendingPetDog: Pet | null = null;

  private updateDogChase(dt: number) {
    if (!this.pointer.active) {
      for (const pet of this.allPets) pet.stopChase();
      return;
    }
    const chaseRadius = 220 * this.scale();
    for (const pet of this.allPets) {
      const d = Math.hypot(pet.x - this.pointer.x, pet.y - this.pointer.y);
      if (d < chaseRadius) {
        pet.startChase(this.pointer);
      } else if (pet.action === "chase") {
        pet.stopChase();
      }
    }
  }

  private throwImage(idx: number) {
    const fi = this.images[idx];
    if (!fi) return;
    const hand = this.stickman.rightHand();
    // Landing on the opposite side of the screen from the stickman
    const side = this.stickman.x > this.W * 0.5 ? -1 : 1; // throw toward left if on right
    const landX = this.stickman.x + side * rand(this.W * 0.35, this.W * 0.6);
    const landY = this.groundY - rand(0, 20);
    fi.launch(hand.x, hand.y, clamp(landX, this.W * 0.05, this.W * 0.95), landY, 0.85);
    this.stickman.throwTo(clamp(landX, this.W * 0.05, this.W * 0.95), landY, () => {
      // released — image is already flying via its own launch
    });
  }

  private rethrowOne() {
    // pick an image that's currently done or grounded and throw it again
    const idx = this.cycleOrder[this.cycleIdx % this.cycleOrder.length];
    this.cycleIdx++;
    this.images[idx]?.placeOnGround(
      clamp(this.stickman.x - this.W * 0.5, this.W * 0.05, this.W * 0.95),
      this.groundY - rand(0, 20),
    );
    // schedule the actual throw shortly, then sit back down to read.
    setTimeout(() => {
      if (this.phase !== "loop") return;
      this.throwImage(idx);
      // After the throw motion completes (~1s), sit back down and resume reading.
      setTimeout(() => {
        if (this.phase !== "loop") return;
        if (!this.stickman.isBusy()) {
          this.stickman.sitDown();
        }
      }, 1300);
    }, 700);
  }

  private recycleOne() {
    // Find a finished image and relaunch it from the ground (carousel cycle)
    const done = this.images.find((fi) => fi.state === "done");
    if (!done) return;
    // reshuffle order when we've cycled through all
    if (this.cycleIdx >= this.cycleOrder.length) {
      this.cycleOrder = shuffle(this.imageEls.map((_, i) => i));
      this.cycleIdx = 0;
    }
    const idx = this.cycleOrder[this.cycleIdx % this.cycleOrder.length];
    this.cycleIdx++;
    const fi = this.images[idx];
    if (!fi || fi.state === "done" || fi.state === "thrown") {
      // place a fresh one on the ground on a random side
      const fromLeft = Math.random() < 0.5;
      const gx = fromLeft ? rand(this.W * 0.05, this.W * 0.2) : rand(this.W * 0.8, this.W * 0.95);
      fi?.placeOnGround(gx, this.groundY - rand(0, 16));
    }
  }

  private spawnConfetti(n: number) {
    const hues = [340, 30, 50, 180, 260];
    for (let i = 0; i < n; i++) {
      this.confetti.push({
        x: rand(0, this.W),
        y: rand(-this.H, 0),
        vx: rand(-15, 15),
        vy: rand(20, 70),
        r: rand(2, 5),
        hue: hues[i % hues.length],
        rot: rand(0, Math.PI * 2),
        vr: rand(-2, 2),
        a: 0.6,
      });
    }
  }

  // ---- Rendering ---------------------------------------------------------

  private draw() {
    const ctx = this.ctx;
    // Sky gradient background
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, "#ffe9d6");
    g.addColorStop(0.5, "#ffd6e0");
    g.addColorStop(1, "#f6c6d4");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);

    // Soft sun glow
    const sun = ctx.createRadialGradient(this.W * 0.8, this.H * 0.2, 10, this.W * 0.8, this.H * 0.2, this.W * 0.5);
    sun.addColorStop(0, "rgba(255,240,200,0.6)");
    sun.addColorStop(1, "rgba(255,240,200,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, this.W, this.H);

    // Confetti (background layer)
    for (const c of this.confetti) {
      ctx.save();
      ctx.globalAlpha = c.a;
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = `hsl(${c.hue},80%,65%)`;
      ctx.fillRect(-c.r, -c.r * 0.5, c.r * 2, c.r);
      ctx.restore();
    }

    // Ground
    const gg = ctx.createLinearGradient(0, this.groundY, 0, this.H);
    gg.addColorStop(0, "#b68a6a");
    gg.addColorStop(1, "#8a6b50");
    ctx.fillStyle = gg;
    ctx.fillRect(0, this.groundY, this.W, this.H - this.groundY);
    // grass tufts
    ctx.strokeStyle = "rgba(90,140,70,0.6)";
    ctx.lineWidth = 2;
    for (let x = 0; x < this.W; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, this.groundY);
      ctx.lineTo(x + 3, this.groundY - 8);
      ctx.moveTo(x + 4, this.groundY);
      ctx.lineTo(x + 6, this.groundY - 6);
      ctx.stroke();
    }

    // Floating images (behind characters)
    for (const fi of this.images) {
      if (fi.state === "done") continue;
      fi.draw(ctx);
    }

    // Particle text (intro)
    this.particleText?.draw(ctx);

    // Pets (dogs + cats)
    for (const pet of this.allPets) pet.draw(ctx);

    // Stickman
    this.stickman.draw(ctx);

    // Pointer halo (subtle visual feedback on touch devices)
    if (this.pointer.active) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(this.pointer.x, this.pointer.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
