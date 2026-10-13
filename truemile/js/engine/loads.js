/* TrueMile — freight market: load boards, load economics, driving, delivery and receivables. */
(function (TM) {
  'use strict';

  var SEASON = [0.94, 0.95, 1.00, 1.02, 1.03, 1.06, 1.04, 1.00, 0.99, 1.05, 1.08, 1.03];

  TM.gauss = function (state) {
    var u = Math.max(1e-9, TM.rand(state)), v = TM.rand(state);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  TM.weeklyMarket = function (state) {
    var base = state.settings.fuel.price, old = state.fuelPrice;
    var p = old + TM.gauss(state) * 0.05 + 0.10 * (base - old);
    if (TM.chance(state, 0.025 * state.settings.difficulty)) {
      p += 0.30;
      TM.log(state, 'bad', 'Diesel price spike', 'Refinery outage: diesel jumped about 30¢/gal. Fuel is your biggest variable cost — every 10¢ costs a one-truck carrier roughly $180 a month.');
    }
    state.fuelPrice = TM.round2(TM.clamp(p, 2.8, 6.5));
    state.market = TM.round2(TM.clamp(state.market + TM.gauss(state) * 0.03 + 0.15 * (1 - state.market), 0.8, 1.25));
  };

  TM.fuelPriceAt = function (state, stateCode) {
    var st = TM.STATES[stateCode] || { dieselOffset: 0 };
    return TM.round2(state.fuelPrice + st.dieselOffset - state.settings.fuel.discount);
  };

  /* ---------- load boards ---------- */
  TM.refreshBoards = function (state) {
    var fresh = state.boardDay !== state.day, keep = {};
    state.boardDay = state.day;
    state.trucks.forEach(function (t) {
      if (t.sold || t.status !== 'idle') return;
      var key = t.city + '|' + t.trailer.type;
      if (keep[key]) return;
      keep[key] = !fresh && state.board[key] ? state.board[key] : genLoads(state, t.city, t.trailer.type);
    });
    state.board = keep;
  };

  TM.boardFor = function (state, truck) {
    return state.board[truck.city + '|' + truck.trailer.type] || [];
  };

  function nearbyCities(cityId, maxMiles) {
    return TM.CITIES.filter(function (c) { var d = TM.distance(cityId, c.id); return d > 0 && d <= maxMiles; });
  }

  function genLoads(state, cityId, trailerType) {
    var s = state.settings, loads = [], here = TM.cityById(cityId);
    var n = 6 + (state.dispatcher ? 2 : 0) + (here.out > 1.05 ? 1 : 0) - (here.out < 0.8 ? 2 : 0);
    var near = nearbyCities(cityId, 260);
    var month = TM.dateOf(state).getUTCMonth();
    var tt = TM.TRAILER_TYPES[trailerType] || TM.TRAILER_TYPES.dry_van;
    for (var i = 0; i < n; i++) {
      var pickup = here, deadhead = TM.randInt(state, 10, 85);
      if (near.length && TM.chance(state, 0.45)) { pickup = TM.pick(state, near); deadhead = TM.distance(cityId, pickup.id); }
      var dest;
      for (var k = 0; k < 20; k++) {
        dest = TM.pick(state, TM.CITIES);
        if (dest.id !== pickup.id && TM.distance(pickup.id, dest.id) >= 160) break;
      }
      var miles = TM.distance(pickup.id, dest.id);
      var payer, direct = false, carrier = s.authority === 'carrier';
      if (carrier) payer = { id: 'carrier', name: 'Carrier dispatch (settlement)', credit: 99, days: s.carrier.settleDays, spread: 0, rateMult: 1.0, quickPay: 0 };
      else if (TM.chance(state, 0.12)) { payer = TM.pick(state, TM.DIRECT_SHIPPERS); direct = true; }
      else payer = TM.pick(state, TM.BROKERS);

      var rpm = (2.05 + tt.rateAdj) * SEASON[month] * state.market *
        Math.pow(pickup.out, 0.6) / Math.pow(dest.out, 0.35) * payer.rateMult * (state.dispatcher ? 1.04 : 1);
      if (miles < 350) rpm *= 1 + (350 - miles) / 350 * 0.7;
      rpm *= 1 + TM.gauss(state) * 0.07;
      var allIn = Math.max(300, Math.round(miles * rpm / 25) * 25);
      // Direct shippers quote linehaul + FSC; under a carrier lease the FSC is passed through outside the carrier %.
      var fsc = 0;
      if (direct || carrier) { fsc = Math.round(miles * Math.max(0, (state.fuelPrice - 1.25) / 6)); }
      var linehaul = allIn - fsc;

      var mpd = s.ops.milesPerDay;
      var pickupDay = state.day + (deadhead > mpd * 0.6 ? 1 : 0);
      var driveDays = (deadhead + miles) / mpd * 7 / 6; // includes the weekly 34-hour reset
      var slack = TM.pick(state, [0.2, 0.6, 1, 1, 1.5, 2]);
      var deliverBy = state.day + Math.ceil(driveDays + slack);
      var weight = TM.randInt(state, 14, 44) * 1000;
      var risks = [];
      if (slack < 0.5) risks.push('Tight deadline');
      if (payer.credit < 75) risks.push('Low-credit payer');
      if (payer.days >= 40) risks.push('Slow pay (' + payer.days + ' days)');
      if (weight > 42000) risks.push('Heavy (near max gross)');
      if (dest.out < 0.85) risks.push('Weak reload market at destination');
      if ((month <= 1 || month === 11) && dest.lat > 39) risks.push('Winter weather');
      if (TM.chance(state, 0.08)) risks.push('High cargo-theft area');
      loads.push({
        id: TM.uid(state, 'L'), origin: cityId, pickup: pickup.id, dest: dest.id, deadhead: deadhead, miles: miles,
        linehaul: linehaul, fsc: fsc, total: linehaul + fsc, rpm: TM.round2((linehaul + fsc) / miles),
        payerId: payer.id, payerName: payer.name, credit: payer.credit, payDays: payer.days, direct: direct,
        pickupDay: pickupDay, deliverBy: deliverBy, slack: slack, weight: weight, trailer: trailerType,
        commodity: TM.pick(state, TM.COMMODITIES[trailerType] || TM.COMMODITIES.dry_van), risks: risks
      });
    }
    return loads;
  }

  /* ---------- load economics ---------- */
  TM.ageFactor = function (t) { return 1 + Math.max(0, t.ageYears) * 0.06 + Math.max(0, 75 - t.condition) / 100; };

  // Variable cost per mile for a truck, excluding diesel (itemized).
  TM.variableCpm = function (state, t) {
    var ctx = TM.context(state), s = state.settings, items = [];
    state.expenses.forEach(function (e) {
      if (!TM.applies(e, ctx, t) || e.k === 'reserve' || e.k === 'info') return;
      if (e.f === 'per_mile') items.push({ id: e.id, name: e.name, cpm: e.a * (e.id === 'repairs_general' ? TM.ageFactor(t) : 1) * (e.loadedOnly ? 1 - s.ops.planDeadheadPct / 100 : 1) });
      if (e.f === 'interval' && e.every) items.push({ id: e.id, name: e.name, cpm: e.a / e.every });
    });
    var defCpm = s.fuel.defPct * s.fuel.defPrice / t.mpg;
    items.push({ id: 'def', name: 'DEF', cpm: defCpm });
    var fc = TM.exp(state, 'fuelcard_fee');
    if (fc && fc.on) items.push({ id: 'fuelcard_fee', name: fc.name, cpm: fc.a / s.fuel.galsPerStop / t.mpg });
    var d = TM.driverOf(state, t);
    if (d && d.type === 'hired') {
      var taxes = TM.amt(state, 'payroll_fica') + 0.01;
      items.push({ id: 'driver_wages', name: 'Driver pay + payroll taxes', cpm: d.cpm * (1 + taxes) });
    } else if (s.comp.mode === 'guaranteed' && s.comp.driverGpCpm > 0) {
      items.push({ id: 'partner_gp', name: 'Partner-driver guaranteed pay', cpm: s.comp.driverGpCpm });
    }
    return items;
  };

  TM.estimateLoad = function (state, t, load) {
    var s = state.settings;
    var allMiles = load.deadhead + load.miles;
    var pickupSt = TM.cityById(load.pickup).state, destSt = TM.cityById(load.dest).state;
    var price = Math.min(TM.fuelPriceAt(state, pickupSt), TM.fuelPriceAt(state, destSt));
    var fuel = allMiles / t.mpg * price;
    if (t.trailer.type === 'reefer') fuel += load.miles * TM.amt(state, 'reefer_fuel', t) * price;
    var varItems = TM.variableCpm(state, t);
    var variable = varItems.reduce(function (a, i) { return a + i.cpm * allMiles; }, 0);
    state.expenses.forEach(function (e) { if (e.f === 'per_load' && TM.applies(e, TM.context(state), t) && e.k === 'expense') variable += e.a; });
    var gross = load.total, deductions = 0;
    if (s.authority === 'carrier') deductions += load.linehaul * s.carrier.pct / 100;
    if (state.dispatcher) deductions += gross * s.ops.dispatcherPct / 100;
    if (s.ops.factoring && s.authority === 'own') deductions += gross * s.ops.factoringPct / 100;
    var days = Math.max(1, Math.ceil(allMiles / s.ops.milesPerDay));
    var fixedPerDay = TM.fixedMonthlyPerTruck ? TM.fixedMonthlyPerTruck(state) / 30 : 0;
    // expected loss from a payer that never pays (non-recourse factoring and carrier settlements remove this risk)
    var risk = 0;
    if (load.payerId !== 'carrier' && !(s.ops.factoring && s.authority === 'own')) {
      risk = gross * (load.credit < 50 ? 0.10 : (100 - load.credit) / 100 * 0.02) * s.difficulty;
    }
    deductions += risk;
    var contribution = gross - deductions - fuel - variable;
    var net = contribution - fixedPerDay * days;
    return {
      gross: gross, deductions: deductions, risk: risk, fuel: fuel, variable: variable, contribution: contribution, days: days,
      fixed: fixedPerDay * days, net: net, perTotalMile: gross / allMiles, perDay: net / days, fuelPrice: price
    };
  };

  /* ---------- dispatch ---------- */
  TM.dispatch = function (state, truckId, loadId) {
    var t = state.trucks.filter(function (x) { return x.id === truckId; })[0];
    if (!t || t.status !== 'idle') return { ok: false, reason: 'Truck is not available.' };
    if (!t.driverId) return { ok: false, reason: 'This truck has no driver. Hire one in Fleet.' };
    var board = TM.boardFor(state, t), load = null;
    for (var i = 0; i < board.length; i++) if (board[i].id === loadId) { load = board.splice(i, 1)[0]; break; }
    if (!load) return { ok: false, reason: 'Load no longer available.' };
    load.est = TM.estimateLoad(state, t, load);
    startTrip(state, t, load, load.deadhead, load.miles, load.pickup, load.dest);
    TM.log(state, 'info', t.name + ' dispatched', TM.cityById(load.pickup).name + ' → ' + TM.cityById(load.dest).name + ', ' + load.miles + ' loaded + ' + load.deadhead + ' empty miles for ' + TM.money(load.total) + ' (' + load.payerName + '). Deliver by ' + TM.fmtDate(state, load.deliverBy) + '.');
    return { ok: true };
  };

  TM.reposition = function (state, truckId, cityId) {
    var t = state.trucks.filter(function (x) { return x.id === truckId; })[0];
    if (!t || t.status !== 'idle' || !t.driverId || cityId === t.city) return { ok: false, reason: 'Cannot reposition.' };
    var miles = TM.distance(t.city, cityId);
    startTrip(state, t, null, miles, 0, t.city, cityId);
    TM.log(state, 'info', t.name + ' deadheading', 'Driving ' + miles + ' empty miles to ' + TM.cityById(cityId).name + ' for better freight. Empty miles burn fuel and earn nothing.');
    return { ok: true };
  };

  function startTrip(state, t, load, dead, loaded, pickupId, destId) {
    var originSt = TM.cityById(t.city).state, pSt = TM.cityById(pickupId).state, dSt = TM.cityById(destId).state;
    var fuelSt = [originSt, pSt, dSt].sort(function (a, b) { return (TM.STATES[a] || {}).dieselOffset - (TM.STATES[b] || {}).dieselOffset; })[0];
    t.status = 'enroute';
    t.trip = { load: load, deadLeft: dead, loadedLeft: loaded, delay: 0, startDay: state.day, originSt: originSt, pickupSt: pSt, destSt: dSt, fuelSt: fuelSt, dest: destId, loadedDone: 0 };
  }

  /* ---------- a truck's day ---------- */
  TM.truckDay = function (state, t) {
    var s = state.settings, d = TM.driverOf(state, t);
    if (d && t.status !== 'shop') {
      // idle/sleeper fuel
      var idleGal = s.fuel.idleGalPerDay;
      if (idleGal > 0) {
        var p = TM.fuelPriceAt(state, TM.cityById(t.city).state);
        TM.expense(state, 'idle_fuel', idleGal * p, 'Idle fuel — ' + t.name, { truckId: t.id });
      }
    }
    if (t.status === 'shop') {
      t.shopDays--;
      if (d && d.type === 'hired') {
        var lp = TM.amt(state, 'layover_pay');
        if (lp) accrueWages(state, d, lp, 'Layover pay — ' + d.name);
      }
      if (t.shopDays <= 0) {
        t.status = t.trip ? 'enroute' : 'idle';
        TM.log(state, 'info', t.name + ' back on the road', 'Repairs complete.');
      }
      return;
    }
    if (t.status !== 'enroute' || !d) return;
    d.daysSinceReset = (d.daysSinceReset || 0) + 1;
    if (d.daysSinceReset >= 7) { d.daysSinceReset = 0; return; } // 34-hour reset

    var trip = t.trip, cap = s.ops.milesPerDay;
    if (trip.delay > 0) { var use = Math.min(1, trip.delay); cap *= 1 - use; trip.delay = TM.round2(trip.delay - use); }
    var dead = Math.min(trip.deadLeft, cap);
    var loaded = Math.min(trip.loadedLeft, cap - dead);
    dead = Math.round(dead); loaded = Math.round(loaded);
    if (dead + loaded > 0) chargeMiles(state, t, d, dead, loaded);
    trip.deadLeft -= dead; trip.loadedLeft -= loaded; trip.loadedDone += loaded;
    if (TM.tripEvents && dead + loaded > 0) TM.tripEvents(state, t, dead + loaded);
    if (t.status === 'enroute' && trip.deadLeft <= 0 && trip.loadedLeft <= 0) {
      if (trip.load) deliver(state, t);
      else { t.city = trip.dest; t.status = 'idle'; t.trip = null; TM.log(state, 'info', t.name + ' arrived', 'Now empty in ' + TM.cityById(t.city).name + '.'); }
      TM.refreshBoards(state);
    }
  };

  function accrueWages(state, d, amount, desc) {
    TM.post(state, { id: 'driver_wages', desc: desc, accrued: amount, pnl: -amount });
    state.accruals.wages[d.id] = TM.round2((state.accruals.wages[d.id] || 0) + amount);
  }

  function chargeMiles(state, t, d, dead, loaded) {
    var s = state.settings, trip = t.trip, miles = dead + loaded, ctx = TM.context(state);
    var price = TM.fuelPriceAt(state, trip.fuelSt);
    var gal = miles / t.mpg;
    TM.expense(state, 'diesel', gal * price, 'Diesel ' + gal.toFixed(0) + ' gal @ $' + price.toFixed(2) + ' (' + trip.fuelSt + ') — ' + t.name, { truckId: t.id });
    // IFTA bookkeeping: tax owed where miles are driven vs. tax paid where fuel is bought
    var rate = function (st) { return (TM.STATES[st] || { fuelTax: 0.3 }).fuelTax; };
    state.ifta.owed += (dead / t.mpg) * rate(trip.originSt) + (loaded / 2 / t.mpg) * (rate(trip.pickupSt) + rate(trip.destSt));
    state.ifta.paid += gal * rate(trip.fuelSt);
    TM.expense(state, 'def', gal * s.fuel.defPct * s.fuel.defPrice, 'DEF — ' + t.name, { truckId: t.id });
    var fc = TM.exp(state, 'fuelcard_fee');
    if (fc && fc.on) {
      t.fuelStops = (t.fuelStops || 0) + gal / s.fuel.galsPerStop;
      var stops = Math.floor(t.fuelStops);
      if (stops > 0) { t.fuelStops -= stops; TM.expense(state, 'fuelcard_fee', stops * fc.a, 'Fuel-card fees — ' + t.name, { truckId: t.id }); }
    }
    if (loaded && t.trailer.type === 'reefer') {
      var rg = loaded * TM.amt(state, 'reefer_fuel', t);
      TM.expense(state, 'reefer_fuel', rg * price, 'Reefer fuel — ' + t.name, { truckId: t.id });
    }
    state.expenses.forEach(function (e) {
      if (!TM.applies(e, ctx, t)) return;
      if (e.f === 'per_mile') {
        if (e.s === 'trailer' && (!t.trailer || t.trailer.acq === 'none')) return;
        var m = e.loadedOnly ? loaded : miles;
        var amt = e.a * m * (e.id === 'repairs_general' ? TM.ageFactor(t) : 1);
        if (e.k === 'reserve') { state.reserves.maint = TM.round2(state.reserves.maint + amt); return; }
        // smooth per-mile wear is paid as you go; the reserve is kept for lumpy repairs
        TM.expense(state, e.id, amt, e.name + ' — ' + t.name, { truckId: t.id });
      } else if (e.f === 'interval' && e.every) {
        t.intervals[e.id] = (t.intervals[e.id] || 0) + miles;
        if (t.intervals[e.id] >= e.every) {
          t.intervals[e.id] -= e.every;
          TM.expense(state, e.id, e.a, e.name + ' — ' + t.name + ' @ ' + Math.round(t.odometer).toLocaleString() + ' mi', { truckId: t.id });
          TM.useMaintReserve(state, e.a);
          if (e.id === 'pm_service') t.condition = Math.min(100, t.condition + 3);
          if (e.id === 'tires_truck') { t.condition = Math.min(100, t.condition + 2); TM.log(state, 'info', 'New tires — ' + t.name, TM.money(e.a) + ' for a full set. Lumpy costs like this are why a maintenance reserve matters.', { lesson: 'reserves' }); }
        }
      }
    });
    if (d.type === 'hired') accrueWages(state, d, d.cpm * miles, 'Driver pay ' + miles + ' mi — ' + d.name);
    else if (s.comp.mode === 'guaranteed' && s.comp.driverGpCpm > 0) {
      var gp = TM.round2(s.comp.driverGpCpm * miles);
      TM.post(state, { id: 'partner_gp', desc: 'Guaranteed payment ' + miles + ' mi — ' + d.name, accrued: gp, pnl: -gp });
      state.accruals.gp[d.partnerId] = TM.round2((state.accruals.gp[d.partnerId] || 0) + gp);
    }
    t.condition = Math.max(20, TM.round2(t.condition - miles * 0.0004));
    t.odometer += miles; t.milesDriven += miles;
    state.stats.miles += miles; state.stats.loadedMiles += loaded;
    var m = state.agg[TM.monthKey(state)];
    if (m) { m.miles += miles; m.loaded += loaded; }
  }

  /* ---------- delivery & invoicing ---------- */
  function deliver(state, t) {
    var s = state.settings, load = t.trip.load, d = TM.driverOf(state, t), lines = [];
    var invoice = 0;
    function rev(id, amt, desc) { if (!amt) return; TM.post(state, { id: id, desc: desc, ar: amt, pnl: amt, truckId: t.id }); invoice += amt; }
    rev('rev_linehaul', load.linehaul, 'Linehaul ' + TM.cityById(load.pickup).name + ' → ' + TM.cityById(load.dest).name);
    rev('rev_fsc', load.fsc, 'Fuel surcharge — ' + load.payerName);
    if (s.authority === 'carrier' && load.fsc === 0) lines.push('Carrier keeps ' + s.carrier.pct + '% of linehaul.');

    if (TM.chance(state, 0.22)) {
      var hrs = TM.randInt(state, 1, 5);
      rev('rev_detention', hrs * 50, 'Detention ' + hrs + ' h @ $50 — ' + load.payerName);
      if (d && d.type === 'hired') { var dp = TM.amt(state, 'detention_pay'); if (dp) accrueWages(state, d, dp * hrs, 'Detention pay — ' + d.name); }
      lines.push('Waited ' + (hrs + 2) + ' hours at the dock (2 free) — billed ' + TM.money(hrs * 50) + ' detention.');
    }
    var lumperExp = TM.exp(state, 'lumper');
    if (lumperExp && TM.applies(lumperExp, TM.context(state), t) && TM.chance(state, 0.3)) {
      var lump = TM.round2(lumperExp.a * TM.randRange(state, 0.6, 1.4));
      if (TM.chance(state, 0.1)) {
        TM.expense(state, 'lumper', lump, 'Lumper fee — receipt lost, not reimbursed', { truckId: t.id });
        lines.push('Paid a ' + TM.money(lump) + ' lumper but lost the receipt — not reimbursable.');
      } else {
        TM.post(state, { id: 'lumper', desc: 'Lumper paid — billed back to ' + load.payerName, cash: -lump, ar: lump, cf: 'op' });
        invoice += lump;
        lines.push('Paid a ' + TM.money(lump) + ' lumper; added to the invoice (pass-through, no profit impact).');
      }
    }
    var late = state.day - load.deliverBy;
    if (late > 0) {
      var pen = TM.round2(load.linehaul * (TM.amt(state, 'late_penalty') || 0));
      if (pen) { TM.post(state, { id: 'late_penalty', desc: 'Late delivery penalty (' + late + ' day' + (late > 1 ? 's' : '') + ')', ar: -pen, pnl: -pen }); invoice -= pen; }
      state.stats.late++;
      lines.push('Delivered ' + late + ' day(s) late — ' + TM.money(pen) + ' deducted.');
    }
    if (s.authority === 'carrier') {
      var cut = TM.round2(load.linehaul * s.carrier.pct / 100);
      TM.post(state, { id: 'carrier_pct', desc: 'Carrier ' + s.carrier.pct + '% — ' + TM.cityById(load.dest).name + ' load', ar: -cut, pnl: -cut });
      invoice -= cut;
    }
    if (state.dispatcher && s.ops.dispatcherPct > 0) {
      TM.expense(state, 'dispatch_fee', load.total * s.ops.dispatcherPct / 100, 'Dispatcher ' + s.ops.dispatcherPct + '% — load ' + load.id);
    }
    state.expenses.forEach(function (e) {
      if (e.f === 'per_load' && e.k === 'expense' && TM.applies(e, TM.context(state), t)) TM.expense(state, e.id, e.a, e.name + ' — ' + t.name, { truckId: t.id });
    });
    if (TM.deliveryEvents) TM.deliveryEvents(state, t, load, lines);

    invoice = TM.round2(invoice);
    var ar = {
      id: TM.uid(state, 'inv'), loadId: load.id, payerId: load.payerId, payerName: load.payerName, credit: load.credit,
      amount: invoice, invoiceDay: state.day, dueDay: state.day + load.payDays, status: 'open', truckId: t.id
    };
    state.ar.push(ar);
    if (s.ops.factoring && s.authority === 'own') TM.factorInvoice(state, ar.id, s.ops.factoringPct, true);

    t.revenue += load.total;
    state.stats.loads++; state.stats.revenue += load.total;
    var mm = state.agg[TM.monthKey(state)]; if (mm) mm.loads++;
    state.completed.unshift({
      id: load.id, truck: t.name, pickup: load.pickup, dest: load.dest, miles: load.miles, deadhead: load.deadhead,
      total: load.total, payer: load.payerName, day: state.day, startDay: t.trip.startDay, late: late > 0 ? late : 0,
      estNet: load.est ? load.est.net : null, invoice: invoice
    });
    if (state.completed.length > 200) state.completed.length = 200;
    t.city = load.dest; t.status = 'idle'; t.trip = null;
    TM.log(state, late > 0 ? 'warn' : 'good', 'Delivered in ' + TM.cityById(load.dest).name + ' — ' + t.name,
      'Invoiced ' + TM.money(invoice) + ' to ' + load.payerName + (ar.status === 'factored' ? ' (factored — cash now).' : ', due ' + TM.fmtDate(state, ar.dueDay) + '.') + (lines.length ? ' ' + lines.join(' ') : ''));
  }

  /* ---------- receivables ---------- */
  TM.factorInvoice = function (state, arId, pct, auto) {
    var ar = state.ar.filter(function (a) { return a.id === arId; })[0];
    if (!ar || ar.status !== 'open') return false;
    var p = pct || state.settings.ops.factoringPct + 1;
    var fee = TM.round2(ar.amount * p / 100);
    TM.post(state, { id: 'factoring_fee', desc: (auto ? 'Factored' : 'Spot-factored') + ' invoice ' + ar.id + ' (' + p + '% fee)', cash: ar.amount - fee, ar: -ar.amount, pnl: -fee, cf: 'op' });
    ar.status = 'factored'; ar.paidDay = state.day;
    return true;
  };

  TM.quickPay = function (state, arId) {
    var ar = state.ar.filter(function (a) { return a.id === arId; })[0];
    if (!ar || ar.status !== 'open') return false;
    var b = TM.BROKERS.filter(function (x) { return x.id === ar.payerId; })[0];
    if (!b) return false;
    var fee = TM.round2(ar.amount * b.quickPay);
    TM.post(state, { id: 'quickpay_fee', desc: 'Quick pay from ' + b.name + ' (' + (b.quickPay * 100).toFixed(1) + '%)', cash: ar.amount - fee, ar: -ar.amount, pnl: -fee, cf: 'op' });
    ar.status = 'paid'; ar.paidDay = state.day;
    TM.log(state, 'info', 'Quick pay received', TM.money(ar.amount - fee) + ' from ' + b.name + ' — a ' + TM.money(fee) + ' fee to get paid now instead of in ' + Math.max(0, ar.dueDay - state.day) + ' days.');
    return true;
  };

  TM.collectReceivables = function (state) {
    state.ar.forEach(function (ar) {
      if (ar.status !== 'open' && ar.status !== 'disputed') return;
      if (state.day < ar.dueDay) return;
      if (ar.status === 'disputed') {
        TM.post(state, { id: 'bad_debt', desc: 'Written off — ' + ar.payerName + ' never paid', ar: -ar.amount, pnl: -ar.amount });
        ar.status = 'bad'; state.stats.badDebt += ar.amount;
        TM.log(state, 'bad', 'Bad debt: ' + TM.money(ar.amount), ar.payerName + ' went out of business without paying. Check broker credit before booking — or use non-recourse factoring.', { lesson: 'credit' });
        return;
      }
      if (!ar.checked && ar.payerId !== 'carrier') {
        ar.checked = true;
        var diff = state.settings.difficulty;
        var bad = (ar.credit < 50 ? 0.10 : (100 - ar.credit) / 100 * 0.02) * diff;
        if (TM.chance(state, bad)) {
          ar.status = 'disputed'; ar.dueDay = state.day + 30;
          TM.log(state, 'bad', ar.payerName + ' is not paying', 'Invoice ' + TM.money(ar.amount) + ' is past due and the broker is not answering. You may never collect it.', { lesson: 'credit' });
          return;
        }
        if (TM.chance(state, (100 - ar.credit) / 100 * 0.9 * diff)) {
          var b = TM.BROKERS.concat(TM.DIRECT_SHIPPERS).filter(function (x) { return x.id === ar.payerId; })[0];
          var extra = TM.randInt(state, 5, Math.max(6, b ? b.spread : 10));
          ar.dueDay = state.day + extra; ar.late = (ar.late || 0) + extra;
          TM.log(state, 'warn', 'Late payment', ar.payerName + ' pushed payment of ' + TM.money(ar.amount) + ' by ' + extra + ' days. Profit on paper does not pay the fuel bill.', { lesson: 'profit-vs-cash' });
          return;
        }
      }
      TM.post(state, { id: 'ar_collect', desc: 'Payment received — ' + ar.payerName, cash: ar.amount, ar: -ar.amount, cf: 'op' });
      ar.status = 'paid'; ar.paidDay = state.day;
    });
    if (state.ar.length > 400) state.ar = state.ar.filter(function (a, i) { return a.status === 'open' || a.status === 'disputed' || i > state.ar.length - 200; });
  };
})(globalThis.TM = globalThis.TM || {});
