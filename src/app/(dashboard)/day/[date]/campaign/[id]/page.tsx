import { redirect } from 'next/navigation';

// Campaigns have their own section now.
export default async function OldCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/campaigns/${encodeURIComponent(id)}`);
}
