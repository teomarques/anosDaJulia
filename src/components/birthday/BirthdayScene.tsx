"use client";

import { useEffect, useRef, useState } from "react";
import { Scene } from "@/lib/animation/Scene";

const PICTURES = [
  "/assets/pictures/WhatsApp Image 2026-06-20 at 23.43.19.jpeg",
  "/assets/pictures/WhatsApp Image 2026-06-20 at 23.59.22.jpeg",
  "/assets/pictures/WhatsApp Image 2026-06-20 at 23.59.35 (1).jpeg",
  "/assets/pictures/WhatsApp Image 2026-06-20 at 23.59.35.jpeg",
  "/assets/pictures/WhatsApp Image 2026-06-20 at 23.59.36.jpeg",
  "/assets/pictures/WhatsApp Image 2026-06-20 at 23.59.38 (1).jpeg",
];

const BACKGROUND_MUSIC = "/assets/audio/the_mountain-birthday-490600.mp3";

export function BirthdayScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [phase, setPhase] = useState<string>("intro");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new Scene(canvas);
    sceneRef.current = scene;
    scene.onPhaseChange = (p) => setPhase(p);

    // Size the canvas to its CSS box, then start.
    scene.resize();
    scene.initIntro("Feliz Aniversário,\nJulia!");
    scene.start();
    void scene.loadImages(PICTURES).catch((err) => {
      console.error("Failed to load pictures:", err);
    });

    const audio = audioRef.current;
    const startAudio = () => {
      if (!audio) return;
      audio.loop = true;
      audio.volume = 0.55;
      void audio.play().catch(() => {
        // Browsers may block autoplay until the first user gesture.
      });
    };
    startAudio();

    // ---- Resize handling (debounced) ----
    let rt: number | undefined;
    const onResize = () => {
      window.clearTimeout(rt);
      rt = window.setTimeout(() => {
        scene.resize();
        // rebuild particle text only while still in intro phases
        if (scene.phase === "intro" || scene.phase === "melt" || scene.phase === "gather" || scene.phase === "form") {
          scene.initIntro("Feliz Aniversário,\nJulia!");
        }
      }, 120);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("pointerdown", startAudio, { once: true });
    window.addEventListener("touchstart", startAudio, { once: true, passive: true });
    window.addEventListener("keydown", startAudio, { once: true });

    // ---- Pointer handling (mouse + touch) ----
    const toLocal = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };
    const onMouseMove = (e: MouseEvent) => {
      const p = toLocal(e.clientX, e.clientY);
      scene.setPointer(p.x, p.y, true);
    };
    const onMouseLeave = () => scene.setPointer(-9999, -9999, false);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const t = e.touches[0];
        const p = toLocal(t.clientX, t.clientY);
        scene.setPointer(p.x, p.y, true);
      }
    };
    const onTouchEnd = () => scene.setPointer(-9999, -9999, false);

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchstart", onTouchMove, { passive: true });

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerdown", startAudio);
      window.removeEventListener("touchstart", startAudio);
      window.removeEventListener("keydown", startAudio);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchstart", onTouchMove);
      audio?.pause();
      scene.stop();
    };
  }, []);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#ffe9d6]">
      <audio ref={audioRef} src={BACKGROUND_MUSIC} preload="auto" aria-hidden="true" className="hidden" />
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        aria-label="Animação interativa de aniversário para a Julia"
      />

      {/* Subtle hint for interaction */}
      {phase === "loop" && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[#3a2e2a]/70 px-4 py-1.5 text-center text-xs font-medium text-white backdrop-blur-sm sm:text-sm">
          Move o rato ou o dedo perto dos cães 🐾
        </div>
      )}
    </div>
  );
}
