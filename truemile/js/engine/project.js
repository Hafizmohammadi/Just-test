/* TrueMile — projections, startup planner and scenario comparisons. */
(function (TM) {
  'use strict';

  var PER_MONTH = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, annual: 1 / 12 };

  // Monthly projection using the plan assumptions in settings.ops (rate/mile, deadhead %, utilization).
  TM.project = function (state, over) {
    var s = state.settings, o = over || {}, lines = [], ctx = TM.context(state);
    var rpm = o.rpm || s.ops.planRpm, dh = (o.deadheadPct !== undefined ? o.deadheadPct : s.ops.planDeadheadPct) / 100;
    var util = (o.utilization || s.ops.planUtilization) / 100;
    var fuelPrice = (o.fuelPrice || state.fuelPrice) - s.fuel.discount;
    var trucks = state.trucks.filter(function (t) { return !t.sold && t.driverId; });
    var allTrucks = state.trucks.filter(function (t) { return !t.sold; });
    function add(id, name, amount, group) {
      if (!amount || Math.abs(amount) < 0.005) return;
      var ex = lines.filter(function (l) { return l.id === id && l.group === group; })[0];
      if (ex) ex.amount += amount; else lines.push({ id: id, name: name, amount: amount, group: group });
    }
    var revenue = 0, totalMiles = 0, loadedMiles = 0;
    trucks.forEach(function (t) {
      var miles = 30 * (6 / 7) * s.ops.milesPerDay * util, loaded = miles * (1 - dh);
      var rev = loaded * rpm;
      revenue += rev; totalMiles += miles; loadedMiles += loaded;
      if (s.authority === 'carrier') {
        var fscPart = loaded * Math.max(0, ((o.fuelPrice || state.fuelPrice) - 1.25) / 6);
        add('carrier_pct', 'Carrier percentage (linehaul only; FSC passes through)', (rev - fscPart) * s.carrier.pct / 100, 'deduction');
      }
      if (state.dispatcher) add('dispatch_fee', 'Dispatcher fee', rev * s.ops.dispatcherPct / 100, 'deduction');
      if (s.ops.factoring && s.authority === 'own') add('factoring_fee', 'Factoring fee', rev * s.ops.factoringPct / 100, 'deduction');
      add('diesel', 'Diesel', miles / t.mpg * fuelPrice, 'variable');
      if (t.trailer.type === 'reefer') add('reefer_fuel', 'Reefer fuel', loaded * TM.amt(state, 'reefer_fuel', t) * fuelPrice, 'variable');
      add('idle_fuel', 'Idle fuel', 30 * s.fuel.idleGalPerDay * fuelPrice, 'variable');
      TM.variableCpm(state, t).forEach(function (i) { add(i.id, i.name, i.cpm * miles, 'variable'); });
      var loads = loaded / 650;
      state.expenses.forEach(function (e) { if (e.f === 'per_load' && e.k === 'expense' && TM.applies(e, ctx, t)) add(e.id, e.name, e.a * loads, 'variable'); });
    });
    // fixed recurring items
    state.expenses.forEach(function (e) {
      if (!PER_MONTH[e.f] || e.k !== 'expense' || !TM.applies(e, ctx)) return;
      var n = 1;
      if (e.s === 'truck' || e.s === 'trailer') n = allTrucks.filter(function (t) { return TM.applies(e, ctx, t) && (e.s !== 'trailer' || (t.trailer && t.trailer.acq !== 'none')); }).length;
      else if (e.s === 'driver') n = state.drivers.length;
      else if (e.s === 'hired') n = state.drivers.filter(function (d) { return d.type === 'hired'; }).length;
      else if (e.s === 'partnerDriver') n = state.drivers.filter(function (d) { return d.type === 'partner'; }).length;
      add(e.id, e.name, e.a * n * PER_MONTH[e.f], 'fixed');
    });
    TM.insurancePremiums(state).forEach(function (p) { add(p.id, p.name, p.amount / 12, 'fixed'); });
    allTrucks.forEach(function (t) {
      if (t.acq === 'lease') add('lease_payment', 'Truck lease payment', t.leaseWeekly * 52 / 12, 'fixed');
      if (t.acq === 'personal') add('equip_rent_partner', 'Equipment rent to partner', t.personalRent, 'fixed');
      if (t.trailer && (t.trailer.acq === 'rent' || t.trailer.acq === 'lease')) add('trailer_rent', 'Trailer rental', t.trailer.rent, 'fixed');
      if (t.monthlyDep && t.accDep < t.cost * (1 - t.salvagePct / 100)) add('depreciation', 'Depreciation (non-cash)', t.monthlyDep, 'noncash');
      if (t.trailer && t.trailer.monthlyDep) add('depreciation', 'Depreciation (non-cash)', t.trailer.monthlyDep, 'noncash');
    });
    if (s.comp.mode === 'guaranteed' && s.comp.mgrGpWeekly > 0) {
      var mgrs = s.partners.filter(function (p) { return !p.drives; }).length;
      add('partner_gp', 'Partner guaranteed payments (management)', s.comp.mgrGpWeekly * mgrs * 52 / 12, 'fixed');
    }
    var principal = 0;
    state.loans.forEach(function (l) {
      if (l.balance <= 0) return;
      var i = l.balance * l.apr / 1200;
      add('loan_interest', 'Loan interest', i, 'financing');
      principal += Math.min(l.balance, l.payment - i);
    });
    if (state.credit.balance > 0) add('credit_interest', 'Line-of-credit interest', state.credit.balance * state.credit.apr / 1200, 'financing');

    var sum = function (g) { return lines.filter(function (l) { return l.group === g; }).reduce(function (a, l) { return a + l.amount; }, 0); };
    var ded = sum('deduction'), variable = sum('variable'), fixed = sum('fixed'), fin = sum('financing'), noncash = sum('noncash');
    var expenses = ded + variable + fixed + fin + noncash;
    var net = revenue - expenses;
    var draws = s.comp.mode === 'draw' ? s.comp.drawWeekly * 52 / 12 : 0;
    var cashFlow = net + noncash - principal - draws;
    lines.sort(function (a, b) { return b.amount - a.amount; });
    return {
      revenue: revenue, deductions: ded, variable: variable, fixed: fixed, financing: fin, noncash: noncash, expenses: expenses,
      net: net, principal: principal, draws: draws, cashFlow: cashFlow, lines: lines, trucks: trucks.length,
      totalMiles: totalMiles, loadedMiles: loadedMiles,
      cpm: totalMiles ? expenses / totalMiles : 0,
      breakevenRpm: loadedMiles ? expenses / loadedMiles : 0,
      cashBreakevenRpm: loadedMiles ? (expenses - noncash + principal + draws) / loadedMiles : 0,
      fixedPerTruck: (fixed + fin + noncash) / Math.max(1, allTrucks.length),
      margin: revenue ? net / revenue : 0
    };
  };

  TM.fixedMonthlyPerTruck = function (state) {
    if (state._fixedCacheDay === state.day && state._fixedCache !== undefined) return state._fixedCache;
    var v = TM.project(state).fixedPerTruck;
    Object.defineProperty(state, '_fixedCache', { value: v, writable: true, enumerable: false, configurable: true });
    Object.defineProperty(state, '_fixedCacheDay', { value: state.day, writable: true, enumerable: false, configurable: true });
    return v;
  };

  // Day-0 cash uses, grouped by expense category.
  TM.startupBreakdown = function (state) {
    var cats = {}, items = [], capital = 0;
    state.ledger.forEach(function (e) {
      if (e.day !== 0) return;
      if (e.id === 'capital') { capital += e.cash; return; }
      if (!e.cash) return;
      var ex = TM.exp(state, e.id);
      var cat = ex ? ex.cat : (e.id === 'trailer_price' ? 'D' : 'C');
      var kind = e.dep ? 'Refundable deposit (asset)' : e.fixed ? 'Equipment (asset)' : e.pnl ? 'Expense' : 'Other';
      cats[cat] = (cats[cat] || 0) - e.cash;
      items.push({ cat: cat, desc: e.desc, amount: -e.cash, kind: kind });
    });
    var spent = items.reduce(function (a, i) { return a + i.amount; }, 0);
    return { capital: capital, spent: spent, remaining: capital - spent, byCat: cats, items: items };
  };

  // How much cash the company needs to survive until customer payments start arriving.
  TM.cashNeed = function (state) {
    var s = state.settings, pr = TM.project(state);
    var payDays = s.authority === 'carrier' ? s.carrier.settleDays : (s.ops.factoring ? 2 : 30);
    var firstCashDay = payDays + 4; // first load transit + invoicing
    // partner guaranteed pay is only paid when cash allows, so it is left out of the survival bridge
    var gp = pr.lines.filter(function (l) { return l.id === 'partner_gp'; }).reduce(function (a, l) { return a + l.amount; }, 0);
    var cashCostsPerDay = (pr.variable + pr.fixed + pr.financing + pr.principal - gp) / 30;
    var compPerDay = 0;
    if (s.comp.mode === 'draw') compPerDay = s.comp.drawWeekly / 7;
    var bridge = (cashCostsPerDay + compPerDay) * firstCashDay;
    var working = TM.amt(state, 'res_working'), contingency = TM.amt(state, 'res_contingency');
    var startCash = state.startupCash !== undefined ? state.startupCash : state.bal.cash;
    return {
      payDays: payDays, firstCashDay: firstCashDay, deferredPartnerPay: gp, perDay: cashCostsPerDay + compPerDay, bridge: bridge,
      working: working, contingency: contingency, recommended: bridge + contingency,
      startCash: startCash, gap: startCash - (bridge + contingency)
    };
  };

  // Build a scenario from settings without touching the live game.
  TM.scenario = function (settings, expenses, tweak) {
    var s = TM.clone(settings);
    if (tweak) tweak(s);
    var st = TM.newGame(s, { expenses: expenses });
    return { state: st, proj: TM.project(st), startup: TM.startupBreakdown(st), need: TM.cashNeed(st) };
  };

  TM.applyModel = function (s, modelId) {
    var m = TM.BUSINESS_MODELS[modelId];
    s.model = modelId;
    s.authority = m.authority;
    s.truck.acq = m.truckAcq;
    if (m.driver === 'hired') s.partners.forEach(function (p) { p.drives = false; });
    else if (!s.partners.some(function (p) { return p.drives; })) s.partners[0].drives = true;
    return s;
  };

  TM.compareModels = function (settings, expenses) {
    return Object.keys(TM.BUSINESS_MODELS).map(function (id) {
      var sc = TM.scenario(settings, expenses, function (s) { TM.applyModel(s, id); });
      return { id: id, model: TM.BUSINESS_MODELS[id], proj: sc.proj, startup: sc.startup, need: sc.need };
    });
  };

  TM.compareDriver = function (settings, expenses) {
    var own = TM.scenario(settings, expenses, function (s) { if (!s.partners.some(function (p) { return p.drives; })) s.partners[0].drives = true; });
    var hired = TM.scenario(settings, expenses, function (s) { s.partners.forEach(function (p) { p.drives = false; }); });
    return { owner: own, hired: hired };
  };
})(globalThis.TM = globalThis.TM || {});
