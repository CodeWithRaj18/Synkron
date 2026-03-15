import { PropsWithChildren, useEffect, useState } from 'react';

type ParallaxLayerProps = PropsWithChildren<{
  speed?: number;
  className?: string;
}>;

export function ParallaxLayer({ children, speed = 0.06, className = '' }: ParallaxLayerProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const x = (event.clientX / window.innerWidth - 0.5) * speed * 100;
      const y = (event.clientY / window.innerHeight - 0.5) * speed * 100;
      setOffset({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [speed]);

  return (
    <div
      className={`pointer-events-none absolute inset-0 ${className}`.trim()}
      style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}
