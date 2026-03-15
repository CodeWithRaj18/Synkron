const items = [
  'Dataset Ingestion',
  'AI Task Assignment',
  'Project Analysis',
  'Code Generation',
  'Documentation Engine',
  'Real Estate Insights',
  'Roadmap Automation',
];

export function TemplateMarquee() {
  const doubled = [...items, ...items];

  return (
    <div className="marquee-wrap">
      <div className="marquee-track">
        {doubled.map((item, index) => (
          <span key={`${item}-${index}`} className="marquee-item">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
