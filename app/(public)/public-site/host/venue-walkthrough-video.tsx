"use client";

import { useEffect, useRef, useState } from "react";

export function VenueWalkthroughVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const visibleRef = useRef(false);
  const userPausedRef = useRef(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncState = () => setPlaying(!video.paused);
    video.addEventListener("play", syncState);
    video.addEventListener("pause", syncState);

    const attemptAutoplay = () => {
      if (motionQuery.matches || userPausedRef.current || !visibleRef.current) return;
      video.play().catch(() => setPlaying(false));
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibleRef.current = entry.isIntersecting;
          if (entry.isIntersecting) {
            attemptAutoplay();
          } else {
            video.pause();
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(video);

    const onMotionChange = () => {
      if (motionQuery.matches) {
        video.pause();
      } else {
        attemptAutoplay();
      }
    };
    motionQuery.addEventListener("change", onMotionChange);

    return () => {
      observer.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      video.removeEventListener("play", syncState);
      video.removeEventListener("pause", syncState);
    };
  }, []);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPausedRef.current = false;
      video.play().catch(() => setPlaying(false));
    } else {
      userPausedRef.current = true;
      video.pause();
    }
  };

  return (
    <figure className="host-space-photo host-space-photo-video host-space-photo-real">
      <video
        ref={videoRef}
        aria-label="Video walkthrough of the indoor event space"
        loop
        muted
        playsInline
        preload="auto"
        src="/site/venue-indoor-walkthrough.mp4"
      />
      <button className="host-space-video-toggle" onClick={togglePlayback} type="button">
        {playing ? "Pause" : "Play"}
      </button>
      <figcaption>Walkthrough</figcaption>
    </figure>
  );
}
