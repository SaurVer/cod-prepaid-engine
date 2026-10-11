import { PageHeader } from '@/components/cards';
import { CreateRun } from '@/components/create-run';

export const dynamic = 'force-dynamic';

export default function NewRunPage() {
  return (
    <div className="max-w-5xl">
      <PageHeader title="Create run" sub="Runs score, decide and draft in the background. You can move to any page while the model runs." />
      <CreateRun />
    </div>
  );
}
