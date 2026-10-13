/* TrueMile — engine core: RNG, dates, settings, expense applicability and the double-entry ledger. */
(function (TM) {
  'use strict';

  /* ---------- utilities ---------- */
  TM.round2 = function (x) { return Math.round(x * 100) / 100; };
  TM.clamp = function (x, lo, hi) { return Math.max(lo, Math.min(hi, x)); };
  TM.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  TM.money = function (x, dp) {
    if (x === null || x === undefined || isNaN(x)) return '—';
    var d = dp === undefined ? 0 : dp;
    var s = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    return (x < -0.004 ? '−$' : '$') + s;
  };
  TM.pct = function (x, dp) { return (x * 100).toFixed(dp === undefined ? 1 : dp) + '%'; };

  // Seeded RNG (mulberry32) — state.rng holds the seed so games are reproducible.
  TM.rand = function (state) {
    var t = (state.rng = (state.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  TM.randRange = function (state, lo, hi) { return lo + (hi - lo) * TM.rand(state); };
  TM.randInt = function (state, lo, hi) { return Math.floor(TM.randRange(state, lo, hi + 1)); };
  TM.pick = function (state, arr) { return arr[Math.floor(TM.rand(state) * arr.length)]; };
  TM.chance = function (state, p) { return TM.rand(state) < p; };
  TM.uid = function (state, prefix) { state.seq = (state.seq || 0) + 1; return (prefix || 'id') + state.seq; };

  /* ---------- calendar ---------- */
  TM.dateOf = function (state, day) {
    var d = new Date(state.settings.startDate + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + (day === undefined ? state.day : day));
    return d;
  };
  TM.fmtDate = function (state, day) {
    return TM.dateOf(state, day).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  };
  TM.monthKey = function (state, day) {
    var d = TM.dateOf(state, day);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  };
  TM.monthLabel = function (key) {
    var p = key.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, 1)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: '2-digit' });
  };

  /* ---------- default settings (every number editable in Setup) ---------- */
  TM.defaultSettings = function () {
    return {
      company: 'TrueMile Transport LLC',
      startDate: '2026-01-05',
      seed: 20260105,
      model: 'own_authority',
      authority: 'own',
      partners: [
        { id: 'p1', name: 'Partner A (driver)', pct: 50, capital: 7500, drives: true },
        { id: 'p2', name: 'Partner B (capital & management)', pct: 50, capital: 7500, drives: false }
      ],
      truck: {
        marketId: 'old', price: 25000, acq: 'loan', downPct: 30, apr: 12, termMonths: 48, balloonPct: 0,
        odometer: 820000, mpg: 6.1, condition: 58, ageYears: 10, lifeYears: 3, salvagePct: 20,
        leaseWeekly: 650, leaseIncludesMaint: false, leaseMileAllowance: 120000, leaseTermMonths: 36,
        personalRent: 0
      },
      trailer: { type: 'dry_van', acq: 'rent', price: 32000, rent: 900, downPct: 20, apr: 12, termMonths: 48, lifeYears: 10, salvagePct: 15 },
      carrier: { pct: 20, settleDays: 7, insChargeback: false },
      fuel: { price: 3.85, discount: 0.05, idleGalPerDay: 3, defPct: 0.025, defPrice: 3.6, galsPerStop: 120 },
      ops: { milesPerDay: 500, driverCpm: 0.60, dispatcherPct: 0, factoring: false, factoringPct: 3, planRpm: 2.10, planDeadheadPct: 14, planUtilization: 88 },
      insurance: { downPct: 20 },
      tax: { setAsidePct: 25 },
      comp: { mode: 'guaranteed', driverGpCpm: 0.45, mgrGpWeekly: 0, drawWeekly: 0, profitSharePct: 50, minCash: 3000 },
      credit: { limit: 10000, apr: 24 },
      difficulty: 1
    };
  };

  /* ---------- applicability: does an expense apply to this company (and truck)? ---------- */
  TM.context = function (state) {
    var s = state.settings, acqs = {}, tTypes = {}, tAcqs = {}, hired = false, partnerDriver = false;
    (state.trucks || []).forEach(function (t) {
      acqs[t.acq] = 1;
      if (t.trailer) { tTypes[t.trailer.type] = 1; tAcqs[t.trailer.acq] = 1; }
    });
    if (!state.trucks || !state.trucks.length) {
      acqs[s.truck.acq] = 1; tTypes[s.trailer.type] = 1; tAcqs[s.trailer.type === 'power_only' ? 'none' : s.trailer.acq] = 1;
    }
    (state.drivers || []).forEach(function (d) { if (d.type === 'hired') hired = true; else partnerDriver = true; });
    if (!state.drivers || !state.drivers.length) {
      partnerDriver = s.partners.some(function (p) { return p.drives; });
      hired = !partnerDriver;
    }
    return {
      authority: s.authority, acqs: acqs, tTypes: tTypes, tAcqs: tAcqs, hired: hired, partnerDriver: partnerDriver,
      owned: !!(acqs.loan || acqs.cash || acqs.personal),
      carrierIns: s.authority === 'carrier' && !!s.carrier.insChargeback
    };
  };

  function anyIn(list, set) { for (var i = 0; i < list.length; i++) if (set[list[i]]) return true; return false; }

  // truck (optional): evaluate truck-specific conditions against that truck only.
  TM.applies = function (exp, ctx, truck) {
    if (!exp.on) return false;
    var w = exp.w;
    if (truck && exp.maint && truck.acq === 'lease' && truck.leaseIncludesMaint) return false;
    if (!w) return true;
    if (w.authority && w.authority !== ctx.authority) return false;
    if (w.acq) {
      if (truck) { if (w.acq.indexOf(truck.acq) < 0) return false; } else if (!anyIn(w.acq, ctx.acqs)) return false;
    }
    if (w.trailer) {
      if (truck) { if (!truck.trailer || w.trailer.indexOf(truck.trailer.type) < 0) return false; } else if (!anyIn(w.trailer, ctx.tTypes)) return false;
    }
    if (w.trailerAcq) {
      if (truck) { if (!truck.trailer || w.trailerAcq.indexOf(truck.trailer.acq) < 0) return false; } else if (!anyIn(w.trailerAcq, ctx.tAcqs)) return false;
    }
    if (w.hired && !ctx.hired) return false;
    if (w.partnerDriver && !ctx.partnerDriver) return false;
    if (w.owned) {
      if (truck) { if (truck.acq === 'lease') return false; } else if (!ctx.owned) return false;
    }
    if (w.noCarrierIns && ctx.carrierIns) return false;
    if (w.carrierIns && !ctx.carrierIns) return false;
    return true;
  };

  TM.exp = function (state, id) {
    for (var i = 0; i < state.expenses.length; i++) if (state.expenses[i].id === id) return state.expenses[i];
    return null;
  };
  // Amount of an item if enabled & applicable, else 0.
  TM.amt = function (state, id, truck) {
    var e = TM.exp(state, id);
    if (!e || !TM.applies(e, TM.context(state), truck)) return 0;
    return e.a;
  };
  TM.expName = function (state, id) {
    if (TM.REVENUE_LINES[id]) return TM.REVENUE_LINES[id];
    var e = TM.exp(state, id);
    return e ? e.name : id;
  };

  /* ---------- the ledger ----------
   * Every entry must balance: Δcash + Δar + Δdeposits + Δfixed − ΔaccDep = Δdebt + Δaccrued + Δcontrib − Δdraws + Δpnl
   * pnl > 0 is revenue/gain, pnl < 0 is expense. cf classifies the cash movement: op | inv | fin.
   */
  var BAL_KEYS = ['cash', 'ar', 'dep', 'fixed', 'accDep', 'debt', 'accrued', 'contrib', 'draws', 'pnl'];

  TM.post = function (state, e) {
    BAL_KEYS.forEach(function (k) { e[k] = TM.round2(e[k] || 0); });
    var lhs = e.cash + e.ar + e.dep + e.fixed - e.accDep;
    var rhs = e.debt + e.accrued + e.contrib - e.draws + e.pnl;
    if (Math.abs(lhs - rhs) > 0.02) throw new Error('Unbalanced ledger entry: ' + JSON.stringify(e));
    if (!e.cash && !e.ar && !e.dep && !e.fixed && !e.accDep && !e.debt && !e.accrued && !e.contrib && !e.draws && !e.pnl) return null;
    e.day = state.day;
    e.n = ++state.ledgerSeq;
    var b = state.bal;
    BAL_KEYS.forEach(function (k) { b[k] = TM.round2(b[k] + e[k]); });
    if (e.partnerId && e.contrib) state.partnerEq[e.partnerId].contrib = TM.round2(state.partnerEq[e.partnerId].contrib + e.contrib);
    if (e.partnerId && e.draws) state.partnerEq[e.partnerId].draws = TM.round2(state.partnerEq[e.partnerId].draws + e.draws);

    // monthly aggregates (reports read these; the raw ledger is trimmed)
    var mk = TM.monthKey(state);
    var m = state.agg[mk] || (state.agg[mk] = { pnl: {}, cf: { op: 0, inv: 0, fin: 0 }, miles: 0, loaded: 0, loads: 0, cashEnd: 0 });
    if (e.pnl && e.id) m.pnl[e.id] = TM.round2((m.pnl[e.id] || 0) + e.pnl);
    if (e.cash) m.cf[e.cf || 'op'] = TM.round2(m.cf[e.cf || 'op'] + e.cash);
    m.cashEnd = b.cash;

    state.ledger.push(e);
    if (state.ledger.length > 2500) state.ledger.splice(0, state.ledger.length - 2000);
    return e;
  };

  // Convenience: a cash expense (or expense paid from accrued liability when accrue = true).
  TM.expense = function (state, id, amount, desc, extra) {
    if (!amount || Math.abs(amount) < 0.005) return null;
    var e = Object.assign({ id: id, desc: desc || TM.expName(state, id), cash: -amount, pnl: -amount, cf: 'op' }, extra || {});
    return TM.post(state, e);
  };

  TM.log = function (state, type, title, text, extra) {
    state.log.unshift(Object.assign({ day: state.day, type: type, title: title, text: text || '' }, extra || {}));
    if (state.log.length > 400) state.log.length = 400;
  };

  // Assets − liabilities − equity, should always be 0.
  TM.balanceCheck = function (state) {
    var b = state.bal;
    return TM.round2(b.cash + b.ar + b.dep + b.fixed - b.accDep - (b.debt + b.accrued + b.contrib - b.draws + b.pnl));
  };
})(globalThis.TM = globalThis.TM || {});
