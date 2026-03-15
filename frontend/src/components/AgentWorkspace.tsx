import { Building2, Code2, Landmark } from 'lucide-react';

import { agentProfiles } from '../data/agentProfiles';

const iconMap = {
  'venture-capital': Landmark,
  'coding-agent': Code2,
  'real-estate': Building2,
} as const;

function openBySlug(slug: string) {
  if (slug === 'real-estate') {
    window.history.pushState({}, '', '/real-estate');
    window.dispatchEvent(new PopStateEvent('popstate'));
    return;
  }

  if (slug === 'coding-agent') {
    window.history.pushState({}, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));
    return;
  }

  if (slug === 'venture-capital') {
    window.history.pushState({}, '', '/documentation');
    window.dispatchEvent(new PopStateEvent('popstate'));
    return;
  }
}

export function AgentWorkspace() {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Specialized Agent Modes</p>
          <h2 className="mt-2 font-['Manrope'] text-2xl font-semibold text-white">Choose your AI workflow specialist</h2>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {agentProfiles.map((profile) => {
          const Icon = iconMap[profile.slug as keyof typeof iconMap];
          return (
            <article key={profile.slug} className="motion-card rounded-xl border border-zinc-800 bg-black/30 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-200">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-zinc-400">
                  {profile.eyebrow}
                </span>
              </div>
              <h3 className="mt-4 font-['Manrope'] text-xl font-semibold text-white">{profile.name}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{profile.description}</p>
              <ul className="mt-4 space-y-2 text-sm text-zinc-300">
                {profile.features.slice(0, 3).map((feature) => (
                  <li key={feature}>- {feature}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => openBySlug(profile.slug)}
                className="button-animated mt-5 rounded-md border border-zinc-700 bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
              >
                Open {profile.name}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
