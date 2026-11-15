"use client";

import { useEffect, useState } from "react";

export const usedSeconds = (startedAt: number) => Math.max(0, Math.floor((Date.now() - startedAt) / 1000));

// A mock exam counts down; practice counts up and never expires. Both are computed from the module's start time
// (not by counting seconds), so a refresh, the review page or a throttled background tab cannot change them.
export default function Timer({
  startedAt,
  limitSeconds,
  onExpire,
}: {
  startedAt: number;
  limitSeconds: number | null;
  onExpire: () => void;
}) {
  const shown = () => {
    const used = usedSeconds(startedAt);
    return limitSeconds === null ? used : Math.max(0, limitSeconds - used);
  };
  const [value, setValue] = useState(shown);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const tick = () => {
      const v = shown();
      setValue(v);
      if (limitSeconds !== null && v <= 0) onExpire();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, limitSeconds]);

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  const showTime = !hidden || (limitSeconds !== null && value <= 300);

  return (
    <button
      onClick={() => setHidden((h) => !h)}
      className="text-sm font-mono font-semibold px-3 py-1 rounded-full bg-white text-black hover:bg-gray-200"
      title={hidden ? "Click to show timer" : "Click to hide timer"}
    >
      {showTime
        ? `${minutes}:${seconds.toString().padStart(2, "0")}`
        : "Hidden"}
    </button>
  );
}
