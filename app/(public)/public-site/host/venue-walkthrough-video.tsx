"use client";

import { useEffect, useRef, useState } from "react";

export function VenueWalkthroughVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPlayback = () => {
      if (motionQuery.matches) {
        video.pause();
        setPlaying(false);
      } else {
        video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      }
    };

    syncPlayback();
    motionQuery.addEventListener("change", syncPlayback);
    return () => motionQuery.removeEventListener("change", syncPlayback);
  }, []);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      video.pause();
      setPlaying(false);
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
