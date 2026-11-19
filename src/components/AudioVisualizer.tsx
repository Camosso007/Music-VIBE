import { useEffect, useRef } from 'react';
import { SyncedAudioEngine } from '../lib/audioEngine.ts';

interface AudioVisualizerProps {
  engine: SyncedAudioEngine | null;
  isPlaying: boolean;
  partyMode?: boolean;
  height?: number;
}

export function AudioVisualizer({
  engine,
  isPlaying,
  partyMode = false,
  height = 52,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let rafId = 0;
    const barCount = 32;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== h * dpr) {
        canvas.width = width * dpr;
        canvas.height = h * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, h);

      const bars = engine
        ? engine.getFrequencyBars(barCount)
        : Array.from({ length: barCount }, () => 0.08);

      const gap = 4;
      const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount);

      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, '#8B5CF6');
      grad.addColorStop(0.55, '#3B82F6');
      grad.addColorStop(1, partyMode ? '#EC4899' : '#8B5CF6');

      ctx.fillStyle = grad;

      for (let i = 0; i < barCount; i++) {
        const amp = Math.max(0.08, bars[i] ?? 0.08);
        const barH = Math.max(4, amp * (h - 4));
        const x = i * (barWidth + gap);
        const y = h - barH;
        const radius = Math.min(3, barWidth / 2);

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, [radius, radius, 0, 0]);
        ctx.fill();
      }

      ctx.restore();
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [engine, isPlaying, partyMode]);

  return (
    <canvas
      ref={canvasRef}
      style={{ height: `${height}px` }}
      className="w-full block"
    />
  );
}
