import { useEffect, useRef } from 'react';
import uPlot from 'uplot';

interface SparklineProps {
  title: string;
  color: string;
  points: Array<{ t: number; value: number }>;
  formatValue?: (value: number) => string;
}

export const Sparkline = ({ title, color, points, formatValue }: SparklineProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const animationRef = useRef<number | null>(null);
  const previousDataRef = useRef<[number[], number[]]>([[], []]);

  useEffect(() => {
    if (!containerRef.current || plotRef.current) {
      return;
    }

    const initialX = points.map((point) => point.t / 1000);
    const initialY = points.map((point) => point.value);

    const plot = new uPlot(
      {
        width: 160,
        height: 90,
        legend: { show: false },
        cursor: { show: false },
        scales: {
          x: { time: true },
          y: { auto: true }
        },
        axes: [
          { show: false },
          {
            show: false
          }
        ],
        series: [
          {},
          {
            stroke: color,
            width: 2,
            fill: `${color}22`
          }
        ]
      },
      [initialX, initialY],
      containerRef.current
    );

    plotRef.current = plot;
    previousDataRef.current = [initialX, initialY];

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      plot.destroy();
      plotRef.current = null;
    };
  }, [color]);

  useEffect(() => {
    if (!plotRef.current) {
      return;
    }

    const plot = plotRef.current;
    const targetX = points.map((point) => point.t / 1000);
    const targetY = points.map((point) => point.value);
    const [prevX, prevY] = previousDataRef.current;

    if (targetX.length === 0 || prevX.length !== targetX.length || prevY.length !== targetY.length) {
      plot.setData([targetX, targetY]);
      previousDataRef.current = [targetX, targetY];
      return;
    }

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const durationMs = 260;
    const start = performance.now();

    const step = (now: number): void => {
      const progress = Math.min(1, (now - start) / durationMs);
      const ease = 1 - (1 - progress) * (1 - progress);
      const animatedY = targetY.map((value, index) => {
        const from = prevY[index] ?? value;
        return from + (value - from) * ease;
      });

      plot.setData([targetX, animatedY]);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(step);
        return;
      }

      animationRef.current = null;
      previousDataRef.current = [targetX, targetY];
    };

    animationRef.current = requestAnimationFrame(step);
  }, [points]);

  const latest = points[points.length - 1]?.value ?? 0;

  return (
    <div className="rounded-lg border border-bg-elevated bg-bg-tertiary p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
        <span>{title}</span>
        <span className="font-mono">{formatValue ? formatValue(latest) : latest.toFixed(2)}</span>
      </div>
      <div ref={containerRef} />
    </div>
  );
};
