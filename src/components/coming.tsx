import { PageHeader } from './cards';

export function NextPhase({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="max-w-3xl">
      <PageHeader title={title} />
      <div className="card card-pad text-sm text-ink-soft">
        <div className="font-medium text-ink">Arrives in the next build step (P1).</div>
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
