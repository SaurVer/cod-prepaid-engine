import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Economics, type Probs, decide, evaluateAction } from '../src/lib/core/decide.ts';

// Section 11 worked example.
const econ: Economics = { margin: 350, codFee: 20, rtoCost: 400, discountAmount: 50, maxDiscount: 50, messageCost: 1 };
const probs: Probs = {
  none: { p: 0.08, k: 0.02, rc: 0.1, rp: 0.03 },
  nudge: { p: 0.45, k: 0.025, rc: 0.09, rp: 0.03 },
  discount: { p: 0.52, k: 0.025, rc: 0.09, rp: 0.04 },
};
const modelDraws = { uGroup: 0.99, uExplore: 0 };

test('worked example: EVs match section 11 (±₹0.01) and the nudge is chosen', () => {
  const out = decide({ probs, econ, holdoutPct: 0.1, explorationPct: 0.1, draws: modelDraws });
  assert.ok(Math.abs(out.ev.none - 257.5) <= 0.01, `EV(none) ${out.ev.none}`);
  assert.ok(Math.abs(out.ev.nudge - 285.14) <= 0.01, `EV(nudge) ${out.ev.nudge}`);
  assert.ok(Math.abs(out.ev.discount - 260.7) <= 0.01, `EV(discount) ${out.ev.discount}`);
  assert.equal(out.group, 'model');
  assert.equal(out.chosen, 'nudge');
  assert.equal(out.reason, 'best_gain');
  assert.equal(out.discountApplied, 0);
  assert.ok(Math.abs(out.gain.nudge - (out.ev.nudge - out.ev.none)) < 1e-9);
});

test('five outcome probabilities sum to 1 and payoffs follow section 5', () => {
  const b = evaluateAction('discount', probs.discount, econ);
  assert.ok(Math.abs(b.pi.reduce((s, x) => s + x, 0) - 1) < 1e-9);
  assert.deepEqual(b.payoff, [300, -400, 0, 330, -400]);
  assert.equal(b.messageCost, 1);
  const n = evaluateAction('none', probs.none, econ);
  assert.equal(n.messageCost, 0);
  assert.equal(n.discount, 0);
});

test('holdout is assigned first and always does nothing', () => {
  const out = decide({ probs, econ, holdoutPct: 0.1, explorationPct: 0.1, draws: { uGroup: 0.05, uExplore: 0.9 } });
  assert.equal(out.group, 'holdout');
  assert.equal(out.chosen, 'none');
  assert.equal(out.reason, 'holdout');
});

test('exploration picks nudge or discount at random, never nothing', () => {
  const a = decide({ probs, econ, holdoutPct: 0.1, explorationPct: 0.1, draws: { uGroup: 0.15, uExplore: 0.2 } });
  const b = decide({ probs, econ, holdoutPct: 0.1, explorationPct: 0.1, draws: { uGroup: 0.15, uExplore: 0.8 } });
  assert.equal(a.group, 'explore');
  assert.equal(a.chosen, 'nudge');
  assert.equal(b.chosen, 'discount');
  assert.equal(b.discountApplied, 50);
  assert.equal(b.reason, 'explore');
});

test('no positive gain means do nothing', () => {
  const flat: Probs = {
    none: { p: 0.05, k: 0.02, rc: 0.1, rp: 0.03 },
    nudge: { p: 0.05, k: 0.025, rc: 0.1, rp: 0.03 },
    discount: { p: 0.05, k: 0.025, rc: 0.1, rp: 0.04 },
  };
  const out = decide({ probs: flat, econ, holdoutPct: 0, explorationPct: 0, draws: modelDraws });
  assert.equal(out.chosen, 'none');
  assert.equal(out.reason, 'no_positive_gain');
});

test('discount is chosen when it has the highest gain', () => {
  const price: Probs = {
    none: { p: 0.03, k: 0.02, rc: 0.12, rp: 0.03 },
    nudge: { p: 0.08, k: 0.025, rc: 0.12, rp: 0.03 },
    discount: { p: 0.45, k: 0.025, rc: 0.12, rp: 0.04 },
  };
  const out = decide({ probs: price, econ, holdoutPct: 0, explorationPct: 0, draws: modelDraws });
  assert.equal(out.chosen, 'discount');
  assert.equal(out.discountApplied, 50);
});

test('cap removes the discount option and is recorded as cap applied', () => {
  const price: Probs = {
    none: { p: 0.03, k: 0.02, rc: 0.12, rp: 0.03 },
    nudge: { p: 0.08, k: 0.025, rc: 0.12, rp: 0.03 },
    discount: { p: 0.45, k: 0.025, rc: 0.12, rp: 0.04 },
  };
  const capped = { ...econ, discountAmount: 60, maxDiscount: 50 };
  const out = decide({ probs: price, econ: capped, holdoutPct: 0, explorationPct: 0, draws: modelDraws });
  assert.notEqual(out.chosen, 'discount');
  assert.equal(out.reason, 'cap_applied');
  assert.equal(out.discountAvailable, false);
  // exploration never sends a discount above the cap either
  const ex = decide({ probs: price, econ: capped, holdoutPct: 0, explorationPct: 1, draws: { uGroup: 0.5, uExplore: 0.9 } });
  assert.equal(ex.chosen, 'nudge');
});
