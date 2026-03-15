import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileCode2, FolderTree, Sparkles, TerminalSquare } from 'lucide-react';

import { ParallaxLayer } from '../components/motion/ParallaxLayer';
import { Reveal } from '../components/motion/Reveal';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { streamGenerateCode } from '../services/api';
import { AnalyzedProject, FilePlanItem, GenerateCodeEvent } from '../types/types';

const ANALYSIS_STORAGE_KEY = 'analysis_projects';
const GENERATION_PHASES = [
  {
    title: 'Generating architecture...',
    detail: 'Defining modules, responsibilities, and code boundaries for the project.',
  },
  {
    title: 'Planning files and folders...',
    detail: 'Creating a production-ready structure with components, services, and utilities.',
  },
  {
    title: 'Writing core business logic...',
    detail: 'Implementing domain functions, validation rules, and flow control.',
  },
  {
    title: 'Building UI and interaction layer...',
    detail: 'Generating pages, event handlers, and accessibility-safe interaction hooks.',
  },
  {
    title: 'Integrating API contracts...',
    detail: 'Connecting frontend calls with typed request/response structures.',
  },
  {
    title: 'Adding error handling and fallbacks...',
    detail: 'Covering failure states, retries, and resilient edge-case behavior.',
  },
  {
    title: 'Polishing output and consistency...',
    detail: 'Aligning naming, formatting, and import structure across generated files.',
  },
];

function toProjectId(projectName: string): string {
  return encodeURIComponent(projectName.trim().toLowerCase().replace(/\s+/g, '-'));
}

function parseProjectIdFromPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  return parts.length >= 2 ? parts[1] : '';
}

function loadProjectsFromStorage(): AnalyzedProject[] {
  try {
    const raw = localStorage.getItem(ANALYSIS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AnalyzedProject[]) : [];
  } catch {
    return [];
  }
}

type HighlightToken = {
  text: string;
  className?: string;
};

function getExtension(filePath: string): string {
  const parts = filePath.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

function getFileAccent(filePath: string): string {
  const extension = getExtension(filePath);
  if (['ts', 'tsx', 'js', 'jsx'].includes(extension)) {
    return '#519aba';
  }
  if (['json', 'yml', 'yaml'].includes(extension)) {
    return '#cbcb41';
  }
  if (['py'].includes(extension)) {
    return '#3572a5';
  }
  if (['css', 'scss'].includes(extension)) {
    return '#c586c0';
  }
  if (['md'].includes(extension)) {
    return '#9cdcfe';
  }
  return '#cccccc';
}

function getLanguage(filePath: string): 'script' | 'json' | 'python' | 'generic' {
  const extension = getExtension(filePath);
  if (['ts', 'tsx', 'js', 'jsx', 'css', 'scss', 'html'].includes(extension)) {
    return 'script';
  }
  if (['json', 'yml', 'yaml'].includes(extension)) {
    return 'json';
  }
  if (extension === 'py') {
    return 'python';
  }
  return 'generic';
}

function highlightLine(line: string, language: 'script' | 'json' | 'python' | 'generic'): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  const pattern = /(\/\/.*$|#.*$|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`|\b(?:import|from|export|return|const|let|var|function|class|if|else|for|while|await|async|try|catch|finally|new|type|interface|extends|implements|def|pass|raise|in|not|and|or)\b|\b(?:true|false|null|None)\b|\b\d+(?:\.\d+)?\b|\b[A-Z][A-Za-z0-9_]*\b|\b[a-zA-Z_][a-zA-Z0-9_]*(?=\())/g;

  let lastIndex = 0;
  for (const match of line.matchAll(pattern)) {
    const value = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, index) });
    }

    let className: string | undefined;
    if (value.startsWith('//') || (value.startsWith('#') && language !== 'json')) {
      className = 'token-comment';
    } else if (value.startsWith('"') || value.startsWith("'") || value.startsWith('`')) {
      className = 'token-string';
    } else if (/^(true|false|null|None)$/.test(value)) {
      className = 'token-boolean';
    } else if (/^\d/.test(value)) {
      className = 'token-number';
    } else if (/^[A-Z]/.test(value)) {
      className = 'token-type';
    } else if (/^(import|from|export|return|const|let|var|function|class|if|else|for|while|await|async|try|catch|finally|new|type|interface|extends|implements|def|pass|raise|in|not|and|or)$/.test(value)) {
      className = 'token-keyword';
    } else if (/^[a-zA-Z_][a-zA-Z0-9_]*(?=\()/.test(value)) {
      className = 'token-function';
    }

    tokens.push({ text: value, className });
    lastIndex = index + value.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ text: line || ' ' }];
}

export function GenerateCodePage() {
  const projectId = useMemo(() => parseProjectIdFromPath(window.location.pathname), []);
  const projects = useMemo(() => loadProjectsFromStorage(), []);

  const project = useMemo(() => {
    return projects.find((item) => toProjectId(item.project_name) === projectId) ?? null;
  }, [projectId, projects]);

  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const [filePlan, setFilePlan] = useState<FilePlanItem[]>([]);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationPhaseIndex, setGenerationPhaseIndex] = useState(0);

  useEffect(() => {
    if (!isGenerating) {
      setGenerationPhaseIndex(0);
      return;
    }

    setGenerationPhaseIndex(0);
    setStatusMessages((previous) => {
      const next = [...previous];
      const first = GENERATION_PHASES[0];
      next.push(first.title);
      next.push(`What is happening: ${first.detail}`);
      return next;
    });

    const phaseInterval = window.setInterval(() => {
      setGenerationPhaseIndex((previous) => {
        const nextIndex = Math.min(GENERATION_PHASES.length - 1, previous + 1);
        if (nextIndex !== previous) {
          const phase = GENERATION_PHASES[nextIndex];
          setStatusMessages((messages) => [...messages, phase.title, `What is happening: ${phase.detail}`]);
        }
        return nextIndex;
      });
    }, 5000);

    return () => window.clearInterval(phaseInterval);
  }, [isGenerating]);

  const progressValue = useMemo(() => {
    if (filePlan.length === 0) {
      return isGenerating ? 20 : 0;
    }

    const completedCount = filePlan.filter((item) => Boolean(fileContents[item.path]?.trim())).length;
    return Math.min(100, Math.round((completedCount / filePlan.length) * 100));
  }, [fileContents, filePlan, isGenerating]);

  const startGeneration = async () => {
    if (!project) {
      setError('Project analysis JSON not found. Open the dashboard and analyze project first.');
      return;
    }

    setError(null);
    setStatusMessages([]);
    setFilePlan([]);
    setFileContents({});
    setSelectedFile('');
    setIsGenerating(true);

    try {
      await streamGenerateCode(
        {
          project_id: projectId,
          project,
        },
        (event: GenerateCodeEvent) => {
          if (event.type === 'status') {
            setStatusMessages((previous) => [...previous, event.message]);
            return;
          }

          if (event.type === 'file_plan') {
            setFilePlan(event.files);
            if (event.files.length > 0) {
              setSelectedFile((current) => current || event.files[0].path);
            }
            return;
          }

          if (event.type === 'token') {
            setFileContents((previous) => ({
              ...previous,
              [event.file_path]: (previous[event.file_path] ?? '') + event.chunk,
            }));
            return;
          }

          if (event.type === 'file_complete') {
            setStatusMessages((previous) => [...previous, `Completed ${event.file_path}`]);
            return;
          }

          if (event.type === 'done') {
            setFileContents(event.files);
            setStatusMessages((previous) => [...previous, 'Code generation finished.']);
            setIsGenerating(false);
            return;
          }

          if (event.type === 'error') {
            setError(event.message);
            setIsGenerating(false);
          }
        },
      );
    } catch (streamError) {
      setError(streamError instanceof Error ? streamError.message : 'Failed to stream generated code');
      setIsGenerating(false);
    }
  };

  const displayedCode = selectedFile ? fileContents[selectedFile] ?? '' : '';
  const activeStatus = isGenerating ? 'Generating' : error ? 'Error' : progressValue === 100 && filePlan.length > 0 ? 'Complete' : 'Ready';
  const currentGenerationPhase = GENERATION_PHASES[Math.min(generationPhaseIndex, GENERATION_PHASES.length - 1)];
  const currentFileDescription = filePlan.find((item) => item.path === selectedFile)?.description ?? 'Select a file from the explorer.';
  const codeLines = useMemo(() => displayedCode.split('\n'), [displayedCode]);
  const currentLanguage = useMemo(() => getLanguage(selectedFile), [selectedFile]);

  return (
    <div className="vscode-shell relative min-h-screen overflow-hidden bg-[#1e1e1e] text-[#cccccc]">
      <ParallaxLayer speed={0.05} className="-z-10">
        <div className="absolute left-0 top-24 h-64 w-64 rounded-full bg-[#094771]/20 blur-3xl" />
        <div className="absolute right-0 top-40 h-64 w-64 rounded-full bg-[#0e639c]/10 blur-3xl" />
      </ParallaxLayer>
      <div className="ambient-grid -z-10" />

      <header className="vscode-titlebar sticky top-0 z-40 h-12">
        <div className="flex h-full items-center justify-between px-4">
          <div className="flex items-center gap-3 text-sm text-[#9da0a6]">
            <span className="text-xs uppercase tracking-[0.18em]">Explorer</span>
            <span className="text-[#6a6a6a]">|</span>
            <span>{project?.project_name ?? 'Unknown Project'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#9da0a6]">
            <span>{activeStatus}</span>
            <span className="rounded border border-[#3c3c3c] px-2 py-1 text-[#cccccc]">Synkron Code Workspace</span>
          </div>
        </div>
      </header>

      <main className="grid min-h-[calc(100vh-3rem)] grid-cols-[56px_300px_minmax(0,1fr)]">
        <aside className="vscode-activitybar flex flex-col items-center gap-3 py-3">
          <div className="rounded-md border border-[#3c3c3c] bg-[#252526] p-2 text-[#cccccc]">
            <FolderTree className="h-5 w-5" />
          </div>
          <div className="rounded-md border border-[#3c3c3c] p-2 text-[#858585]">
            <FileCode2 className="h-5 w-5" />
          </div>
          <div className="rounded-md border border-[#3c3c3c] p-2 text-[#858585]">
            <TerminalSquare className="h-5 w-5" />
          </div>
        </aside>

        <section className="vscode-sidebar flex min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-[#2a2d2e] px-4 py-3 text-xs uppercase tracking-[0.18em] text-[#9da0a6]">
            <span>Explorer</span>
            <Badge variant="secondary" className="border-[#3c3c3c] bg-[#2d2d30] text-[#cccccc]">{filePlan.length}</Badge>
          </div>

          <div className="border-b border-[#2a2d2e] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{project?.project_name ?? 'Unknown Project'}</p>
                <p className="mt-1 text-xs text-[#9da0a6]">AI generated workspace for code delivery.</p>
              </div>
              <Badge variant="secondary" className="border-[#3c3c3c] bg-[#094771] text-white">
                {activeStatus}
              </Badge>
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => window.history.back()}
                className="h-9 border-[#3c3c3c] bg-[#2d2d30] text-[#cccccc] hover:bg-[#37373d] hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                type="button"
                className="button-animated h-9 bg-[#0e639c] text-white hover:bg-[#1177bb]"
                disabled={!project || isGenerating}
                onClick={startGeneration}
              >
                <Sparkles className="h-4 w-4" />
                {isGenerating ? 'Generating...' : 'Generate'}
              </Button>
            </div>
          </div>

          <div className="border-b border-[#2a2d2e] px-4 py-4">
            <div className="mb-2 flex items-center justify-between text-xs text-[#9da0a6]">
              <span>Generation progress</span>
              <span className="text-white">{progressValue}%</span>
            </div>
            <div className="vscode-progress-grid h-2 overflow-hidden rounded-full bg-[#1b1b1c]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#007acc,#0e639c)] transition-[width] duration-300"
                style={{ width: `${progressValue}%` }}
              />
            </div>

            <div className="mt-3 rounded border border-[#3c3c3c] bg-[#1f1f22] p-3 text-xs text-[#d4d4d4]">
              <p className="font-semibold text-white">{currentGenerationPhase.title}</p>
              <p className="mt-1 text-[#9da0a6]">{currentGenerationPhase.detail}</p>
            </div>
          </div>

          <div className="vscode-scrollbar min-h-0 flex-1 overflow-auto px-2 py-2">
            {filePlan.length === 0 ? (
              <div className="space-y-2 px-2 py-2">
                <Skeleton className="h-9 w-full bg-[#333333]" />
                <Skeleton className="h-9 w-full bg-[#333333]" />
                <Skeleton className="h-9 w-full bg-[#333333]" />
              </div>
            ) : (
              <ul className="space-y-1">
                {filePlan.map((file) => (
                  <li key={file.path}>
                    <button
                      type="button"
                      className={`w-full rounded px-3 py-2 text-left text-sm transition ${
                        selectedFile === file.path
                          ? 'border-l-2 border-[#007acc] bg-[#37373d] text-white'
                          : 'text-[#cccccc] hover:bg-[#2a2d2e]'
                      }`}
                      onClick={() => setSelectedFile(file.path)}
                    >
                      <div className="flex items-start gap-2">
                        <FileCode2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: getFileAccent(file.path) }} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{file.path}</p>
                          <p className="mt-0.5 truncate text-xs text-[#9da0a6]">{file.description}</p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="vscode-editor-pane flex min-h-0 flex-col">
          <Reveal>
            <div className="border-b border-[#2a2d2e] bg-[#252526]">
              <div className="flex items-center gap-1 overflow-auto px-3 pt-2">
                <button
                  type="button"
                  className="vscode-tab-active rounded-t border border-b-0 border-[#3c3c3c] bg-[#1e1e1e] px-4 py-2 text-sm text-white"
                >
                  {selectedFile || 'welcome.md'}
                </button>
              </div>
              <div className="flex items-center justify-between border-t border-[#2a2d2e] px-4 py-2 text-xs text-[#9da0a6]">
                <span>{currentFileDescription}</span>
                <span>{selectedFile ? 'UTF-8' : 'Awaiting plan'}</span>
              </div>
            </div>
          </Reveal>

          {error ? (
            <div className="border-b border-[#5a1d1d] bg-[#2d1a1a] px-4 py-3 text-sm text-[#f48771]">{error}</div>
          ) : null}

          <Reveal delayMs={90}>
            <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_220px]">
              <div className="vscode-scrollbar min-h-0 overflow-auto bg-[#1e1e1e]">
                <div className="vscode-mono min-h-full px-4 py-5 text-sm leading-7 text-[#d4d4d4]">
                  {(displayedCode ? codeLines : ['// Waiting for generated code...']).map((line, index) => (
                    <div key={`${index}-${line}`} className="vscode-editor-line">
                      <span className="vscode-line-number">{index + 1}</span>
                      <span className="whitespace-pre-wrap break-words">
                        {highlightLine(line, currentLanguage).map((token, tokenIndex) => (
                          <Fragment key={`${index}-${tokenIndex}-${token.text}`}>
                            <span className={token.className}>{token.text}</span>
                          </Fragment>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="vscode-panel flex min-h-0 flex-col">
                <div className="flex items-center gap-4 border-b border-[#2a2d2e] px-4 py-2 text-xs uppercase tracking-[0.16em] text-[#9da0a6]">
                  <span className="text-white">Terminal</span>
                  <span>Problems</span>
                  <span>Output</span>
                </div>
                <div className="vscode-scrollbar min-h-0 flex-1 overflow-auto px-4 py-3">
                  <ul className="space-y-2">
                    {statusMessages.length === 0 ? (
                      <li className="vscode-mono text-sm text-[#9da0a6]">$ Waiting for status events...</li>
                    ) : (
                      statusMessages.map((message, index) => (
                        <li key={`${message}-${index}`} className="vscode-mono text-sm text-[#cccccc]">
                          <span className="mr-2 text-[#6a9955]">$</span>
                          {message}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="vscode-statusbar flex h-6 items-center justify-between px-3 text-xs">
        <div className="flex items-center gap-4">
          <span>main</span>
          <span>TypeScript React</span>
          <span>Spaces: 2</span>
        </div>
        <div className="flex items-center gap-4">
          <span>{activeStatus}</span>
          <span>{progressValue}%</span>
        </div>
      </footer>
    </div>
  );
}
