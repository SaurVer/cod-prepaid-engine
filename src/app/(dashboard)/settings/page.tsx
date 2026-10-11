import { IntegrationToggle, ProfileForm, SettingsForm } from '@/components/settings-forms';
import { Badge, PageHeader } from '@/components/ui';
import { dateTimeIST } from '@/lib/format';
import { getDb } from '@/lib/server/db.ts';
import { getMerchant, getMerchantSettings } from '@/lib/server/settings.ts';

export const dynamic = 'force-dynamic';

const ACTION_TEXT: Record<string, string> = {
  authorise_run: 'Started a campaign',
  approve_and_send: 'Approved and sent a campaign',
  request_approval: 'Requested approval',
  edit_message: 'Edited a message',
  settings_change: 'Changed settings',
  retrain_started: 'Started model training',
  promote_model: 'Promoted a model',
  integration_connect: 'Connected an integration',
  integration_disconnect: 'Disconnected an integration',
  auto_pause: 'Auto-paused a campaign',
};

export default async function SettingsPage() {
  const db = getDb();
  const merchant = (await getMerchant(db))!;
  const s = await getMerchantSettings(db);
  const integrations = await db.query(`select * from integrations order by id`);
  const log = await db.query(`select * from audit_log order by id desc limit 40`);
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" sub="Brand, data connections, the money behind each decision, and a log of every change." />
      <div className="grid grid-cols-2 gap-4">
        <ProfileForm name={merchant.name} tone={merchant.tone_guide} />
        <div className="card px-5 py-4">
          <h2>Data connections</h2>
          <p className="mt-1 text-[12px] text-ink-faint">Simulated in this prototype. Delivery status is required, because returns can&apos;t be measured without it.</p>
          <ul className="mt-3 divide-y divide-line">
            {integrations.map((i) => (
              <li key={i.key} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-[11.5px] text-ink-faint">
                    {(i.scopes ?? []).join(' · ')} · last sync {dateTimeIST(i.last_sync_at)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={i.connected ? 'green' : 'gray'}>{i.connected ? 'Connected' : 'Off'}</Badge>
                  <IntegrationToggle k={i.key} on={Boolean(i.consent)} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <SettingsForm
          title="Economics"
          values={s as any}
          fields={[
            { key: 'margin', label: 'Margin on a delivered order', hint: 'What you keep when an order is delivered', prefix: '₹' },
            { key: 'cod_fee', label: 'Cash-handling fee', hint: 'Extra cost of collecting cash', prefix: '₹' },
            { key: 'rto_cost', label: 'Cost of one return (RTO)', hint: 'Shipping both ways plus handling', prefix: '₹' },
            { key: 'discount_amount', label: 'Offer amount', hint: 'Discount in the pay-online offer', prefix: '₹' },
            { key: 'max_discount', label: 'Max discount per order', hint: 'Offers above this are never sent', prefix: '₹' },
            { key: 'msg_cost_whatsapp', label: 'WhatsApp message cost', hint: 'Per message', prefix: '₹' },
            { key: 'msg_cost_inbox', label: 'Mobile inbox message cost', hint: 'Per message', prefix: '₹' },
          ]}
        />
        <SettingsForm
          title="Experiment"
          values={s as any}
          fields={[
            { key: 'holdout_pct', label: 'Control group size', hint: 'Share of orders kept as a no-message control', suffix: '%', scale: 100 },
            { key: 'max_sends', label: 'Max messages per order', hint: 'Including resends' },
            { key: 'min_gap_hours', label: 'Minimum gap between messages', hint: 'Before a resend is allowed', suffix: 'hours' },
          ]}
        />
      </div>
      <div className="card overflow-auto">
        <div className="border-b border-line px-4 py-3">
          <h2>Audit log</h2>
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {log.map((l) => (
              <tr key={l.id}>
                <td>{dateTimeIST(l.at)}</td>
                <td className="capitalize">{l.role}</td>
                <td>{ACTION_TEXT[l.action] ?? l.action.replace(/_/g, ' ')}</td>
                <td className="text-ink-soft">{l.target}</td>
              </tr>
            ))}
            {log.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-ink-faint">
                  Nothing yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
