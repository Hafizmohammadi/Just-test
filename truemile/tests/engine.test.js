// Run with: node --test truemile/tests
const test = require('node:test');
const assert = require('node:assert');
const TM = require('./load.js');

// The default example is deliberately underfunded; tests that need time to pass add capital.
function funded() { const s = TM.defaultSettings(); s.partners.forEach(p => { p.capital = 30000; }); return s; }

function play(settings, days, pick) {
  const st = TM.newGame(settings);
  TM.openCredit(st);
  for (let d = 0; d < days && !st.gameOver; d++) {
    st.trucks.forEach(t => {
      if (t.status !== 'idle' || !t.driverId) return;
      const b = TM.boardFor(st, t);
      if (b.length) TM.dispatch(st, t.id, (pick || (x => x[0]))(b).id);
    });
    TM.advanceDay(st);
    while (st.pending.length) TM.resolveDecision(st, st.pending[0].id, st.pending[0].options[0].id);
    assert.ok(Math.abs(TM.balanceCheck(st)) < 0.01, 'balance sheet must balance on day ' + st.day);
  }
  return st;
}

test('default formation & startup items total the $3,500 example', () => {
  const st = TM.newGame(TM.defaultSettings());
  const sum = st.ledger.filter(e => e.day === 0 && TM.exp(st, e.id) && TM.exp(st, e.id).cat === 'A' && e.pnl).reduce((a, e) => a - e.pnl, 0);
  assert.strictEqual(Math.round(sum), 3500);
});

test('loan amortization: payment formula, schedule pays off, interest only is expensed', () => {
  const pmt = TM.loanPayment(17500, 12, 48, 0);
  assert.ok(Math.abs(pmt - 460.84) < 0.01);
  const rows = TM.amortize(17500, 12, 48, 0);
  assert.ok(rows[47].balance < 0.01);
  const balloon = TM.amortize(17500, 12, 48, 5000);
  assert.ok(Math.abs(balloon[47].principal - (balloon[46].balance)) < 0.01);
  const st = TM.newGame(funded());
  for (let i = 0; i < 31; i++) TM.advanceDay(st);
  const principal = st.ledger.filter(e => e.id === 'loan_principal');
  const interest = st.ledger.filter(e => e.id === 'loan_interest');
  assert.strictEqual(principal.length, 1);
  assert.ok(!principal[0].pnl, 'principal is not an expense');
  assert.ok(Math.abs(interest[0].pnl + 175) < 0.01, 'first month interest = 17,500 × 1%');
});

test('ledger balances for a full year in every business model', () => {
  Object.keys(TM.BUSINESS_MODELS).forEach(id => {
    const s = TM.defaultSettings();
    TM.applyModel(s, id);
    s.partners.forEach(p => { p.capital = 40000; });
    const st = play(s, 365);
    assert.ok(st.stats.loads > 10, id + ' should deliver loads');
  });
});

test('no double counting under a carrier lease', () => {
  const s = TM.defaultSettings();
  TM.applyModel(s, 'company_leased_on');
  const st = TM.newGame(s);
  const ctx = TM.context(st);
  ['ins_liability', 'ins_cargo', 'mc_authority', 'boc3', 'ucr', 'irp', 'ifta_recon', 'loadboard'].forEach(id => {
    assert.ok(!TM.applies(TM.exp(st, id), ctx), id + ' must not apply under carrier authority');
  });
  assert.ok(TM.applies(TM.exp(st, 'ins_bobtail'), ctx));
  st.settings.carrier.insChargeback = true;
  const ctx2 = TM.context(st);
  assert.ok(!TM.applies(TM.exp(st, 'ins_physdmg'), ctx2), 'own physical damage off when carrier charges it back');
  assert.ok(TM.applies(TM.exp(st, 'carrier_ins_chargeback'), ctx2));
});

test('full-service lease suppresses routine maintenance; trailer items follow trailer type', () => {
  const s = TM.defaultSettings();
  TM.applyModel(s, 'oo_lease');
  s.truck.leaseIncludesMaint = true;
  s.trailer.type = 'reefer';
  const st = TM.newGame(s);
  const t = st.trucks[0], ctx = TM.context(st);
  assert.ok(!TM.applies(TM.exp(st, 'pm_service'), ctx, t));
  assert.ok(!TM.applies(TM.exp(st, 'repairs_general'), ctx, t));
  assert.ok(TM.applies(TM.exp(st, 'reefer_maint'), ctx, t));
  assert.ok(!TM.applies(TM.exp(st, 'tarp_wear'), ctx, t));
  assert.strictEqual(st.bal.fixed, 0, 'leased truck is not an asset');
});

test('refundable deposits are assets, not expenses', () => {
  const st = TM.newGame(TM.defaultSettings());
  const dep = st.ledger.filter(e => e.id === 'trailer_deposit');
  assert.strictEqual(dep.length, 1);
  assert.ok(!dep[0].pnl);
  assert.strictEqual(st.bal.dep, 1000);
});

test('revenue is recognized at delivery, cash arrives at collection', () => {
  const s = TM.defaultSettings();
  s.partners.forEach(p => { p.capital = 30000; });
  const st = play(s, 60);
  const firstRev = st.ledger.find(e => e.id === 'rev_linehaul');
  assert.ok(firstRev && !firstRev.cash && firstRev.ar > 0);
  assert.ok(st.ledger.some(e => e.id === 'ar_collect' && e.cash > 0 && !e.pnl));
});

test('depreciation is a non-cash expense', () => {
  const st = TM.newGame(funded());
  for (let i = 0; i < 30; i++) TM.advanceDay(st);
  const dep = st.ledger.filter(e => e.id === 'depreciation');
  assert.ok(dep.length >= 1);
  dep.forEach(e => { assert.ok(!e.cash); assert.ok(e.pnl < 0); });
});

test('projection and comparisons run for every model', () => {
  const rows = TM.compareModels(TM.defaultSettings(), null);
  assert.strictEqual(rows.length, 6);
  rows.forEach(r => assert.ok(isFinite(r.proj.net) && r.proj.revenue > 0));
  const p = TM.project(TM.newGame(TM.defaultSettings()));
  assert.ok(p.breakevenRpm > 1 && p.breakevenRpm < 4);
});

test('running out of cash ends the game', () => {
  const s = TM.defaultSettings();
  s.partners.forEach(p => { p.capital = 1000; });
  const st = TM.newGame(s);
  for (let i = 0; i < 40 && !st.gameOver; i++) TM.advanceDay(st);
  assert.ok(st.gameOver);
});
