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
        f.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
