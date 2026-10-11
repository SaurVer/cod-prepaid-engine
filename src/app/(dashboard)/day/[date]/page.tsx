import { redirect } from 'next/navigation';

// Days live on the Overview now; old links open that day there.
export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  redirect(`/?date=${encodeURIComponent(date)}`);
}
