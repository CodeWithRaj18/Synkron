import { ChangeEvent, DragEvent, KeyboardEvent, useRef, useState } from 'react';

type UploadPanelProps = {
  selectedFiles: File[];
  onFilesChange: (files: File[]) => void;
  onUpload: () => Promise<void>;
  isUploading: boolean;
  onClear: () => void;
  variant?: 'light' | 'dark';
};

export function UploadPanel({
  selectedFiles,
  onFilesChange,
  onUpload,
  isUploading,
  onClear,
  variant = 'light',
}: UploadPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    onFilesChange(fileList ? Array.from(fileList) : []);
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
    onFilesChange(files ? Array.from(files) : []);
  };

  const handleDropZoneKeyDown = (event: KeyboardEvent<HTMLLabelElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const isDark = variant === 'dark';

  return (
    <section
      className={[
        'rounded-2xl p-6 transition-all duration-300',
        isDark
          ? 'border border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur-xl hover:border-cyan-400/30 hover:shadow-cyan-500/10'
          : 'border border-slate-200 bg-white shadow-sm hover:border-indigo-300 hover:shadow-lg',
      ].join(' ')}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className={isDark ? 'text-lg font-semibold text-slate-100' : 'text-lg font-semibold text-slate-900'}>
            Upload Company Dataset
          </h2>
          <p className={isDark ? 'text-sm text-slate-400' : 'text-sm text-slate-600'}>
            Excel, CSV, JSON, PDF, Word, and TXT supported. Drop multiple files at once.
          </p>
        </div>
        <span
          className={[
            'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
            isDark ? 'border border-cyan-400/30 bg-cyan-500/10 text-cyan-200' : 'bg-blue-50 text-blue-700',
          ].join(' ')}
        >
          {isUploading ? '⚠ Processing' : '✔ Active'}
        </span>
      </div>

      <label
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onKeyDown={handleDropZoneKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Upload company dataset files"
        className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-all duration-300 ${
          isDragging
            ? isDark
              ? 'border-cyan-400 bg-cyan-500/5'
              : 'border-indigo-500 bg-indigo-50'
            : isDark
              ? 'border-slate-700 bg-slate-900/40 hover:border-cyan-400 hover:bg-slate-900/70'
              : 'border-slate-300 bg-slate-50/70 hover:border-indigo-400 hover:bg-indigo-50/60'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv,.json,.pdf,.docx,.txt"
          onChange={handleFileInput}
          aria-label="Choose dataset files"
          className="hidden"
        />
        <p className={isDark ? 'text-base font-semibold text-slate-100' : 'text-base font-semibold text-slate-800'}>
          Drag and drop files here
        </p>
        <p className={isDark ? 'mt-1 text-sm text-slate-400' : 'mt-1 text-sm text-slate-500'}>
          or click to browse from your computer
        </p>
      </label>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onUpload}
          disabled={isUploading || selectedFiles.length === 0}
          aria-label="Upload selected dataset files"
          className="inline-flex items-center rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition duration-200 ease-in-out hover:from-cyan-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:from-slate-500 disabled:to-slate-600"
        >
          {isUploading ? 'Uploading...' : 'Upload Files'}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={selectedFiles.length === 0}
          aria-label="Clear selected dataset files"
          className={[
            'inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-semibold transition duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50',
            isDark
              ? 'border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
          ].join(' ')}
        >
          Clear All
        </button>
      </div>

      {isUploading && (
        <div className="mt-4 space-y-2" aria-live="polite">
          <div className={isDark ? 'h-2 w-full overflow-hidden rounded-full bg-slate-800' : 'h-2 w-full overflow-hidden rounded-full bg-slate-200'}>
            <div className={isDark ? 'h-full w-1/2 animate-pulse rounded-full bg-cyan-500' : 'h-full w-1/2 animate-pulse rounded-full bg-indigo-500'} />
          </div>
          <p className={isDark ? 'text-xs text-slate-400' : 'text-xs text-slate-500'}>Uploading and validating dataset files...</p>
        </div>
      )}

      {selectedFiles.length > 0 && (
        <ul
          className={[
            'mt-4 space-y-2 rounded-xl p-4',
            isDark ? 'border border-slate-700 bg-slate-900/70' : 'border border-slate-200 bg-slate-50',
          ].join(' ')}
        >
          {selectedFiles.map((file) => (
            <li
              key={file.name}
              className={[
                'flex items-center justify-between rounded-lg px-3 py-2 text-sm',
                isDark ? 'bg-slate-800/70' : 'bg-white',
              ].join(' ')}
            >
              <span className={isDark ? 'font-medium text-slate-100' : 'font-medium text-slate-800'}>{file.name}</span>
              <span className={isDark ? 'text-xs text-slate-400' : 'text-xs text-slate-500'}>{Math.max(1, Math.round(file.size / 1024))} KB</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
