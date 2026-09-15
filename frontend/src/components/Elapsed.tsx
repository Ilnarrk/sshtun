import { useEffect, useState } from "react";

export function Elapsed({ startedAt }: { startedAt?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!startedAt) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return <time className="elapsed">{[hours, minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":")}</time>;
}
