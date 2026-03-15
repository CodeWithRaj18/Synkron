import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAccessibility } from './accessibility/AccessibilitySystem';

type AIProcessingPanelProps = {
  isOpen: boolean;
  contextLabel?: string;
  totalProperties?: number;
  detectedCities?: string[];
  averagePrice?: string;
  topLocations?: string[];
};

const DEFAULT_LOGS = [
  'Initializing AI system...',
  'Loading datasets...',
  'Parsing request...',
  'Extracting key requirements...',
  'Scanning property database...',
  'Analyzing 33,000 listings...',
  'Applying ranking algorithm...',
  'Generating visualization...',
  'Preparing final output...',
  'Completing response...',
];

const PIPELINE_STEPS = [
  'Dataset Upload',
  'Requirement Extraction',
  'Matching Engine',
  'Ranking Algorithm',
  'Visualization',
  'Output Generation',
];

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

function parseCurrencyToNumber(value: string): number | null {
  const numeric = Number(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function formatInrCompact(value: number): string {
  return `INR ${new Intl.NumberFormat('en-IN').format(Math.max(0, Math.round(value)))}`;
}

export function AIProcessingPanel({
  isOpen,
  contextLabel = 'AI Processing in Progress',
  totalProperties,
  detectedCities,
  averagePrice,
  topLocations,
}: AIProcessingPanelProps) {
  const { reduceMotion } = useAccessibility();
  const [visibleLogCount, setVisibleLogCount] = useState(1);
  const [activeNode, setActiveNode] = useState(0);

  const safeCities = detectedCities && detectedCities.length > 0 ? detectedCities.slice(0, 3) : [];
  const safeLocations = topLocations && topLocations.length > 0 ? topLocations.slice(0, 3) : [];

  const derivedTotal = totalProperties && totalProperties > 0 ? totalProperties : 0;
  const derivedAveragePrice = averagePrice ?? '';
  const baseAveragePriceNumber = parseCurrencyToNumber(derivedAveragePrice);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setVisibleLogCount(1);
    setActiveNode(0);

    const logInterval = window.setInterval(() => {
      setVisibleLogCount((previous) => {
        if (previous >= DEFAULT_LOGS.length) {
          return previous;
        }
        return previous + 1;
      });
    }, 900);

    const pipelineInterval = window.setInterval(() => {
      setActiveNode((previous) => (previous + 1) % PIPELINE_STEPS.length);
    }, 900);

    return () => {
      window.clearInterval(logInterval);
      window.clearInterval(pipelineInterval);
    };
  }, [isOpen]);

  const logsToRender = useMemo(() => DEFAULT_LOGS.slice(0, visibleLogCount), [visibleLogCount]);
  const rollingRows = useMemo(() => derivedTotal, [derivedTotal]);
  const rollingAverage = useMemo(() => {
    if (baseAveragePriceNumber === null) {
      return 'Not available';
    }
    return formatInrCompact(baseAveragePriceNumber);
  }, [baseAveragePriceNumber]);
  const rotatingCities = useMemo(() => {
    return safeCities;
  }, [safeCities]);
  const rotatingLocations = useMemo(() => {
    return safeLocations;
  }, [safeLocations]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/95 backdrop-blur-xl">
      <div className="mx-auto flex h-full w-full max-w-7xl items-center px-6 py-8">
        <motion.section
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.3 }}
          className="w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">AI Operations Console</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-100">{contextLabel}</h2>
            </div>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200" aria-live="polite">
              ✔ Active
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="rounded-xl border border-slate-800 bg-black p-5">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">AI System Log</h3>
              <ul className="max-h-[320px] space-y-1 overflow-auto font-mono text-sm text-green-400" aria-live="polite" aria-label="AI processing logs">
                {logsToRender.map((line, index) => (
                  <motion.li
                    key={`${line}-${index}`}
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.22 }}
                    className="whitespace-pre-wrap"
                  >
                    {'>'} {line}
                  </motion.li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">AI Pipeline Visualization</h3>
              <div className="space-y-2">
                {PIPELINE_STEPS.map((step, index) => {
                  const isActive = activeNode === index;
                  return (
                    <div key={step} className="relative">
                      <motion.div
                        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                        animate={{
                          opacity: 1,
                          boxShadow: isActive
                            ? '0 0 0 1px rgba(34,211,238,0.8), 0 0 20px rgba(34,211,238,0.35)'
                            : '0 0 0 1px rgba(71,85,105,0.4)',
                        }}
                        transition={reduceMotion ? { duration: 0 } : { duration: 0.24 }}
                        className={[
                          'rounded-lg border px-3 py-2 text-sm font-medium',
                          isActive
                            ? 'border-cyan-400 bg-cyan-500/10 text-cyan-100'
                            : 'border-slate-700 bg-slate-800/80 text-slate-300',
                        ].join(' ')}
                      >
                        {isActive ? '✔ Active - ' : '○ Pending - '}
                        {step}
                      </motion.div>
                      {index < PIPELINE_STEPS.length - 1 && (
                        <div className="mx-auto h-3 w-[2px] bg-gradient-to-b from-cyan-400 to-blue-500" />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">Dataset Insights</h3>
              <div className="space-y-3 text-sm text-slate-200">
                <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Dataset Loaded</p>
                  <p className="mt-1 text-lg font-semibold text-cyan-200">{rollingRows > 0 ? `${formatCount(rollingRows)} properties` : 'Not available'}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Cities detected</p>
                  <p className="mt-1 text-slate-100">{rotatingCities.length > 0 ? rotatingCities.join(', ') : 'Not available'}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Average property price</p>
                  <p className="mt-1 text-slate-100">{rollingAverage}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Top locations</p>
                  <p className="mt-1 text-slate-100">{rotatingLocations.length > 0 ? rotatingLocations.join(', ') : 'Not available'}</p>
                </div>
              </div>
            </section>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
