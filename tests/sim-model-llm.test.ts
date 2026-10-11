import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fallbackText, parseBatchReply, validateDraft, type DraftOrder } from '../src/lib/core/llm.ts';
import { auc, predictAll, toVector, trainBundle } from '../src/lib/core/model.ts';
import { realisedValue } from '../src/lib/core/money.ts';
import { pilotOrder, snapshotFor, toTrainingRow } from '../src/lib/core/pilot.ts';
import { mulberry32 } from '../src/lib/core/rng.ts';
import {
  PILOT_TYPE_SHARES,
  codRtoRate,
  generateRepeatCustomer,
  orderValue,
  pickType,
  trueConversion,
} from '../src/lib/core/sim.ts';

test('order values centre near ₹1,074 within ₹300–₹3,500', () => {
  const rng = mulberry32(1);
  const v = Array.from({ length: 20000 }, () => orderValue(rng));
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  assert.ok(mean > 1000 && mean < 1150, `mean ${mean}`);
  assert.ok(Math.min(...v) >= 300 && Math.max(...v) <= 3500);
});

test('Appendix C conversion table and habitual nudge scaling', () => {
  assert.ok(Math.abs(trueConversion('price_sensitive', 'discount', 3, 0.5) - 0.45) < 1e-9);
  assert.ok(Math.abs(trueConversion('habitual', 'nudge', 5, 0.5) - 0.45 * 1.06) < 1e-9);
  assert.ok(Math.abs(trueConversion('delivery_worried', 'nudge', 3, 0.5, 2) - 0.3 * 0.6) < 1e-9);
  assert.equal(codRtoRate({ city_tier: 1, past_delivery_issue: false, delivered_orders: 30 }), 0.04);
});

test('model v1 trains on the pilot and ranks conversion better than chance', () => {
  const rng = mulberry32(7);
  const rows = [];
  for (let i = 0; i < 6000; i++) {
    const t = pickType(rng, PILOT_TYPE_SHARES);
    const c = generateRepeatCustomer(rng, t);
    const po = pilotOrder(rng, c, t);
    rows.push(toTrainingRow(i, i, po.features, po.action, po.outcome));
  }
  const { bundle, metrics } = trainBundle(rows, { iterations: 200 });
  assert.ok((metrics.auc.conv_nudge ?? 0) > 0.6, `nudge AUC ${metrics.auc.conv_nudge}`);
  const c = generateRepeatCustomer(rng, 'habitual');
  const pr = predictAll(bundle, toVector(snapshotFor(c, 1000)));
  for (const a of ['none', 'nudge', 'discount'] as const) {
    assert.ok(pr[a].p > 0 && pr[a].p < 1 && pr[a].p + pr[a].k <= 1);
  }
  assert.ok(pr.nudge.p > pr.none.p, 'a nudge should convert more than nothing');
});

test('AUC helper', () => {
  assert.equal(auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1]), 1);
  assert.equal(auc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1]), 0);
  assert.equal(auc([0.5, 0.5], [0, 1]), 0.5);
});

const order: DraftOrder = {
  order_id: 'VD-1',
  action: 'discount',
  discount: 50,
  hint: 'reminder',
  delivered_orders: 4,
  last_category: 'Green tea',
  channel: 'whatsapp',
};

test('LLM output validation enforces the Appendix E rules', () => {
  assert.deepEqual(validateDraft({ text: 'Get ₹50 off when you pay online {link}' }, order), {
    text: 'Get ₹50 off when you pay online {link}',
    variant: 'offer',
  });
  assert.equal(validateDraft({ text: 'Pay online now {link}' }, order), null, 'discount must state the amount');
  assert.equal(validateDraft({ text: 'Get ₹50 off {link} today' }, order), null, 'must end with {link}');
  assert.equal(validateDraft({ text: 'x'.repeat(295) + '{link}' }, order), null, 'max 300 chars');
  const nudge: DraftOrder = { ...order, action: 'nudge', discount: 0, hint: 'reassurance' };
  assert.equal(validateDraft({ text: 'Save ₹50 if you pay online {link}' }, nudge), null, 'nudge has no discount');
  assert.equal(validateDraft({ text: 'Pay online, tracked to your door {link}' }, nudge)?.variant, 'reassurance');
  assert.equal(parseBatchReply('```json\n[{"order_id":"VD-1","text":"a"}]\n```')?.length, 1);
  assert.equal(parseBatchReply('not json'), null);
  assert.ok(fallbackText('offer', 'Verdant Daily', 50).includes('₹50 off'));
});

test('realised value uses the EV payoffs', () => {
  const s = { margin: 350, codFee: 20, rtoCost: 400 };
  assert.equal(realisedValue({ converted: true, discountPaid: 50, final: 'delivered', messageCost: 1 }, s), 299);
  assert.equal(realisedValue({ converted: false, discountPaid: 0, final: 'delivered', messageCost: 0 }, s), 330);
  assert.equal(realisedValue({ converted: false, discountPaid: 0, final: 'rto', messageCost: 1 }, s), -401);
  assert.equal(realisedValue({ converted: false, discountPaid: 0, final: 'cancelled', messageCost: 0 }, s), 0);
});
