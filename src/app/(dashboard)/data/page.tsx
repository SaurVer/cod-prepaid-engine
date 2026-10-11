import { NextPhase } from '@/components/coming';
export default function Page() {
  return <NextPhase title="Data" items={['By batch: one row per sim date', 'By order: lifecycle, runs, group, sends, outcome, training flag', 'Filters and Inspector links']} />;
}
