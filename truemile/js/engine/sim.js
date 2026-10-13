/* TrueMile — simulation: company setup, assets, drivers, recurring bills and the daily clock. */
(function (TM) {
  'use strict';

  /* ---------- scaling helpers ---------- */
  function trucksFor(state, exp, ctx) {
    return state.trucks.filter(function (t) { return !t.sold && TM.applies(exp, ctx, t); });
  }
  // Charge one item at its scale. mult scales the amount (e.g. 1/10 for an installment).
  TM.chargeScaled = function (state, exp, mult, descSuffix, onlyTruck) {
    var ctx = TM.context(state), total = 0, m = mult === undefined ? 1 : mult;
    if (!TM.applies(exp, ctx)) return 0;
    function one(amount, truck, label) {
      amount = TM.round2(amount * m);
      if (!amount) return;
      var desc = exp.name + (label ? ' — ' + label : '') + (descSuffix ? ' ' + descSuffix : '');
      if (exp.k === 'deposit') {
        TM.post(state, { id: exp.id, desc: desc, cash: -amount, dep: amount, cf: 'inv', truckId: truck && truck.id });
        state.deposits.push({ id: TM.uid(state, 'dep'), name: desc, amount: amount, truckId: truck && truck.id });
      } else if (exp.k === 'reserve') {
        var key = exp.id === 'trailer_reserve' ? 'trailer' : 'maint';
        state.reserves[key] = TM.round2(state.reserves[key] + amount);
      } else if (exp.k === 'info') {
        return;
      } else {
        TM.expense(state, exp.id, amount, desc, { truckId: truck && truck.id });
        if (exp.maint) TM.useMaintReserve(state, amount);
      }
      total += amount;
    }
    if (exp.s === 'truck' || exp.s === 'trailer') {
      trucksFor(state, exp, ctx).forEach(function (t) {
        if (onlyTruck && t !== onlyTruck) return;
        if (exp.s === 'trailer' && (!t.trailer || t.trailer.acq === 'none')) return;
        one(exp.a, t, t.name);
      });
    } else if (!onlyTruck) {
      var n = 1;
      if (exp.s === 'driver') n = state.drivers.length;
      else if (exp.s === 'hired') n = state.drivers.filter(function (d) { return d.type === 'hired'; }).length;
      else if (exp.s === 'partnerDriver') n = state.drivers.filter(function (d) { return d.type === 'partner'; }).length;
      if (n > 0) one(exp.a * n, null, n > 1 ? n + '×' : '');
    }
    return total;
  };

  TM.useMaintReserve = function (state, amount) {
    state.reserves.maint = Math.max(0, TM.round2(state.reserves.maint - amount));
  };

  TM.runFrequency = function (state, freq, filter) {
    state.expenses.forEach(function (e) {
      if (e.f === freq && (!filter || filter(e))) TM.chargeScaled(state, e);
    });
  };

  /* ---------- insurance ---------- */
  TM.truckValue = function (t) {
    if (t.acq === 'loan' || t.acq === 'cash') return Math.max(0, t.cost - t.accDep);
    return t.price;
  };
  // Annual premiums currently in force: [{id, name, amount, truckId}]
  TM.insurancePremiums = function (state, onlyTruck) {
    var ctx = TM.context(state), out = [];
    state.expenses.forEach(function (e) {
      if (e.f !== 'insurance' || !TM.applies(e, ctx)) return;
      if (e.s === 'truck' || e.s === 'trailer') {
        trucksFor(state, e, ctx).forEach(function (t) {
          if (onlyTruck && t !== onlyTruck) return;
          if (e.s === 'trailer' && (!t.trailer || t.trailer.acq === 'none')) return;
          var amt = e.pct ? e.a * TM.truckValue(t) : e.a;
          out.push({ id: e.id, name: e.name, amount: amt * state.ins.mult, truckId: t.id });
        });
      } else if (!onlyTruck) {
        var n = 1;
        if (e.s === 'hired') n = state.drivers.filter(function (d) { return d.type === 'hired'; }).length;
        if (e.s === 'partnerDriver') n = state.drivers.filter(function (d) { return d.type === 'partner'; }).length;
        if (n > 0) out.push({ id: e.id, name: e.name, amount: e.a * n * state.ins.mult });
      }
    });
    return out;
  };
  function payInsurance(state, frac, label, onlyTruck) {
    TM.insurancePremiums(state, onlyTruck).forEach(function (p) {
      TM.expense(state, p.id, p.amount * frac, p.name + ' — ' + label, { truckId: p.truckId });
    });
  }

  /* ---------- assets ---------- */
  TM.createLoan = function (state, o) {
    var balloon = o.principal * (o.balloonPct || 0) / 100;
    var loan = {
      id: TM.uid(state, 'loan'), name: o.name, assetId: o.assetId, principal: TM.round2(o.principal), balance: TM.round2(o.principal),
      apr: o.apr, termMonths: o.termMonths, balloon: TM.round2(balloon),
      payment: TM.round2(TM.loanPayment(o.principal, o.apr, o.termMonths, balloon)),
      paymentsMade: 0, nextDue: state.day + 30, interestPaid: 0
    };
    state.loans.push(loan);
    return loan;
  };

  function acquisitionFees(state, truck) {
    var ctx = TM.context(state), capital = 0;
    state.expenses.forEach(function (e) {
      if (e.f !== 'acquisition' || !TM.applies(e, ctx, truck)) return;
      var amt = e.pct ? e.a / 100 * truck.price : e.a;
      if (!amt) return;
      if (e.k === 'capital') capital += amt;
      else TM.expense(state, e.id, amt, e.name + ' — ' + truck.name, { truckId: truck.id });
      if (e.id === 'ext_warranty') truck.warranty = true;
    });
    return capital;
  }

  /* opts: marketId, price, acq, downPct, apr, termMonths, balloonPct, mpg, condition, odometer, ageYears, lifeYears,
           leaseWeekly, leaseIncludesMaint, personalRent, trailer:{type, acq, price, rent, downPct, apr, termMonths}, city, initial */
  TM.acquireTruck = function (state, opts) {
    var s = state.settings, mk = TM.TRUCK_MARKET.filter(function (m) { return m.id === opts.marketId; })[0] || {};
    var n = state.trucks.length + 1;
    var t = {
      id: TM.uid(state, 'truck'), name: 'Truck ' + n, acq: opts.acq, marketId: opts.marketId,
      price: +opts.price || mk.price, mpg: +opts.mpg || mk.mpg, condition: +opts.condition || mk.condition,
      odometer: +opts.odometer || mk.odometer || 0, ageYears: opts.ageYears !== undefined ? +opts.ageYears : (mk.ageYears || 0),
      lifeYears: +opts.lifeYears || mk.life || 5, salvagePct: opts.salvagePct !== undefined ? +opts.salvagePct : 20,
      cost: 0, accDep: 0, status: 'idle', city: opts.city || state.settings.homeCity, trip: null, shopDays: 0,
      intervals: {}, loanId: null, driverId: null, warranty: false, milesDriven: 0, acquiredDay: state.day,
      leaseWeekly: +opts.leaseWeekly || 0, leaseIncludesMaint: !!opts.leaseIncludesMaint,
      leaseAllowance: +opts.leaseMileAllowance || 120000, leaseTermMonths: +opts.leaseTermMonths || 36,
      personalRent: +opts.personalRent || 0, revenue: 0, trailer: null
    };
    // stagger maintenance intervals so the first PM / tire set comes due at a realistic time
    t.intervals.pm_service = TM.randInt(state, 0, 12000);
    t.intervals.tires_truck = TM.randInt(state, 20000, 100000);
    t.intervals.dpf_clean = TM.randInt(state, 0, 180000);
    state.trucks.push(t);

    var label = t.name + ' (' + (mk.name || 'tractor') + ')';
    if (t.acq === 'cash' || t.acq === 'loan') {
      var capital = acquisitionFees(state, t);
      t.cost = TM.round2(t.price + capital);
      if (t.acq === 'cash') {
        TM.post(state, { id: 'truck_price', desc: 'Bought ' + label + ' for cash', cash: -t.cost, fixed: t.cost, cf: 'inv', truckId: t.id });
      } else {
        var down = TM.round2(t.price * opts.downPct / 100);
        var principal = TM.round2(t.price - down);
        TM.post(state, { id: 'down_payment', desc: 'Down payment + capitalized costs — ' + label, cash: -(down + capital), fixed: t.cost, debt: principal, cf: 'inv', truckId: t.id });
        var loan = TM.createLoan(state, { name: t.name + ' loan', assetId: t.id, principal: principal, apr: +opts.apr, termMonths: +opts.termMonths, balloonPct: +opts.balloonPct || 0 });
        t.loanId = loan.id;
      }
      t.monthlyDep = TM.round2(TM.monthlyDepreciation(t.cost, t.salvagePct, t.lifeYears));
    } else if (t.acq === 'lease') {
      acquisitionFees(state, t);
      t.leaseStartMiles = 0;
      t.leaseStartDay = state.day;
    } else if (t.acq === 'personal') {
      acquisitionFees(state, t);
      if (!t.personalRent) {
        t.personalRent = TM.round2(TM.loanPayment(t.price * (1 - (opts.downPct || 0) / 100), +opts.apr || 12, +opts.termMonths || 48, 0));
      }
    }
    TM.attachTrailer(state, t, opts.trailer || { type: s.trailer.type, acq: s.trailer.acq, price: s.trailer.price, rent: s.trailer.rent });

    if (!opts.initial) {
      // per-truck startup gear, plates/HVUT and the insurance down payment for the added unit
      state.expenses.forEach(function (e) {
        if ((e.f === 'startup' && (e.s === 'truck' || e.s === 'trailer')) || (e.f === 'annual' && e.atStart && e.s === 'truck')) TM.chargeScaled(state, e, 1, '', t);
      });
      payInsurance(state, s.insurance.downPct / 100, 'down payment (added unit)', t);
      TM.log(state, 'info', 'Added ' + t.name, label + ' acquired by ' + t.acq + '.');
    }
    return t;
  };

  TM.attachTrailer = function (state, t, o) {
    var type = o.type, acq = type === 'power_only' ? 'none' : o.acq;
    var tr = { type: type, acq: acq, price: +o.price || 0, rent: +o.rent || 0, cost: 0, accDep: 0, loanId: null, monthlyDep: 0 };
    t.trailer = tr;
    if (acq === 'cash') {
      tr.cost = tr.price;
      TM.post(state, { id: 'trailer_price', desc: 'Bought trailer for ' + t.name, cash: -tr.cost, fixed: tr.cost, cf: 'inv', truckId: t.id });
    } else if (acq === 'loan') {
      tr.cost = tr.price;
      var down = TM.round2(tr.price * (o.downPct !== undefined ? o.downPct : state.settings.trailer.downPct) / 100);
      TM.post(state, { id: 'trailer_price', desc: 'Trailer down payment — ' + t.name, cash: -down, fixed: tr.cost, debt: tr.price - down, cf: 'inv', truckId: t.id });
      var loan = TM.createLoan(state, { name: t.name + ' trailer loan', assetId: t.id, principal: tr.price - down, apr: o.apr || state.settings.trailer.apr, termMonths: o.termMonths || state.settings.trailer.termMonths });
      loan.trailer = true;
      tr.loanId = loan.id;
    }
    if (tr.cost) tr.monthlyDep = TM.round2(TM.monthlyDepreciation(tr.cost, state.settings.trailer.salvagePct, state.settings.trailer.lifeYears));
    return tr;
  };

  /* ---------- drivers ---------- */
  TM.assignPartnerDriver = function (state, partnerId, truck) {
    var p = state.settings.partners.filter(function (x) { return x.id === partnerId; })[0];
    var d = { id: TM.uid(state, 'drv'), name: p.name, type: 'partner', partnerId: p.id, truckId: truck ? truck.id : null, daysSinceReset: 0, ytd: 0, ytdYear: 0, hiredDay: state.day };
    state.drivers.push(d);
    if (truck) truck.driverId = d.id;
    return d;
  };

  TM.hireDriver = function (state, truck, opts) {
    var o = opts || {};
    var names = ['Marcus Hill', 'Dana Ruiz', 'Tom Becker', 'Aisha Grant', 'Luis Moreno', 'Kelly Shaw', 'Andre Wells', 'Priya Nair', 'Jake Olsen', 'Rosa Vega'];
    var d = {
      id: TM.uid(state, 'drv'), name: o.name || TM.pick(state, names), type: 'hired', cpm: +o.cpm || state.settings.ops.driverCpm,
      truckId: truck ? truck.id : null, daysSinceReset: 0, ytd: 0, ytdYear: TM.dateOf(state).getUTCFullYear(), hiredDay: state.day
    };
    state.drivers.push(d);
    if (truck) truck.driverId = d.id;
    TM.runFrequency(state, 'hire');
    // a new hire also joins the drug & alcohol program
    ['consortium', 'clearinghouse', 'mvr_annual'].forEach(function (id) {
      var e = TM.exp(state, id);
      if (e && state.day > 0 && TM.applies(e, TM.context(state))) TM.expense(state, id, e.a, e.name + ' — ' + d.name);
    });
    if (state.day > 0) {
      var wc = TM.exp(state, 'ins_workcomp');
      if (wc && TM.applies(wc, TM.context(state))) TM.expense(state, 'ins_workcomp', wc.a * state.settings.insurance.downPct / 100 * state.ins.mult, 'Workers\' comp down payment — ' + d.name);
    }
    TM.log(state, 'info', 'Hired ' + d.name, 'Pay: ' + Math.round(d.cpm * 100) + '¢/mile. Onboarding costs charged.');
    return d;
  };

  TM.driverOf = function (state, truck) {
    for (var i = 0; i < state.drivers.length; i++) if (state.drivers[i].id === truck.driverId) return state.drivers[i];
    return null;
  };

  /* ---------- new game ---------- */
  TM.newGame = function (settings, opts) {
    var o = opts || {};
    var s = TM.clone(settings || TM.defaultSettings());
    if (!s.homeCity) s.homeCity = 'DAL';
    var state = {
      version: 1, settings: s, expenses: TM.mergeExpenses(o.expenses), day: 0, rng: s.seed >>> 0, seq: 0, ledgerSeq: 0,
      bal: { cash: 0, ar: 0, dep: 0, fixed: 0, accDep: 0, debt: 0, accrued: 0, contrib: 0, draws: 0, pnl: 0 },
      partnerEq: {}, agg: {}, ledger: [], log: [], trucks: [], drivers: [], loans: [], ar: [], deposits: [],
      credit: { open: false, limit: s.credit.limit, apr: s.credit.apr, balance: 0 },
      accruals: { wages: {}, gp: {} }, reserves: { maint: 0, trailer: 0 },
      fuelPrice: s.fuel.price, market: 1, board: {}, boardDay: -1, pending: [], completed: [],
      stats: { loads: 0, late: 0, miles: 0, loadedMiles: 0, revenue: 0, claims: 0, breakdowns: 0, badDebt: 0, maxCash: 0, minCash: 0, profitableMonths: 0 },
      ifta: { owed: 0, paid: 0 }, ins: { mult: 1, installmentsLeft: 10, claimsThisYear: 0 },
      negDays: 0, gameOver: null, challenges: {}, lastQuarterPnl: 0, lastMonthPnl: 0, dispatcher: s.ops.dispatcherPct > 0
    };
    s.partners.forEach(function (p) { state.partnerEq[p.id] = { contrib: 0, draws: 0 }; state.accruals.gp[p.id] = 0; });

    s.partners.forEach(function (p) {
      if (+p.capital) TM.post(state, { id: 'capital', desc: p.name + ' capital contribution', cash: +p.capital, contrib: +p.capital, cf: 'fin', partnerId: p.id });
    });

    var model = TM.BUSINESS_MODELS[s.model] || {};
    var nTrucks = o.trucks || model.trucks || 1;
    var drivingPartners = s.partners.filter(function (p) { return p.drives; });
    for (var i = 0; i < nTrucks; i++) {
      var t = TM.acquireTruck(state, Object.assign({}, s.truck, { initial: true, city: s.homeCity }));
      var dp = drivingPartners[i];
      if (dp) TM.assignPartnerDriver(state, dp.id, t);
    }
    // hire drivers for trucks without a partner, then startup one-time items and annual items due before operating
    state.trucks.forEach(function (t) { if (!t.driverId) TM.hireDriver(state, t); });
    TM.runFrequency(state, 'startup');
    TM.runFrequency(state, 'annual', function (e) { return e.atStart; });
    payInsurance(state, s.insurance.downPct / 100, 'down payment');

    state.startupCash = state.bal.cash;
    state.history = [{ d: 0, c: state.bal.cash, a: 0, p: state.bal.pnl }];
    TM.log(state, 'lesson', 'Welcome to ' + s.company,
      'Your truck is parked in ' + TM.cityById(s.homeCity).name + '. Open the Load Board, pick a load and press "Next day" to drive it. ' +
      'Remember: you get paid when the broker pays — often 30+ days after delivery.');
    if (TM.refreshBoards) TM.refreshBoards(state);
    return state;
  };

  // Merge saved overrides (amount / on / custom items) with the built-in database.
  TM.mergeExpenses = function (saved) {
    var base = TM.clone(TM.EXPENSES);
    if (!saved) return base;
    var byId = {};
    saved.forEach(function (e) { byId[e.id] = e; });
    base.forEach(function (e) { var s = byId[e.id]; if (s) { e.a = s.a; e.on = s.on; } });
    saved.forEach(function (e) { if (e.custom) base.push(TM.clone(e)); });
    return base;
  };

  /* ---------- daily clock ---------- */
  function isFirstOfMonth(state) { return TM.dateOf(state).getUTCDate() === 1; }
  function isAnniversary(state) {
    if (state.day === 0) return false;
    var a = TM.dateOf(state, 0), d = TM.dateOf(state);
    return a.getUTCMonth() === d.getUTCMonth() && a.getUTCDate() === d.getUTCDate();
  }

  TM.cashAvailable = function (state) {
    return state.bal.cash + (state.credit.open ? state.credit.limit - state.credit.balance : 0);
  };

  TM.advanceDay = function (state) {
    if (state.gameOver) return { ok: false, reason: 'Game over' };
    if (state.pending.length) return { ok: false, reason: 'Resolve the pending decision first.' };
    state.day += 1;
    var dow = state.day % 7;

    if (dow === 0) TM.weeklyMarket(state);

    state.trucks.forEach(function (t) { if (!t.sold) TM.truckDay(state, t); });
    TM.collectReceivables(state);

    if (dow === 0) weekly(state);
    if (isFirstOfMonth(state)) monthly(state);
    if (isAnniversary(state)) annual(state);
    loans(state);
    if (TM.companyEvents) TM.companyEvents(state);

    TM.refreshBoards(state);
    solvency(state);
    if (TM.evalChallenges) TM.evalChallenges(state);
    state.history.push({ d: state.day, c: state.bal.cash, a: state.bal.ar, p: state.bal.pnl });
    if (state.history.length > 1100) state.history.splice(0, state.history.length - 1095);
    state.stats.maxCash = Math.max(state.stats.maxCash, state.bal.cash);
    state.stats.minCash = Math.min(state.stats.minCash, state.bal.cash);
    return { ok: true };
  };

  // Advance until something needs attention (idle truck, decision, or n days).
  TM.advanceUntil = function (state, maxDays) {
    var n = 0;
    while (n < maxDays) {
      var r = TM.advanceDay(state);
      if (!r.ok) return r;
      n++;
      if (state.pending.length || state.gameOver) break;
      if (state.trucks.some(function (t) { return !t.sold && t.status === 'idle' && t.driverId; })) break;
    }
    return { ok: true, days: n };
  };

  function weekly(state) {
    var s = state.settings;
    TM.runFrequency(state, 'weekly');
    state.trucks.forEach(function (t) {
      if (!t.sold && t.acq === 'lease') TM.expense(state, 'lease_payment', t.leaseWeekly, 'Truck lease — ' + t.name, { truckId: t.id });
    });
    // payroll for hired drivers (wages were accrued as miles were driven)
    state.drivers.forEach(function (d) {
      var owed = state.accruals.wages[d.id] || 0;
      if (owed <= 0) return;
      var year = TM.dateOf(state).getUTCFullYear();
      if (d.ytdYear !== year) { d.ytd = 0; d.ytdYear = year; }
      TM.post(state, { id: 'driver_wages', desc: 'Payroll — ' + d.name, cash: -owed, accrued: -owed, cf: 'op' });
      state.accruals.wages[d.id] = 0;
      var fica = TM.amt(state, 'payroll_fica') * owed;
      var futa = TM.amt(state, 'payroll_futa') * Math.max(0, Math.min(owed, 7000 - d.ytd));
      var suta = TM.amt(state, 'payroll_suta') * Math.max(0, Math.min(owed, 9000 - d.ytd));
      d.ytd += owed;
      TM.expense(state, 'payroll_fica', fica, 'Employer FICA — ' + d.name);
      TM.expense(state, 'payroll_futa', futa, 'FUTA — ' + d.name);
      TM.expense(state, 'payroll_suta', suta, 'SUTA — ' + d.name);
    });
    // partner compensation
    var c = s.comp;
    if (c.mode === 'guaranteed' && c.mgrGpWeekly > 0) {
      s.partners.forEach(function (p) {
        if (p.drives) return;
        TM.post(state, { id: 'partner_gp', desc: 'Guaranteed payment (management) — ' + p.name, accrued: c.mgrGpWeekly, pnl: -c.mgrGpWeekly });
        state.accruals.gp[p.id] += c.mgrGpWeekly;
      });
    }
    s.partners.forEach(function (p) {
      var owed = state.accruals.gp[p.id] || 0;
      var pay = TM.round2(Math.min(owed, state.bal.cash - c.minCash));
      if (pay > 0) {
        TM.post(state, { id: 'partner_gp', desc: 'Paid guaranteed payments — ' + p.name + (pay < owed ? ' (partial, cash is tight)' : ''), cash: -pay, accrued: -pay, cf: 'op' });
        state.accruals.gp[p.id] = TM.round2(owed - pay);
      }
    });
    if (c.mode === 'draw' && c.drawWeekly > 0) {
      var total = c.drawWeekly;
      if (state.bal.cash - total >= c.minCash) {
        s.partners.forEach(function (p) {
          var amt = TM.round2(total * p.pct / 100);
          if (amt) TM.post(state, { id: 'partner_draw', desc: 'Owner draw — ' + p.name, cash: -amt, draws: amt, cf: 'fin', partnerId: p.id });
        });
      } else TM.log(state, 'warn', 'Draws skipped', 'Cash is below your minimum of ' + TM.money(c.minCash) + ', so this week\'s partner draws were skipped.');
    }
  }

  function monthly(state) {
    var s = state.settings;
    TM.runFrequency(state, 'monthly');
    var mo = TM.dateOf(state).getUTCMonth();
    if (mo % 3 === 0) {
      TM.runFrequency(state, 'quarterly');
      quarterEnd(state);
    }
    // insurance installments
    if (state.ins.installmentsLeft > 0) {
      payInsurance(state, (1 - s.insurance.downPct / 100) / 10, 'installment ' + (11 - state.ins.installmentsLeft) + '/10');
      state.ins.installmentsLeft--;
    }
    state.trucks.forEach(function (t) {
      if (t.sold) return;
      if (t.acq === 'personal' && t.personalRent) TM.expense(state, 'equip_rent_partner', t.personalRent, 'Equipment rent to partner — ' + t.name, { truckId: t.id });
      if (t.trailer && (t.trailer.acq === 'rent' || t.trailer.acq === 'lease')) TM.expense(state, 'trailer_rent', t.trailer.rent, 'Trailer rental — ' + t.name, { truckId: t.id });
      depreciate(state, t, t, 'depreciation', t.name);
      if (t.trailer && t.trailer.cost) depreciate(state, t, t.trailer, 'depreciation', t.name + ' trailer');
    });
    if (state.credit.balance > 0) TM.expense(state, 'credit_interest', state.credit.balance * state.credit.apr / 1200, 'Line-of-credit interest');

    // profit-share distributions (mode "profit")
    var lastKey = TM.monthKey(state, state.day - 1);
    var last = state.agg[lastKey];
    var lastProfit = last ? Object.keys(last.pnl).reduce(function (a, k) { return a + last.pnl[k]; }, 0) : 0;
    state.lastMonthPnl = lastProfit;
    if (lastProfit > 0 && state.day > 1) state.stats.profitableMonths++;
    if (s.comp.mode === 'profit' && lastProfit > 0) {
      var dist = TM.round2(lastProfit * s.comp.profitSharePct / 100);
      if (state.bal.cash - dist >= s.comp.minCash) {
        s.partners.forEach(function (p) {
          var amt = TM.round2(dist * p.pct / 100);
          if (amt) TM.post(state, { id: 'partner_draw', desc: 'Profit distribution — ' + p.name, cash: -amt, draws: amt, cf: 'fin', partnerId: p.id });
        });
        TM.log(state, 'good', 'Profit distributed', TM.money(dist) + ' of last month\'s ' + TM.money(lastProfit) + ' profit paid to partners.');
      } else TM.log(state, 'warn', 'Distribution skipped', 'Last month was profitable (' + TM.money(lastProfit) + ') but cash is too low to distribute safely.');
    }
  }

  function depreciate(state, truck, asset, id, label) {
    if (!asset.cost || !asset.monthlyDep) return;
    var salvage = asset.cost * ((asset === truck ? truck.salvagePct : state.settings.trailer.salvagePct) / 100);
    var amt = Math.min(asset.monthlyDep, asset.cost - salvage - asset.accDep);
    if (amt <= 0.005) return;
    asset.accDep = TM.round2(asset.accDep + amt);
    TM.post(state, { id: id, desc: 'Depreciation (non-cash) — ' + label, accDep: amt, pnl: -amt, truckId: truck.id });
  }

  function quarterEnd(state) {
    var s = state.settings;
    // IFTA: tax owed for miles in each state minus tax already paid at the pump
    if (s.authority === 'own' && TM.exp(state, 'ifta_recon').on) {
      var net = TM.round2(state.ifta.owed - state.ifta.paid);
      if (net > 0) TM.expense(state, 'ifta_recon', net, 'IFTA quarterly return — tax due');
      else if (net < 0) TM.post(state, { id: 'rev_ifta_refund', desc: 'IFTA quarterly return — credit', cash: -net, pnl: -net, cf: 'op' });
      if (net) TM.log(state, 'info', 'IFTA return filed', (net > 0 ? 'Paid ' : 'Credit of ') + TM.money(Math.abs(net)) + '. You bought fuel in cheaper (lower-tax) states than you drove in — IFTA trues that up.');
      state.ifta = { owed: 0, paid: 0 };
    }
    // tax distributions so partners can pay estimated income + self-employment tax
    var qProfit = state.bal.pnl - state.lastQuarterPnl;
    state.lastQuarterPnl = state.bal.pnl;
    if (qProfit > 0 && s.tax.setAsidePct > 0) {
      var amt = TM.round2(qProfit * s.tax.setAsidePct / 100);
      if (state.bal.cash - amt >= 0) {
        s.partners.forEach(function (p) {
          var share = TM.round2(amt * p.pct / 100);
          if (share) TM.post(state, { id: 'partner_draw', desc: 'Tax distribution — ' + p.name, cash: -share, draws: share, cf: 'fin', partnerId: p.id });
        });
        TM.log(state, 'info', 'Quarterly tax distribution', TM.money(amt) + ' (' + s.tax.setAsidePct + '% of ' + TM.money(qProfit) + ' quarterly profit) sent to partners for estimated taxes. The LLC is a pass-through: profit is taxed on the partners\' returns.');
      } else TM.log(state, 'bad', 'Could not fund estimated taxes', 'The company earned ' + TM.money(qProfit) + ' this quarter but lacks cash for the ' + TM.money(amt) + ' tax distribution. Partners still owe the tax personally!', { lesson: 'profit-vs-cash' });
    }
  }

  function annual(state) {
    var s = state.settings;
    TM.runFrequency(state, 'annual');
    // insurance renewal
    var adj = state.ins.claimsThisYear > 0 ? 1.15 : 0.92;
    state.ins.mult = TM.round2(state.ins.mult * adj);
    state.ins.claimsThisYear = 0;
    state.ins.installmentsLeft = 10;
    payInsurance(state, s.insurance.downPct / 100, 'renewal down payment');
    TM.log(state, adj > 1 ? 'bad' : 'good', 'Insurance renewed', adj > 1 ? 'Claims last year raised premiums 15%.' : 'A clean year earned an 8% premium reduction.');
  }

  function loans(state) {
    state.loans.forEach(function (l) {
      if (l.balance <= 0.005 || state.day < l.nextDue) return;
      var interest = TM.round2(l.balance * l.apr / 1200);
      var principal = l.paymentsMade + 1 >= l.termMonths ? l.balance : Math.min(l.balance, TM.round2(l.payment - interest));
      TM.expense(state, 'loan_interest', interest, 'Interest — ' + l.name);
      TM.post(state, { id: 'loan_principal', desc: 'Principal — ' + l.name + (l.paymentsMade + 1 >= l.termMonths && l.balloon ? ' (incl. balloon)' : ''), cash: -principal, debt: -principal, cf: 'fin' });
      l.balance = TM.round2(l.balance - principal);
      l.interestPaid = TM.round2(l.interestPaid + interest);
      l.paymentsMade++;
      l.nextDue += 30;
      if (l.balance <= 0.005) TM.log(state, 'good', l.name + ' paid off', 'No more monthly payment for this unit.');
    });
  }

  TM.payoffLoan = function (state, loanId) {
    var l = state.loans.filter(function (x) { return x.id === loanId; })[0];
    if (!l || l.balance <= 0) return false;
    if (state.bal.cash < l.balance) return false;
    TM.post(state, { id: 'payoff', desc: 'Early payoff — ' + l.name, cash: -l.balance, debt: -l.balance, cf: 'fin' });
    TM.log(state, 'good', 'Paid off ' + l.name, TM.money(l.balance) + ' paid early — saves the remaining interest.');
    l.balance = 0;
    return true;
  };

  /* ---------- financing actions ---------- */
  TM.openCredit = function (state) {
    if (state.credit.open) return;
    state.credit.open = true;
    TM.log(state, 'info', 'Line of credit opened', TM.money(state.credit.limit) + ' at ' + state.credit.apr + '% APR. It covers overdrafts automatically — and charges interest monthly.');
  };
  TM.repayCredit = function (state, amount) {
    var amt = TM.round2(Math.min(amount, state.credit.balance, state.bal.cash));
    if (amt <= 0) return 0;
    TM.post(state, { id: 'credit_repay', desc: 'Repaid line of credit', cash: -amt, debt: -amt, cf: 'fin' });
    state.credit.balance = TM.round2(state.credit.balance - amt);
    return amt;
  };
  TM.contribute = function (state, partnerId, amount) {
    var p = state.settings.partners.filter(function (x) { return x.id === partnerId; })[0];
    if (!p || !(amount > 0)) return;
    TM.post(state, { id: 'capital', desc: 'Additional capital — ' + p.name, cash: amount, contrib: amount, cf: 'fin', partnerId: p.id });
    TM.log(state, 'info', 'Capital contributed', p.name + ' put in ' + TM.money(amount) + '. Contributions raise equity; they are not revenue.');
  };

  function solvency(state) {
    var b = state.bal;
    if (b.cash < 0 && state.credit.open) {
      var room = state.credit.limit - state.credit.balance;
      var draw = TM.round2(Math.min(room, -b.cash + 500));
      if (draw > 0) {
        TM.post(state, { id: 'credit_draw', desc: 'Line-of-credit draw to cover overdraft', cash: draw, debt: draw, cf: 'fin' });
        state.credit.balance = TM.round2(state.credit.balance + draw);
      }
    }
    if (b.cash < 0) {
      state.negDays++;
      if (state.negDays === 1) TM.log(state, 'bad', 'Account overdrawn!', 'Cash is ' + TM.money(b.cash) + '. Bills are bouncing. Collect receivables, factor invoices, get a line of credit or add capital — within 14 days or the company fails.', { lesson: 'profit-vs-cash' });
      if (state.negDays > 14 || b.cash < -15000) {
        state.gameOver = {
          day: state.day, reason: 'Ran out of cash',
          text: 'TrueMile could not pay its bills for ' + state.negDays + ' days. Net profit to date was ' + TM.money(b.pnl) +
            ' and ' + TM.money(b.ar) + ' was still owed by customers — a classic cash-flow failure.'
        };
        TM.log(state, 'bad', 'Bankruptcy', state.gameOver.text, { lesson: 'profit-vs-cash' });
      }
    } else state.negDays = 0;
  }

  /* ---------- selling equipment ---------- */
  TM.marketValue = function (state, t) {
    var mk = TM.TRUCK_MARKET.filter(function (m) { return m.id === t.marketId; })[0];
    var years = t.ageYears + (state.day - t.acquiredDay) / 365;
    var base = t.price * Math.pow(0.86, years - t.ageYears) * (0.75 + t.condition / 400);
    base -= t.milesDriven * 0.03;
    return Math.max(mk ? mk.price * 0.25 : 5000, TM.round2(base));
  };

  TM.sellTruck = function (state, truckId) {
    var t = state.trucks.filter(function (x) { return x.id === truckId; })[0];
    if (!t || t.sold || t.status !== 'idle') return { ok: false, reason: 'Truck must be idle.' };
    if (t.acq === 'lease') {
      var months = TM.amt(state, 'lease_early_term') || 0;
      var monthsUsed = (state.day - t.leaseStartDay) / 30;
      var fee = monthsUsed < t.leaseTermMonths ? months * t.leaseWeekly * 52 / 12 : 0;
      var allowance = t.leaseAllowance * monthsUsed / 12;
      var excess = Math.max(0, t.milesDriven - allowance) * (TM.amt(state, 'lease_excess_miles') || 0);
      if (fee) TM.expense(state, 'lease_early_term', fee, 'Early lease termination — ' + t.name);
      if (excess) TM.expense(state, 'lease_excess_miles', excess, 'Excess mileage — ' + t.name);
      var endc = TM.amt(state, 'lease_end');
      if (endc) TM.expense(state, 'lease_end', endc, 'Lease return charges — ' + t.name);
    } else if (t.acq === 'personal') {
      // partner keeps the truck; the rental arrangement simply ends
    } else {
      var value = TM.marketValue(state, t);
      var book = t.cost - t.accDep;
      var loan = state.loans.filter(function (l) { return l.id === t.loanId; })[0];
      var payoff = loan ? loan.balance : 0;
      TM.post(state, { id: 'asset_sale', desc: 'Sold ' + t.name + ' for ' + TM.money(value) + ' (book ' + TM.money(book) + ')', cash: value, fixed: -t.cost, accDep: -t.accDep, pnl: value - book, cf: 'inv' });
      if (payoff) {
        TM.post(state, { id: 'payoff', desc: 'Loan payoff from sale — ' + t.name, cash: -payoff, debt: -payoff, cf: 'fin' });
        loan.balance = 0;
      }
    }
    // trailer goes with it
    var tr = t.trailer;
    if (tr && tr.cost) {
      var tv = TM.round2((tr.cost - tr.accDep) * 0.9);
      TM.post(state, { id: 'asset_sale', desc: 'Sold trailer of ' + t.name, cash: tv, fixed: -tr.cost, accDep: -tr.accDep, pnl: tv - (tr.cost - tr.accDep), cf: 'inv' });
      var tl = state.loans.filter(function (l) { return l.id === tr.loanId; })[0];
      if (tl && tl.balance) { TM.post(state, { id: 'payoff', desc: 'Trailer loan payoff', cash: -tl.balance, debt: -tl.balance, cf: 'fin' }); tl.balance = 0; }
    }
    // refund deposits tied to this truck
    state.deposits.filter(function (d) { return d.truckId === t.id && !d.done; }).forEach(function (d) {
      TM.post(state, { id: 'deposit_refund', desc: 'Deposit refunded — ' + d.name, cash: d.amount, dep: -d.amount, cf: 'inv' });
      d.done = true;
    });
    var drv = TM.driverOf(state, t);
    if (drv) drv.truckId = null;
    t.driverId = null;
    t.sold = true;
    t.status = 'sold';
    TM.log(state, 'info', t.name + ' disposed', 'Equipment sold/returned. Check the balance sheet for the gain or loss.');
    return { ok: true };
  };
})(globalThis.TM = globalThis.TM || {});
