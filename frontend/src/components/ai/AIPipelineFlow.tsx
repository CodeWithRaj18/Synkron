import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  Database,
  FileText,
  Map,
  MessageSquare,
  Search,
  Sparkles,
  Upload,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

type PipelineType = 'realestate' | 'documentation';

type PipelineNode = {
  title: string;
  description: string;
  icon: LucideIcon;
};

type AIPipelineFlowProps = {
  pipelineType: PipelineType;
};

const REAL_ESTATE_PIPELINE: PipelineNode[] = [
  {
    title: 'Dataset Upload',
    description: 'Load company property datasets',
    icon: Upload,
  },
  {
    title: 'Requirement Extraction',
    description: 'Parse location, budget, and preference rules',
    icon: Search,
  },
  {
    title: 'Property Matching Engine',
    description: 'Score and rank suitable projects',
    icon: Brain,
  },
  {
    title: 'Map Visualization',
    description: 'Plot shortlisted properties on map',
    icon: Map,
  },
  {
    title: 'PDF Report Generation',
    description: 'Build a client-ready recommendation report',
    icon: FileText,
  },
];

const DOCUMENTATION_PIPELINE: PipelineNode[] = [
  {
    title: 'User Prompt',
    description: 'Capture documentation goals and constraints',
    icon: MessageSquare,
  },
  {
    title: 'Context Extraction',
    description: 'Read uploaded files and prepare context',
    icon: Database,
  },
  {
    title: 'AI Generation (LLM)',
    description: 'Generate draft content with streaming model',
    icon: Sparkles,
  },
  {
    title: 'Document Structuring',
    description: 'Organize sections for clarity and flow',
    icon: Workflow,
  },
  {
    title: 'Editable Output',
    description: 'Review, edit, and finalize the document',
    icon: FileText,
  },
];

export function AIPipelineFlow({ pipelineType }: AIPipelineFlowProps) {
  const nodes = useMemo(
    () => (pipelineType === 'realestate' ? REAL_ESTATE_PIPELINE : DOCUMENTATION_PIPELINE),
    [pipelineType],
  );
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((previous) => (previous + 1) % nodes.length);
    }, 1400);

    return () => window.clearInterval(timer);
  }, [nodes.length]);

  const title = pipelineType === 'realestate' ? 'Real Estate Pipeline' : 'Documentation Pipeline';

  return (
    <section className="rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 shadow-[0_28px_70px_-45px_rgba(8,145,178,0.75)] backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">AI Pipeline Visualization</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">{title}</h2>
        </div>
        <span className="rounded-full border border-cyan-300/35 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">
          Live Flow
        </span>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-2">
        {nodes.map((node, index) => {
          const Icon = node.icon;
          const isActive = activeIndex === index;

          return (
            <div key={node.title} className="relative flex-1">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.4, delay: index * 0.07 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  boxShadow: isActive
                    ? '0 10px 34px -18px rgba(34,211,238,0.85), 0 0 0 1px rgba(56,189,248,0.85)'
                    : '0 0 0 1px rgba(100,116,139,0.32)',
                }}
                className={[
                  'group h-full rounded-2xl border bg-slate-900/60 p-3.5 backdrop-blur-xl transition-all duration-300',
                  'hover:border-cyan-400 hover:bg-slate-800/80 hover:shadow-xl hover:shadow-cyan-500/10',
                  isActive ? 'border-cyan-400 shadow-lg shadow-cyan-400/30' : 'border-slate-700/50',
                ].join(' ')}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={[
                      'mt-0.5 rounded-lg border p-1.5 transition-colors duration-300',
                      isActive
                        ? 'border-cyan-300/75 bg-cyan-400/20 text-cyan-100'
                        : 'border-slate-600/70 bg-slate-800/80 text-slate-300 group-hover:border-cyan-400/70 group-hover:text-cyan-200',
                    ].join(' ')}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{node.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300/85">{node.description}</p>
                  </div>
                </div>
              </motion.div>

              {index < nodes.length - 1 && (
                <div className="pointer-events-none flex justify-center py-1 md:absolute md:-right-3 md:top-1/2 md:w-6 md:-translate-y-1/2 md:py-0">
                  <div className="relative h-5 w-[2px] md:h-[2px] md:w-full">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 md:bg-gradient-to-r" />
                    <motion.div
                      className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-cyan-200 shadow-[0_0_10px_rgba(103,232,249,0.9)] md:left-0 md:top-1/2 md:-translate-y-1/2"
                      animate={{
                        y: ['0%', '100%'],
                        x: ['0%', '100%'],
                        opacity: [0.4, 1, 0.4],
                      }}
                      transition={{ duration: 1.1, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
                    />
                    <div className="absolute inset-0 animate-pulse rounded-full bg-cyan-400/20" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
