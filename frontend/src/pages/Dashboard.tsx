import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, Building2, CheckSquare, ClipboardList, FileText, UserCircle2, Wrench } from 'lucide-react';

import { DatasetAnalysisPanel } from '../components/DatasetAnalysisPanel';
import { ProjectCard } from '../components/ProjectCard';
import { UploadPanel } from '../components/UploadPanel';
import { analyzeProjects, uploadDatasets } from '../services/api';
import {
  AnalysisSnapshot,
  AnalyzeProjectsResponse,
  AnalyzedProject,
  ParsedDataset,
  RoadmapTask,
  UpdatedDataChange,
} from '../types/types';

const DATASET_KEYWORDS: Record<string, string[]> = {
  employees: ['employee', 'team', 'staff', 'resource', 'people'],
  projects: ['project', 'initiative', 'roadmap', 'feature', 'milestone'],
  workload: ['workload', 'capacity', 'allocation', 'availability', 'utilization'],
  skills: ['skill', 'competency', 'expertise', 'certification'],
  real_estate: ['realestate', 'real_estate', 'property', 'residential', 'commercial', 'plot', 'flat'],
};

function inferDatasetType(fileName: string, columns: string[]): string {
  const haystack = `${fileName} ${columns.join(' ')}`.toLowerCase();
  const matched = Object.entries(DATASET_KEYWORDS).find(([, keywords]) =>
    keywords.some((keyword) => haystack.includes(keyword)),
  );
  return matched ? matched[0] : 'generic_dataset';
}

function normalizeRoadmapTasks(tasks: unknown[]): RoadmapTask[] {
  return tasks.map((task) => {
    if (typeof task === 'string') {
      return { task_name: task, completed: false };
    }

    const taskValue = task as Partial<RoadmapTask>;
    return {
      task_name: taskValue.task_name ?? '',
      completed: Boolean(taskValue.completed),
    };
  });
}

function normalizeAnalysisResponse(response: AnalyzeProjectsResponse): AnalyzeProjectsResponse {
  return {
    projects: response.projects.map((project) => ({
      ...project,
      roadmap: project.roadmap.map((milestone) => ({
        ...milestone,
        tasks: normalizeRoadmapTasks(milestone.tasks as unknown[]),
      })),
    })),
  };
}

function buildCompletionState(response: AnalyzeProjectsResponse): Record<string, boolean> {
  const nextState: Record<string, boolean> = {};

  response.projects.forEach((project) => {
    project.roadmap.forEach((milestone, milestoneIndex) => {
      milestone.tasks.forEach((task, taskIndex) => {
        const key = `${project.project_name}::${milestone.week}::${milestoneIndex}::${taskIndex}`;
        nextState[key] = task.completed;
      });
    });
  });

  return nextState;
}

function completionKey(
  projectName: string,
  week: number,
  milestoneIndex: number,
  taskIndex: number,
): string {
  return `${projectName}::${week}::${milestoneIndex}::${taskIndex}`;
}

const ANALYSIS_STORAGE_KEY = 'analysis_projects';
const ANALYSIS_REPORT_STORAGE_KEY = 'analysis_report';
const GEMINI_LOADING_DURATION_MS = 40_000;

function toProjectId(projectName: string): string {
  return encodeURIComponent(projectName.trim().toLowerCase().replace(/\s+/g, '-'));
}

export function Dashboard() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [baseDatasets, setBaseDatasets] = useState<ParsedDataset[]>([]);
  const [updatedDatasets, setUpdatedDatasets] = useState<ParsedDataset[]>([]);
  const [updatedChanges, setUpdatedChanges] = useState<UpdatedDataChange[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzeProjectsResponse | null>(null);
  const [selectedProjectName, setSelectedProjectName] = useState<string | null>(null);
  const [completionState, setCompletionState] = useState<Record<string, boolean>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const allDatasets = useMemo(
    () => [...baseDatasets, ...updatedDatasets],
    [baseDatasets, updatedDatasets],
  );
  const selectedProject = useMemo<AnalyzedProject | null>(() => {
    if (!analysis || !selectedProjectName) {
      return null;
    }

    return analysis.projects.find((project) => project.project_name === selectedProjectName) ?? null;
  }, [analysis, selectedProjectName]);
  const canGenerate = useMemo(() => allDatasets.length > 0 && !isGenerating, [allDatasets, isGenerating]);

  useEffect(() => {
    if (!isProjectDialogOpen) {
      return;
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProjectDialogOpen(false);
      }
    };

    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [isProjectDialogOpen]);

  const handleUpload = async () => {
    setError(null);
    setIsUploading(true);

    try {
      const response = await uploadDatasets(selectedFiles);

      if (baseDatasets.length === 0) {
        setBaseDatasets(response.datasets);
      } else {
        setUpdatedDatasets((previous) => [...previous, ...response.datasets]);

        const newChanges: UpdatedDataChange[] = response.datasets.map((dataset) => ({
          file_name: dataset.file_name,
          dataset_type: inferDatasetType(dataset.file_name, dataset.columns),
          rows_added: dataset.rows.length,
          columns_detected: dataset.columns.length,
          summary: `Added ${dataset.rows.length} rows with ${dataset.columns.length} columns from ${dataset.file_name}`,
        }));

        setUpdatedChanges((previous) => [...previous, ...newChanges]);
      }

      setSelectedFiles([]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClearAll = () => {
    setSelectedFiles([]);
    setBaseDatasets([]);
    setUpdatedDatasets([]);
    setUpdatedChanges([]);
    setAnalysis(null);
    setSelectedProjectName(null);
    setIsProjectDialogOpen(false);
    setCompletionState({});
    setError(null);
  };

  const handleAnalyzeProjects = async () => {
    setError(null);
    setIsGenerating(true);

    try {
      const analysisPromise = analyzeProjects({
        extracted_data: {
          base_data: { datasets: baseDatasets },
          updated_data: {
            new_datasets: updatedDatasets,
            changes: updatedChanges,
          },
          datasets: allDatasets,
        },
      });

      const delayPromise = new Promise<void>((resolve) => {
        window.setTimeout(resolve, GEMINI_LOADING_DURATION_MS);
      });

      const [analysisResponse] = await Promise.all([analysisPromise, delayPromise]);
      const response = normalizeAnalysisResponse(analysisResponse);

      setAnalysis(response);
      localStorage.setItem(ANALYSIS_REPORT_STORAGE_KEY, JSON.stringify(response));
      localStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(response.projects));
      setCompletionState(buildCompletionState(response));
      setSelectedProjectName(response.projects[0]?.project_name ?? null);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Project analysis failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleRoadmapTask = (
    projectName: string,
    week: number,
    milestoneIndex: number,
    taskIndex: number,
    checked: boolean,
  ) => {
    const key = completionKey(projectName, week, milestoneIndex, taskIndex);
    setCompletionState((previous) => ({ ...previous, [key]: checked }));

    setAnalysis((previous) => {
      if (!previous) {
        return previous;
      }

      const next = {
        projects: previous.projects.map((project) => {
          if (project.project_name !== projectName) {
            return project;
          }

          return {
            ...project,
            roadmap: project.roadmap.map((milestone, currentMilestoneIndex) => {
              if (currentMilestoneIndex !== milestoneIndex) {
                return milestone;
              }

              return {
                ...milestone,
                tasks: milestone.tasks.map((task, currentTaskIndex) =>
                  currentTaskIndex === taskIndex ? { ...task, completed: checked } : task,
                ),
              };
            }),
          };
        }),
      };

      localStorage.setItem(ANALYSIS_REPORT_STORAGE_KEY, JSON.stringify(next));
      localStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(next.projects));

      return next;
    });
  };

  const handleExportJson = () => {
    const snapshot: AnalysisSnapshot = {
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      base_data: {
        datasets: baseDatasets,
      },
      updated_data: {
        new_datasets: updatedDatasets,
        changes: updatedChanges,
      },
      analysis,
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `task-analysis-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const applyImportedAnalysis = (rawAnalysis: AnalyzeProjectsResponse | null) => {
    if (!rawAnalysis) {
      setAnalysis(null);
      setCompletionState({});
      setSelectedProjectName(null);
      return;
    }

    const normalized = normalizeAnalysisResponse(rawAnalysis);
    setAnalysis(normalized);
    localStorage.setItem(ANALYSIS_REPORT_STORAGE_KEY, JSON.stringify(normalized));
    localStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(normalized.projects));
    setCompletionState(buildCompletionState(normalized));
    setSelectedProjectName(normalized.projects[0]?.project_name ?? null);
  };

  const handleGenerateCode = (project: AnalyzedProject) => {
    if (analysis) {
      localStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(analysis.projects));
    }

    window.history.pushState({}, '', `/generate/${toProjectId(project.project_name)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleImportJson = async (event: ChangeEvent<HTMLInputElement>) => {
    setError(null);

    try {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      const fileText = await file.text();
      const parsed = JSON.parse(fileText) as Partial<AnalysisSnapshot> & Partial<AnalyzeProjectsResponse>;

      if (Array.isArray(parsed.projects)) {
        applyImportedAnalysis(parsed as AnalyzeProjectsResponse);
      } else {
        const snapshot = parsed as AnalysisSnapshot;
        setBaseDatasets(snapshot.base_data?.datasets ?? []);
        setUpdatedDatasets(snapshot.updated_data?.new_datasets ?? []);
        setUpdatedChanges(snapshot.updated_data?.changes ?? []);
        applyImportedAnalysis(snapshot.analysis ?? null);
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import failed');
    } finally {
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  return (
    <div className="dashboard-shell min-h-screen bg-[radial-gradient(circle_at_top,#0f172a,#020617)] text-slate-100 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:40px_40px]">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">AI Ops Suite</p>
            <h1 className="text-2xl font-semibold text-slate-100">Synkron</h1>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            AI System Active
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-8 px-6 py-8">
        <motion.section
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="rounded-2xl border border-cyan-400/20 bg-slate-900/40 p-6 shadow-lg backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:border-cyan-400/60 hover:shadow-cyan-400/20"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Section 1</p>
              <h2 className="mt-1 border-b border-cyan-400/30 pb-2 text-xl font-semibold text-white">AI Pipeline Selector</h2>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <motion.article
              whileHover={{ scale: 1.02 }}
              role="button"
              tabIndex={0}
              aria-label="Open real estate intelligence pipeline"
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  window.history.pushState({}, '', '/real-estate');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }
              }}
              className="group min-h-[180px] rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-slate-900/40 to-slate-950/60 p-5 shadow-lg backdrop-blur-xl transition-all duration-200 hover:scale-[1.02] hover:border-cyan-400/60 hover:shadow-cyan-400/20"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-500/10 text-emerald-300">
                <Building2 className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-white">Real Estate Intelligence</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                AI-powered property analysis, client requirement matching, and project recommendation.
              </p>
              <button
                type="button"
                onClick={() => {
                  window.history.pushState({}, '', '/real-estate');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                aria-label="Navigate to Real Estate pipeline"
                className="mt-5 inline-flex items-center rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 px-5 py-2 text-sm font-semibold text-white transition-all duration-200 hover:shadow-[0_0_15px_rgba(0,255,255,0.6)]"
              >
                Open Real Estate Pipeline
              </button>
            </motion.article>

            <motion.article
              whileHover={{ scale: 1.02 }}
              role="button"
              tabIndex={0}
              aria-label="Open documentation generator pipeline"
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  window.history.pushState({}, '', '/documentation');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }
              }}
              className="group min-h-[180px] rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-slate-900/40 to-slate-950/60 p-5 shadow-lg backdrop-blur-xl transition-all duration-200 hover:scale-[1.02] hover:border-cyan-400/60 hover:shadow-cyan-400/20"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-sky-400/40 bg-sky-500/10 text-sky-300">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-white">Documentation Generator</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Generate structured technical, legal, and business documentation from uploaded company data.
              </p>
              <button
                type="button"
                onClick={() => {
                  window.history.pushState({}, '', '/documentation');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                aria-label="Navigate to Documentation pipeline"
                className="mt-5 inline-flex items-center rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 px-5 py-2 text-sm font-semibold text-white transition-all duration-200 hover:shadow-[0_0_15px_rgba(0,255,255,0.6)]"
              >
                Open Documentation Pipeline
              </button>
            </motion.article>
          </div>

        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.12 }}
          whileHover={{ scale: 1.01 }}
          className="rounded-2xl border border-cyan-400/20 bg-slate-900/40 p-6 shadow-lg backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:border-cyan-400/60 hover:shadow-cyan-400/20"
        >
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Section 2</p>
            <h2 className="mt-1 border-b border-cyan-400/30 pb-2 text-xl font-semibold text-slate-100">Dataset Management</h2>
            <p className="mt-2 text-sm text-slate-400">
              Upload Company Dataset. Supported files: Excel, CSV, JSON, PDF, Word, TXT.
            </p>
          </div>
          {isUploading || isGenerating ? (
            <DatasetAnalysisPanel isActive={isUploading || isGenerating} datasets={allDatasets} />
          ) : (
            <UploadPanel
              selectedFiles={selectedFiles}
              onFilesChange={setSelectedFiles}
              onUpload={handleUpload}
              isUploading={isUploading}
              onClear={handleClearAll}
              variant="dark"
            />
          )}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.16 }}
          whileHover={{ scale: 1.01 }}
          className="rounded-2xl border border-cyan-400/20 bg-slate-900/40 p-6 shadow-lg backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:border-cyan-400/60 hover:shadow-cyan-400/20"
        >
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Section 3</p>
            <h2 className="mt-1 border-b border-cyan-400/30 pb-2 text-xl font-semibold text-slate-100">Data Processing Tools</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleAnalyzeProjects}
              disabled={!canGenerate}
              aria-label="Analyze projects from uploaded datasets"
              className="inline-flex items-center rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 px-5 py-2 text-sm font-semibold text-white transition duration-200 ease-in-out hover:shadow-[0_0_15px_rgba(0,255,255,0.6)] disabled:cursor-not-allowed disabled:from-slate-500 disabled:to-slate-600"
            >
              {isGenerating ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  AI Analyzing...
                </span>
              ) : (
                'Analyze Projects'
              )}
            </button>
            <button
              onClick={handleExportJson}
              disabled={!analysis}
              aria-label="Export current analysis as JSON"
              className="inline-flex items-center rounded-xl border border-cyan-400/30 bg-slate-900/50 px-5 py-2 text-sm font-semibold text-cyan-100 transition duration-200 ease-in-out hover:shadow-[0_0_15px_rgba(0,255,255,0.6)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export JSON
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              aria-label="Import analysis JSON file"
              className="inline-flex items-center rounded-xl border border-cyan-400/30 bg-slate-900/50 px-5 py-2 text-sm font-semibold text-cyan-100 transition duration-200 ease-in-out hover:shadow-[0_0_15px_rgba(0,255,255,0.6)]"
            >
              Import JSON
            </button>
            <button
              onClick={() => {
                try {
                  const raw = localStorage.getItem(ANALYSIS_REPORT_STORAGE_KEY);
                  if (!raw) {
                    return;
                  }
                  const parsed = JSON.parse(raw);
                  if (parsed && Array.isArray(parsed.projects)) {
                    applyImportedAnalysis(parsed as AnalyzeProjectsResponse);
                  }
                } catch {
                  // Ignore parse failures.
                }
              }}
              aria-label="Load last saved analysis from browser storage"
              className="inline-flex items-center rounded-xl border border-cyan-400/30 bg-slate-900/50 px-5 py-2 text-sm font-semibold text-cyan-100 transition duration-200 ease-in-out hover:shadow-[0_0_15px_rgba(0,255,255,0.6)]"
            >
              Load Last Analysis
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportJson}
              aria-label="Choose analysis JSON file to import"
              className="hidden"
            />
          </div>
          <p className="mt-3 text-sm text-slate-400">Run analysis and manage saved snapshots after datasets are uploaded.</p>
        </motion.section>

        {baseDatasets.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.2 }}
            className="rounded-2xl border border-cyan-400/20 bg-slate-900/40 p-6 shadow-lg backdrop-blur-xl"
          >
            <h2 className="mb-3 border-b border-cyan-400/30 pb-2 text-lg font-semibold text-slate-100">Base Data</h2>
            <ul className="space-y-2 text-sm text-slate-300">
              {baseDatasets.map((dataset) => (
                <li key={dataset.file_name} className="rounded-lg border border-cyan-400/20 bg-slate-900/50 px-3 py-2 shadow-lg">
                  <strong>{dataset.file_name}</strong> - {dataset.rows.length} rows, {dataset.columns.length} columns
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        {updatedDatasets.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.24 }}
            className="rounded-2xl border border-cyan-400/20 bg-slate-900/40 p-6 shadow-lg backdrop-blur-xl"
          >
            <h2 className="border-b border-cyan-400/30 pb-2 text-lg font-semibold text-slate-100">Updated Data</h2>
            <p className="mt-1 text-sm text-slate-400">
              This section shows only new uploads and what got added to exported JSON.
            </p>
            <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-400">New Files Added</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-300">
              {updatedDatasets.map((dataset, index) => (
                <li key={`${dataset.file_name}-${index}`} className="rounded-lg border border-cyan-400/20 bg-slate-900/50 px-3 py-2 shadow-lg">
                  <strong>{dataset.file_name}</strong> - {dataset.rows.length} rows, {dataset.columns.length} columns
                </li>
              ))}
            </ul>
            <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-400">What Was Added Into JSON</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-300">
              {updatedChanges.map((change, index) => (
                <li key={`${change.file_name}-${index}`} className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-cyan-100">
                  {change.summary} (type: {change.dataset_type})
                  {change.dataset_type === 'real_estate' && (
                    <button
                      type="button"
                      onClick={() => {
                        window.history.pushState({}, '', '/real-estate');
                        window.dispatchEvent(new PopStateEvent('popstate'));
                      }}
                      className="ml-2 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Realstate
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200">{error}</p>}

        {analysis && analysis.projects.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.28 }}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="border-b border-cyan-400/30 pb-2 text-lg font-semibold text-slate-100">AI Generated Projects</h2>
              <span className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200" aria-live="polite">
                ✔ Complete
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {analysis.projects.map((project) => (
                <ProjectCard
                  key={project.project_name}
                  project={project}
                  onView={(nextProject) => {
                    setSelectedProjectName(nextProject.project_name);
                    setIsProjectDialogOpen(true);
                  }}
                  onGenerate={handleGenerateCode}
                  isSelected={isProjectDialogOpen && selectedProjectName === project.project_name}
                />
              ))}
            </div>
          </motion.section>
        )}

        {isProjectDialogOpen && selectedProject && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-10 backdrop-blur-sm sm:p-6 sm:pt-14">
            <div
              className="absolute inset-0"
              onClick={() => setIsProjectDialogOpen(false)}
              aria-hidden="true"
            />
            <section className="relative z-10 max-h-[88vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 shadow-2xl sm:p-6">
              <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-6 flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-950/95 px-5 py-4 backdrop-blur-xl sm:-mx-6 sm:-mt-6 sm:px-6">
                <div>
                  <h2 className="text-xl font-semibold text-slate-100">{selectedProject.project_name}</h2>
                  <p className="mt-1 text-sm text-slate-400">{selectedProject.summary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsProjectDialogOpen(false)}
                  className="rounded-xl border border-cyan-400/30 bg-slate-900/50 px-3 py-1.5 text-sm font-semibold text-cyan-100 transition hover:shadow-[0_0_15px_rgba(0,255,255,0.6)]"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  whileHover={{ scale: 1.02 }}
                  className="rounded-2xl border border-cyan-400/20 bg-slate-900/40 p-6 shadow-lg backdrop-blur-xl"
                >
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-300">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 border-b border-cyan-400/30 pb-2 font-semibold text-slate-100">Requirements</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
                    {selectedProject.requirements.map((requirement, index) => (
                      <li key={`requirement-${index}`}>{requirement}</li>
                    ))}
                  </ul>
                </motion.section>

                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 }}
                  whileHover={{ scale: 1.02 }}
                  className="rounded-2xl border border-cyan-400/20 bg-slate-900/40 p-6 shadow-lg backdrop-blur-xl"
                >
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-300">
                    <FileText className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 border-b border-cyan-400/30 pb-2 font-semibold text-slate-100">Specification</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
                    {selectedProject.specification.map((item, index) => (
                      <li key={`specification-${index}`}>{item}</li>
                    ))}
                  </ul>
                </motion.section>

                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  className="rounded-2xl border border-cyan-400/20 bg-slate-900/40 p-6 shadow-lg backdrop-blur-xl"
                >
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-300">
                    <Wrench className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 border-b border-cyan-400/30 pb-2 font-semibold text-slate-100">Tools Required</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
                    {selectedProject.tools_required.map((tool, index) => (
                      <li key={`tool-${index}`}>{tool}</li>
                    ))}
                  </ul>
                </motion.section>
              </div>

              <section className="mt-6">
                <h3 className="mb-3 border-b border-cyan-400/30 pb-2 text-lg font-semibold text-slate-100">Team Assignment Cards</h3>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {selectedProject.tasks.map((task, index) => (
                    <motion.article
                      key={`task-row-${index}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.4) }}
                      className="rounded-xl border border-cyan-400/20 bg-slate-900/50 p-5 shadow-lg transition-all hover:scale-[1.01] hover:border-cyan-400/60 hover:shadow-cyan-400/20"
                    >
                      <div className="flex items-start gap-3">
                        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/10 text-cyan-200">
                          <UserCircle2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-100">{task.task_name}</p>
                          <p className="mt-1 text-sm text-slate-300">
                            {task.assigned_employee.employee_name}
                            {task.assigned_employee.employee_id ? ` (${task.assigned_employee.employee_id})` : ''}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2 py-1 text-xs font-semibold text-indigo-200">
                              <Briefcase className="h-3.5 w-3.5" />
                              {task.assigned_employee.role || 'N/A'}
                            </span>
                            <span className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-xs font-semibold text-cyan-200">
                              {task.assigned_employee.experience_years !== null && task.assigned_employee.experience_years !== undefined
                                ? `${task.assigned_employee.experience_years} years`
                                : 'Experience N/A'}
                            </span>
                          </div>
                          <p className="mt-3 text-xs text-slate-400">{task.assigned_employee.reason}</p>
                        </div>
                      </div>
                    </motion.article>
                  ))}
                </div>
              </section>

              <section className="mt-6">
                <h3 className="mb-3 border-b border-cyan-400/30 pb-2 text-lg font-semibold text-slate-100">Weekly Roadmap Timeline</h3>
                <div className="space-y-4">
                  {selectedProject.roadmap.map((milestone, milestoneIndex) => {
                    const completedCount = milestone.tasks.filter((task, taskIndex) => {
                      const key = completionKey(
                        selectedProject.project_name,
                        milestone.week,
                        milestoneIndex,
                        taskIndex,
                      );
                      return completionState[key] ?? task.completed;
                    }).length;

                    const progress =
                      milestone.tasks.length > 0 ? Math.round((completedCount / milestone.tasks.length) * 100) : 0;

                    return (
                      <motion.article
                        key={`roadmap-${milestoneIndex}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: Math.min(milestoneIndex * 0.06, 0.4) }}
                        className="relative rounded-xl border border-cyan-400/20 bg-slate-900/50 p-5 shadow-lg"
                      >
                        <div className="absolute left-6 top-0 h-full w-px bg-slate-700" aria-hidden="true" />
                        <div className="relative z-10">
                          <div className="flex items-start gap-3">
                            <div className="mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-cyan-400/60 bg-cyan-500/30" />
                            <div className="w-full">
                              <h4 className="font-semibold text-slate-100">
                                Week {milestone.week} - {milestone.milestone}
                              </h4>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                                <motion.div
                                  initial={{ width: '0%' }}
                                  animate={{ width: `${progress}%` }}
                                  transition={{ duration: 0.5 }}
                                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
                                />
                              </div>
                              <p className="mt-1 text-xs font-semibold text-cyan-200">{progress}% complete</p>
                              <ul className="mt-3 space-y-2">
                                {milestone.tasks.map((task, taskIndex) => {
                                  const key = completionKey(
                                    selectedProject.project_name,
                                    milestone.week,
                                    milestoneIndex,
                                    taskIndex,
                                  );
                                  const completed = completionState[key] ?? task.completed;

                                  return (
                                    <motion.li
                                      key={`roadmap-task-${milestoneIndex}-${taskIndex}`}
                                      initial={{ opacity: 0, y: 6 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ duration: 0.2, delay: Math.min(taskIndex * 0.03, 0.2) }}
                                    >
                                      <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                                        <input
                                          type="checkbox"
                                          checked={completed}
                                          onChange={(event) =>
                                            handleToggleRoadmapTask(
                                              selectedProject.project_name,
                                              milestone.week,
                                              milestoneIndex,
                                              taskIndex,
                                              event.target.checked,
                                            )
                                          }
                                          className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                                        />
                                        <CheckSquare className="h-3.5 w-3.5 text-cyan-300" />
                                        <span className={completed ? 'text-slate-500 line-through' : ''}>
                                          {task.task_name || 'Untitled task'}
                                        </span>
                                      </label>
                                    </motion.li>
                                  );
                                })}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </motion.article>
                    );
                  })}
                </div>
              </section>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
