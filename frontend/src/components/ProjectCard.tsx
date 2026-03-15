import { AnalyzedProject } from '../types/types';

type ProjectCardProps = {
  project: AnalyzedProject;
  onView: (project: AnalyzedProject) => void;
  onGenerate: (project: AnalyzedProject) => void;
  isSelected: boolean;
};

export function ProjectCard({ project, onView, onGenerate, isSelected }: ProjectCardProps) {
  const priority = project.priority.toLowerCase();
  const priorityClass =
    priority === 'high'
      ? 'bg-red-100 text-red-700'
      : priority === 'medium'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-emerald-100 text-emerald-700';

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      role="button"
      tabIndex={0}
      aria-label={`Pipeline card for ${project.project_name}`}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onView(project);
        }
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">{project.project_name}</h3>
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${priorityClass}`}>
          ⚠ {project.priority} Priority
        </span>
      </div>

      <p className="mb-4 text-sm text-slate-600">{project.summary}</p>

      <div className="space-y-1 text-sm text-slate-600">
        <p>
          <span className="font-semibold text-slate-700">Deadline:</span> {project.deadline_weeks} week(s)
        </p>
        <p>
          <span className="font-semibold text-slate-700">Requirements:</span> {project.requirements.length}
        </p>
        <p>
          <span className="font-semibold text-slate-700">Tools:</span>{' '}
          {project.tools_required.join(', ') || 'Not specified'}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onView(project)}
          aria-label={`View project plan for ${project.project_name}`}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 ${
            isSelected
              ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          {isSelected ? 'Viewing Details' : 'View Project Plan'}
        </button>
        <button
          type="button"
          onClick={() => onGenerate(project)}
          aria-label={`Generate code for ${project.project_name}`}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-blue-700"
        >
          Generate Code
        </button>
      </div>
    </section>
  );
}
