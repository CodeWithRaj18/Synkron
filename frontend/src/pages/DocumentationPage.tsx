import { DragEvent, KeyboardEvent, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

import { AIPipelineFlow } from '../components/ai/AIPipelineFlow';
import { saveGeneratedDocumentation, streamGenerateDocumentation } from '../services/api';
import { DocumentationStreamEvent } from '../types/types';

const DOCUMENT_DRAFT_STORAGE_KEY = 'documentation_engine_draft';

function loadDraft(): { title: string; prompt: string; content: string } {
  try {
    const raw = localStorage.getItem(DOCUMENT_DRAFT_STORAGE_KEY);
    if (!raw) {
      return { title: 'project-documentation', prompt: '', content: '' };
    }

    const parsed = JSON.parse(raw) as Partial<{ title: string; prompt: string; content: string }>;
    return {
      title: parsed.title ?? 'project-documentation',
      prompt: parsed.prompt ?? '',
      content: parsed.content ?? '',
    };
  } catch {
    return { title: 'project-documentation', prompt: '', content: '' };
  }
}

export function DocumentationPage() {
  const initial = useMemo(() => loadDraft(), []);

  const [title, setTitle] = useState(initial.title);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [content, setContent] = useState(initial.content);
  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedPath, setSavedPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const persistDraft = (next: { title?: string; prompt?: string; content?: string }) => {
    const nextValue = {
      title: next.title ?? title,
      prompt: next.prompt ?? prompt,
      content: next.content ?? content,
    };
    localStorage.setItem(DOCUMENT_DRAFT_STORAGE_KEY, JSON.stringify(nextValue));
  };

  const appendStatus = (message: string) => {
    setStatusMessages((previous) => [...previous, message].slice(-80));
  };

  const onStartGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please provide a prompt for document generation.');
      return;
    }

    setError(null);
    setSavedPath('');
    setIsGenerating(true);
    setContent('');
    setStatusMessages(['Starting documentation engine...']);
    let doneReceived = false;

    try {
      await streamGenerateDocumentation(
        {
          prompt,
          files: selectedFiles,
        },
        (event: DocumentationStreamEvent) => {
          if (event.type === 'status') {
            appendStatus(event.message);
            return;
          }

          if (event.type === 'token') {
            setContent((previous) => {
              const next = previous + event.chunk;
              persistDraft({ content: next });
              return next;
            });
            return;
          }

          if (event.type === 'done') {
            doneReceived = true;
            appendStatus('Documentation generation completed. You can edit and save now.');
            setIsGenerating(false);
          }
        },
      );
    } catch (streamError) {
      setError(streamError instanceof Error ? streamError.message : 'Documentation generation failed');
    } finally {
      if (!doneReceived) {
        appendStatus('Stream closed. Finalizing document view.');
      }
      setIsGenerating(false);
    }
  };

  const onSave = async () => {
    if (!content.trim()) {
      setError('Generated document is empty.');
      return;
    }

    setError(null);
    setIsSaving(true);
    setSavedPath('');

    try {
      const response = await saveGeneratedDocumentation({ title, content });
      if (response.saved) {
        setSavedPath(response.path);
        appendStatus(`Saved ${response.bytes_written} bytes to ${response.path}`);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save generated document');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const files = event.dataTransfer.files;
    setSelectedFiles(files ? Array.from(files) : []);
  };

  const handleDropZoneKeyDown = (event: KeyboardEvent<HTMLLabelElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">DOCUMENTATION STUDIO</p>
            <h1 className="text-2xl font-semibold text-slate-100">Documentation Engine</h1>
            <p className="mt-1 text-sm text-slate-400">
              Model: <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 font-semibold text-cyan-200">llama3</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.history.back()}
            aria-label="Go back to previous page"
            className="rounded-lg border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-200 transition duration-200 ease-in-out hover:bg-slate-700"
          >
            Back
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-8 px-6 py-8">
        <motion.section
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          whileHover={{ scale: 1.02 }}
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-cyan-400/30 hover:shadow-cyan-500/10"
        >
          <AIPipelineFlow pipelineType="documentation" />
        </motion.section>

        {error && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200">{error}</p>
        )}

        <motion.section
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.04 }}
          whileHover={{ scale: 1.02 }}
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-cyan-400/30 hover:shadow-cyan-500/10"
        >
          <h2 className="text-lg font-semibold text-slate-100">Document Builder</h2>

          <label className="mt-4 block text-sm font-semibold text-slate-300">Document Title</label>
          <input
            value={title}
            onChange={(event) => {
              const next = event.target.value;
              setTitle(next);
              persistDraft({ title: next });
            }}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
            placeholder="project-documentation"
            aria-label="Document title"
          />

          <label className="mt-4 block text-sm font-semibold text-slate-300">Prompt</label>
          <textarea
            value={prompt}
            onChange={(event) => {
              const next = event.target.value;
              setPrompt(next);
              persistDraft({ prompt: next });
            }}
            rows={6}
            className="mt-1 min-h-[140px] w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
            placeholder="Describe the document you want. Example: Build a complete client-ready proposal based on uploaded decks."
            aria-label="Documentation generation prompt"
          />

          <h3 className="mt-5 text-sm font-semibold text-slate-200">File Upload</h3>
          <label
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onKeyDown={handleDropZoneKeyDown}
            role="button"
            tabIndex={0}
            aria-label="Upload documents for generation"
            className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center transition-all duration-200 ${
              isDragging
                ? 'border-cyan-400 bg-cyan-500/5'
                : 'border-slate-700 bg-slate-900/40 hover:border-cyan-400 hover:bg-slate-900/70'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
              className="hidden"
              accept=".ppt,.pptx,.pdf,.txt,.md,.csv,.json"
              aria-label="Choose documentation files"
            />
            <p className="text-base font-semibold text-slate-100">Drag and drop files here</p>
            <p className="mt-1 text-sm text-slate-400">or click to browse from your computer</p>
          </label>

          {selectedFiles.length > 0 && (
            <ul className="mt-3 space-y-2 rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">
              {selectedFiles.map((file) => (
                <li key={`${file.name}-${file.size}`} className="rounded-lg bg-slate-800/70 px-3 py-2">
                  {file.name}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onStartGenerate}
              disabled={isGenerating}
              aria-label="Generate documentation from prompt and uploaded files"
              className="inline-flex items-center rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition duration-200 ease-in-out hover:from-cyan-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:from-slate-500 disabled:to-slate-600"
            >
              {isGenerating ? 'Generating Documentation...' : 'Generate Documentation'}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || isGenerating}
              aria-label="Save generated document"
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-200 transition duration-200 ease-in-out hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Document'}
            </button>
            {savedPath && (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                ✔ Saved: {savedPath}
              </span>
            )}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="grid grid-cols-1 gap-8 lg:grid-cols-3"
        >
          <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-cyan-400/30 hover:shadow-cyan-500/10">
            <h3 className="mb-2 font-semibold text-slate-100">Generation Status</h3>
            {statusMessages.length === 0 && <p className="text-sm text-slate-400">No events yet.</p>}
            <ul className="space-y-2 text-sm text-slate-300" aria-live="polite" aria-label="Documentation generation events">
              {statusMessages.map((message, index) => (
                <li key={`${index}-${message}`} className="rounded-lg bg-slate-800/80 px-3 py-2">
                  {message}
                </li>
              ))}
            </ul>
          </aside>

          <section className="lg:col-span-2 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-cyan-400/30 hover:shadow-cyan-500/10">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-200">Generated Document (Editable)</h3>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-xs font-semibold text-cyan-200">Markdown</span>
            </div>
            <textarea
              value={content}
              onChange={(event) => {
                const next = event.target.value;
                setContent(next);
                persistDraft({ content: next });
              }}
              rows={28}
              className="min-h-[520px] w-full resize-y rounded-xl bg-black p-6 font-mono text-sm text-slate-100 focus:outline-none"
              placeholder="Generated document will stream here."
              aria-label="Generated document editor"
            />
          </section>
        </motion.section>
      </main>
    </div>
  );
}
