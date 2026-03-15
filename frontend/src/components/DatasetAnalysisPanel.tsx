import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

import { ParsedDataset } from '../types/types';
import { useAccessibility } from './accessibility/AccessibilitySystem';

type DatasetAnalysisPanelProps = {
  isActive: boolean;
  datasets: ParsedDataset[];
};

const ANALYSIS_STEPS = [
  'Uploading dataset...',
  'Validating file structure...',
  'Parsing rows...',
  'Processing property records...',
  'Analyzing location distribution...',
  'Extracting pricing statistics...',
  'Building searchable dataset...',
  'Preparing system memory...',
  'Finalizing dataset index...',
];
const ANALYSIS_DURATION_MS = 40_000;

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

export function DatasetAnalysisPanel({ isActive, datasets }: DatasetAnalysisPanelProps) {
  const { reduceMotion } = useAccessibility();
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setElapsedMs(0);
      return;
    }

    const start = Date.now();

    const interval = window.setInterval(() => {
      const elapsed = Date.now() - start;
      setElapsedMs(Math.min(ANALYSIS_DURATION_MS, elapsed));
    }, 250);

    return () => window.clearInterval(interval);
  }, [isActive]);

  const stats = useMemo(() => {
    const rowsDetected = datasets.reduce((total, dataset) => total + dataset.rows.length, 0);
    const allColumns = Array.from(new Set(datasets.flatMap((dataset) => dataset.columns))).slice(0, 5);

    const citySet = new Set<string>();
    datasets.forEach((dataset) => {
      dataset.rows.forEach((row) => {
        const cityValue =
          row.City ?? row.city ?? row.LOCATION_CITY ?? row.location_city ?? row.Location ?? row.location;

        if (typeof cityValue === 'string' && cityValue.trim().length > 0) {
          citySet.add(cityValue.trim());
        }
      });
    });

    const cities = Array.from(citySet).slice(0, 3);

    return {
      rowsDetected,
      columns: allColumns,
      cities,
    };
  }, [datasets]);

  const progress = Math.round((elapsedMs / ANALYSIS_DURATION_MS) * 100);
  const stepIndex = Math.min(
    ANALYSIS_STEPS.length - 1,
    Math.floor((elapsedMs / ANALYSIS_DURATION_MS) * ANALYSIS_STEPS.length),
  );
  const elapsedSeconds = Math.min(40, Math.ceil(elapsedMs / 1000));
  const remainingSeconds = Math.max(0, 40 - elapsedSeconds);
  const activityContext = [
    'Checking schema quality and required columns.',
    'Profiling dataset rows, distributions, and missing values.',
    'Preparing entities and signals for assignment engine.',
  ];

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.3 }}
      className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl"
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Dataset Analysis</p>
          <p className="mt-2 text-sm text-slate-300">
            Step {stepIndex + 1} / {ANALYSIS_STEPS.length}
          </p>
          <p className="mt-1 text-xs text-slate-400" aria-live="polite">
            Unknown timer: {elapsedSeconds}s / 40s • {remainingSeconds}s remaining
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-100" aria-live="polite">⚠ {ANALYSIS_STEPS[stepIndex]}</p>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
              initial={reduceMotion ? false : { width: '0%' }}
              animate={{ width: `${progress}%` }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.45 }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400" aria-live="polite">✔ {progress}% complete</p>
          <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/80 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">What is happening now</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-200">
              {activityContext.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Dataset Stats Preview</p>
          <div className="mt-3 space-y-3 text-sm text-slate-200">
            <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Rows detected</p>
              <p className="mt-1 text-lg font-semibold text-cyan-200">{formatCount(stats.rowsDetected)}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Columns detected</p>
              <p className="mt-1">{stats.columns.length > 0 ? stats.columns.join(', ') : 'No columns detected yet.'}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Cities identified</p>
              <p className="mt-1">{stats.cities.length > 0 ? stats.cities.join(', ') : 'No city values detected yet.'}</p>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
