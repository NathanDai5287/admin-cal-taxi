"use client";

import Image, { type StaticImageData } from "next/image";
import { useEffect, useRef } from "react";

import styles from "./hosted-club-orbit.module.css";

export type HostedClub = {
  name: string;
  src: StaticImageData;
  wordmark?: boolean;
  large?: boolean;
};

const revolutionSeconds = 80;
const tau = Math.PI * 2;

export function HostedClubOrbit({ clubs }: { clubs: HostedClub[] }) {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const logos = Array.from(scene.children) as HTMLDivElement[];
    const labels = logos.map((logo) => logo.querySelector("span"));
    let phase = -0.18;
    let width = scene.clientWidth;
    let height = scene.clientHeight;
    let radius = 0;
    let lastFrame: number | null = null;
    let frameId: number | null = null;
    let inView = true;

    function measure() {
      if (!scene) return;
      width = scene.clientWidth;
      height = scene.clientHeight;
      const center = scene.getBoundingClientRect().left + width / 2;
      const room = Math.max(0, Math.min(center, document.documentElement.clientWidth - center) - 12);
      const halfLogo = Math.max(...logos.map((logo) => logo.offsetWidth)) / 2;
      const perspective = 900;
      const depthRadius = Math.min(190, width * 0.27);
      // Bound the entire logo at every angle, including perspective enlargement
      // and the extra depth of its corners when it turns up to 30 degrees.
      const available = Math.max(0, room * (perspective - halfLogo * 0.5) - perspective * halfLogo);
      const safeRadius = Math.sqrt(Math.max(0, available ** 2 - (room * depthRadius) ** 2)) / perspective;
      radius = Math.min(width * 0.44, safeRadius);
    }

    function paint() {
      const depthRadius = Math.min(190, width * 0.27);
      const rise = height * 0.252;

      logos.forEach((logo, index) => {
        const angle = phase + (index / logos.length) * tau;
        const depth = Math.cos(angle);
        const nearness = (depth + 1) / 2;
        const x = Math.sin(angle) * radius;
        const y = depth * rise;
        const z = depth * depthRadius;
        const yaw = -Math.sin(angle) * 30;

        // Perspective changes the size; the far half gently dissolves into white.
        logo.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) rotateY(${yaw.toFixed(2)}deg)`;
        logo.style.opacity = String(0.035 + 0.965 * nearness ** 1.65);
        logo.style.filter = `blur(${((1 - nearness) ** 2 * 1.8).toFixed(2)}px)`;
        logo.style.zIndex = String(Math.round(nearness * 100));
        const label = labels[index];
        if (label) label.style.opacity = String(Math.max(0, (nearness - 0.65) / 0.35));
      });
    }

    function running() {
      return inView && !document.hidden;
    }

    function tick(now: number) {
      frameId = null;
      if (!running()) {
        lastFrame = null;
        return;
      }
      if (lastFrame !== null) {
        phase = (phase + (Math.min(now - lastFrame, 64) / 1000 / revolutionSeconds) * tau) % tau;
      }
      lastFrame = now;
      paint();
      frameId = requestAnimationFrame(tick);
    }

    function sync() {
      if (running() && frameId === null) {
        frameId = requestAnimationFrame(tick);
      } else if (!running()) {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
        lastFrame = null;
      }
    }

    const resize = new ResizeObserver(() => {
      measure();
      paint();
    });
    const visibility = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    resize.observe(scene);
    resize.observe(document.documentElement);
    visibility.observe(scene);
    document.addEventListener("visibilitychange", sync);
    measure();
    paint();
    sync();

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      resize.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [clubs]);

  return (
    <section className={styles.orbit} aria-labelledby="clubs-title">
      <div className={styles.stage}>
        <div className={styles.scene} ref={sceneRef} aria-hidden="true">
          {clubs.map((club) => (
            <div
              className={[styles.logo, club.wordmark && styles.wide, club.large && styles.large].filter(Boolean).join(" ")}
              key={club.name}
            >
              <div className={styles.image}>
                <Image src={club.src} alt="" sizes="120px" loading="eager" draggable={false} />
              </div>
              <span>{club.name}</span>
            </div>
          ))}
        </div>
        <div className={styles.copy}>
          <h2 id="clubs-title">Clubs we&apos;ve hosted</h2>
        </div>
      </div>
      <ul className={styles.accessibleList}>
        {clubs.map((club) => <li key={club.name}>{club.name}</li>)}
      </ul>
    </section>
  );
}
