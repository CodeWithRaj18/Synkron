import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';

import { ParallaxLayer } from '../components/motion/ParallaxLayer';
import { Reveal } from '../components/motion/Reveal';
import { TemplateMarquee } from '../components/motion/TemplateMarquee';

type NodeParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  hasTarget: boolean;
};

const LETTER_PATTERNS: Record<string, string[]> = {
  S: ['011110', '110001', '110000', '011100', '000110', '100011', '011110'],
  Y: ['100001', '010010', '001100', '000100', '000100', '000100', '000100'],
  N: ['100001', '110001', '101001', '100101', '100011', '100001', '100001'],
  K: ['100001', '100010', '100100', '111000', '100100', '100010', '100001'],
  R: ['111100', '100010', '100010', '111100', '100100', '100010', '100001'],
  O: ['011110', '100001', '100001', '100001', '100001', '100001', '011110'],
};

const AGENTS = [
  'Data Analysis Agent',
  'Planning Agent',
  'Task Assignment Agent',
  'Documentation Agent',
  'Code Generation Agent',
];

function generateSynkronTargets(width: number, height: number): Array<{ x: number; y: number }> {
  const word = 'SYNKRON';
  const pixelSize = Math.max(7, Math.min(13, Math.floor(width / 170)));
  const letterGapPx = Math.max(40, Math.min(50, Math.floor(width * 0.038)));

  const letters = word.split('').map((char) => LETTER_PATTERNS[char]).filter(Boolean);
  const heights = letters.map((pattern) => pattern.length);
  const widths = letters.map((pattern) => pattern[0]?.length ?? 0);
  const totalWidth = widths.reduce((sum, current) => sum + current * pixelSize, 0) + (letters.length - 1) * letterGapPx;
  const maxHeight = Math.max(...heights) * pixelSize;

  const centerX = width / 2;
  const centerY = height / 2;
  const startX = centerX - totalWidth / 2;
  const startY = centerY - maxHeight / 2;

  const points: Array<{ x: number; y: number }> = [];
  let cursorX = startX;

  word.split('').forEach((char, charIndex) => {
    const pattern = LETTER_PATTERNS[char];
    if (!pattern) {
      return;
    }

    pattern.forEach((row, rowIndex) => {
      row.split('').forEach((value, colIndex) => {
        if (value !== '1') {
          return;
        }

        points.push({
          x: cursorX + colIndex * pixelSize,
          y: startY + rowIndex * pixelSize,
        });
      });
    });

    const currentWidth = (pattern[0]?.length ?? 0) * pixelSize;
    if (charIndex < word.length - 1) {
      cursorX += currentWidth + letterGapPx;
    }
  });

  return points;
}

function assignTargets(nodes: NodeParticle[], targets: Array<{ x: number; y: number }>) {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const target = targets[index];

    if (target) {
      node.targetX = target.x;
      node.targetY = target.y;
      node.hasTarget = true;
    } else {
      node.targetX = node.x;
      node.targetY = node.y;
      node.hasTarget = false;
    }
  }
}

function playTick() {
  const audio = new Audio('/sounds/tick.mp3');
  audio.volume = 0.25;
  audio.play().catch(() => {
    // Ignore autoplay failures in unsupported browsers.
  });
}

export function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodesRef = useRef<NodeParticle[]>([]);
  const formationTargetsRef = useRef<Array<{ x: number; y: number }>>([]);
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const bootTimerRef = useRef<number | null>(null);
  const activateTimerRef = useRef<number | null>(null);

  const [booting, setBooting] = useState(false);
  const [activeAgentCount, setActiveAgentCount] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const initializeNodes = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      const targets = generateSynkronTargets(width, height);
      formationTargetsRef.current = targets;

      const nodeCount = Math.max(120, Math.min(180, targets.length + 24));
      const nodes: NodeParticle[] = [];

      for (let index = 0; index < nodeCount; index += 1) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        nodes.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 0.28,
          vy: (Math.random() - 0.5) * 0.28,
          targetX: x,
          targetY: y,
          hasTarget: false,
        });
      }

      assignTargets(nodes, targets);
      nodesRef.current = nodes;
      startTimeRef.current = performance.now();
    };

    const animate = (timestamp: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      context.clearRect(0, 0, width, height);

      const elapsedMs = timestamp - startTimeRef.current;
      const phaseSeconds = elapsedMs / 1000;
      const isForming = phaseSeconds < 2.6;
      const isHolding = phaseSeconds >= 2.6 && phaseSeconds < 4.2;
      const formationMode = isForming || isHolding;

      const pulse = isHolding ? 1 + 0.18 * Math.sin((elapsedMs / 260) * Math.PI) : 1;
      const glowBoost = booting ? 1.25 : 1;
      const nodes = nodesRef.current;

      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];

        if (formationMode && node.hasTarget) {
          node.x += (node.targetX - node.x) * 0.03;
          node.y += (node.targetY - node.y) * 0.03;
          node.vx *= 0.9;
          node.vy *= 0.9;
        } else {
          node.vx += (Math.random() - 0.5) * 0.018;
          node.vy += (Math.random() - 0.5) * 0.018;
          node.vx = Math.max(-0.45, Math.min(0.45, node.vx));
          node.vy = Math.max(-0.45, Math.min(0.45, node.vy));
          node.x += node.vx;
          node.y += node.vy;

          if (node.x <= 0 || node.x >= width) {
            node.vx *= -1;
            node.x = Math.max(0, Math.min(width, node.x));
          }
          if (node.y <= 0 || node.y >= height) {
            node.vy *= -1;
            node.y = Math.max(0, Math.min(height, node.y));
          }
        }
      }

      const linkDistance = 120;
      for (let first = 0; first < nodes.length; first += 1) {
        for (let second = first + 1; second < nodes.length; second += 1) {
          const a = nodes[first];
          const b = nodes[second];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.hypot(dx, dy);

          if (distance > linkDistance) {
            continue;
          }

          const alpha = (1 - distance / linkDistance) * (formationMode ? 0.4 : 0.28) * glowBoost;
          context.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
      }

      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        const formed = formationMode && node.hasTarget;
        const radius = (formed ? 2.2 : 1.75) * pulse * glowBoost;
        context.beginPath();
        context.arc(node.x, node.y, radius, 0, Math.PI * 2);
        context.fillStyle = formed
          ? 'rgba(125, 211, 252, 0.92)'
          : `rgba(34, 211, 238, ${0.72 * glowBoost})`;
        context.shadowBlur = formed ? 12 * glowBoost : 8 * glowBoost;
        context.shadowColor = formed ? 'cyan' : 'rgba(56, 189, 248, 0.85)';
        context.fill();
      }

      context.shadowBlur = 0;
      frameRef.current = window.requestAnimationFrame(animate);
    };

    const onResize = () => initializeNodes();

    initializeNodes();
    frameRef.current = window.requestAnimationFrame(animate);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [booting]);

  useEffect(() => {
    if (!booting) {
      setActiveAgentCount(0);
      return;
    }

    setActiveAgentCount(0);

    activateTimerRef.current = window.setInterval(() => {
      setActiveAgentCount((previous) => {
        if (previous >= AGENTS.length) {
          return previous;
        }

        playTick();
        return previous + 1;
      });
    }, 600);

    bootTimerRef.current = window.setTimeout(() => {
      window.location.href = '/dashboard';
    }, 3500);

    return () => {
      if (activateTimerRef.current !== null) {
        window.clearInterval(activateTimerRef.current);
      }
      if (bootTimerRef.current !== null) {
        window.clearTimeout(bootTimerRef.current);
      }
    };
  }, [booting]);

  const handleEnterDashboard = () => {
    if (booting) {
      return;
    }

    // Immediate confirmation tick as soon as initialization starts.
    playTick();
    setBooting(true);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 z-0">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.13),transparent_38%),linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.68))]" />
      </div>

      <ParallaxLayer speed={0.08} className="z-20">
        <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-zinc-800/30 blur-3xl" />
        <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-zinc-700/25 blur-3xl" />
      </ParallaxLayer>
      <div className="ambient-grid z-20" />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <Reveal>
          <section className="relative flex min-h-[calc(100vh-11rem)] items-center">
            <div className="relative w-full p-2 sm:p-4 lg:p-6">
              <div className="line-shimmer absolute left-2 right-2 top-0 sm:left-4 sm:right-4 lg:left-6 lg:right-6" />
              <p className="text-base font-semibold uppercase tracking-[0.28em] text-white sm:text-lg">SYNKRON</p>
              <h1 className="mt-5 max-w-4xl font-['Manrope'] text-4xl font-semibold leading-tight sm:text-6xl lg:text-7xl">
                Multi-agent AI workflow automation for real project execution.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-200 sm:text-lg">
                Synkron orchestrates specialized AI agents to analyze datasets, assign tasks intelligently, generate delivery roadmaps, and produce implementation-ready code.
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleEnterDashboard}
                  className="button-animated inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200"
                >
                  Enter Dashboard
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.history.pushState({}, '', '/documentation');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-black/20 px-5 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-900/70"
                >
                  Explore Features
                </button>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal delayMs={110}>
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
            <div className="mb-4">
              <h2 className="font-['Manrope'] text-2xl font-semibold">Synkron Core Capabilities</h2>
              <p className="mt-1 text-sm text-zinc-400">Feature rails focused on multi-agent planning, orchestration, and code delivery.</p>
            </div>
            <TemplateMarquee />
          </section>
        </Reveal>
      </div>

      {booting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
          <div className="w-full max-w-3xl rounded-2xl border border-zinc-800 bg-black/85 p-6 font-mono text-green-400 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">SYNKRON AI INITIALIZING...</p>
            <div className="mt-4 space-y-2 text-sm tracking-wide">
              {AGENTS.slice(0, activeAgentCount).map((agent) => (
                <p key={agent} className="animate-[fadeIn_0.35s_ease-out]">
                  ✓ {agent} Activated
                </p>
              ))}
            </div>

            <div className="mt-6 border-t border-zinc-800 pt-4">
              <p className="text-sm text-cyan-300">
                SYSTEM READY<span className="animate-pulse">_</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
