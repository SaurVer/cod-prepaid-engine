'use client';

/** A GET form that submits as soon as a field changes. */
export function AutoForm({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <form
      method="get"
      className={className}
      onChange={(e) => {
        const f = e.currentTarget;
        const page = f.querySelector<HTMLInputElement>('input[name=page]');
        if (page) page.value = '1';
        // A date range and a single day are alternatives: picking one clears the other.
        const t = e.target as unknown as HTMLInputElement;
        const clear = (sel: string) => f.querySelectorAll<HTMLInputElement>(sel).forEach((el) => (el.value = ''));
        if (t.name === 'from' || t.name === 'to') clear('[name=date]');
        if (t.name === 'date') clear('[name=from],[name=to]');
        f.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
