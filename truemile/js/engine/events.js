/* TrueMile — unexpected events and decisions. Probabilities are per driving day unless noted. */
(function (TM) {
  'use strict';

  function costOf(state, id, lo, hi) {
    var e = TM.exp(state, id);
    return TM.round2((e ? e.a : 0) * TM.randRange(state, lo, hi));
  }
  function repair(state, t, id, amount, desc) {
    TM.expense(state, id, amount, desc + ' — ' + t.name, { truckId: t.id });
    TM.useMaintReserve(state, amount);
  }
  function toShop(state, t, days) { t.status = 'shop'; t.shopDays = Math.max(t.shopDays || 0, days); }

  TM.tripEvents = function (state, t, miles) {
    var s = state.settings, diff = s.difficulty, frac = Math.min(1, miles / s.ops.milesPerDay);
    var cf = 1 + (100 - t.condition) / 30;
    var month = TM.dateOf(state).getUTCMonth(), winter = month <= 1 || month === 11;
    var p = function (x) { return TM.chance(state, x * frac * diff); };

    if (p(0.005)) {
      var c = costOf(state, 'ev_tire', 0.7, 1.3);
      repair(state, t, 'ev_tire', c, 'Tire blowout — road service');
      t.trip.delay += 0.3;
      TM.log(state, 'bad', 'Tire failure — ' + t.name, 'Road service and a new tire cost ' + TM.money(c) + ', plus a few hours lost.');
      return;
    }
    if (p(0.004 * cf)) {
      var mc = costOf(state, 'ev_minor', 0.4, 1.8), tow = TM.chance(state, 0.3) ? costOf(state, 'ev_tow', 0.6, 1.4) : 0;
      repair(state, t, 'ev_minor', mc, 'Breakdown repair');
      if (tow) TM.expense(state, 'ev_tow', tow, 'Tow — ' + t.name, { truckId: t.id });
      toShop(state, t, 1);
      state.stats.breakdowns++;
      TM.log(state, 'bad', 'Breakdown — ' + t.name, 'Repair ' + TM.money(mc) + (tow ? ' + tow ' + TM.money(tow) : '') + '. One day in the shop. Older trucks in poor condition break more often.', { lesson: 'reserves' });
      return;
    }
    if (p(0.0007 * cf * (1 + t.ageYears * 0.05))) {
      var big = costOf(state, 'ev_major', 0.5, 1.6);
      var opts = [
        { id: 'dealer', label: 'Dealer repair now', desc: TM.money(big) + ', 4 days down.' },
        { id: 'independent', label: 'Independent shop', desc: TM.money(big * 0.7) + ', 7 days down, 25% chance of a comeback repair.' }
      ];
      if (t.warranty) opts.unshift({ id: 'warranty', label: 'Use extended warranty', desc: 'Pay the ' + TM.money(TM.amt(state, 'warranty_deductible')) + ' deductible, 5 days down.' });
      state.pending.push({ id: TM.uid(state, 'dec'), type: 'major', truckId: t.id, cost: big, title: 'Major breakdown — ' + t.name,
        text: 'The engine lost power near ' + TM.cityById(t.trip.dest).name + ' bound. Diagnosis: turbo/EGR failure. ' + (t.trip.load ? 'The load is still on the trailer and the delivery clock is running.' : ''),
        options: opts });
      state.stats.breakdowns++;
      return;
    }
    if (p(0.0005)) {
      var dmg = TM.round2(TM.randRange(state, 4000, 15000));
      var ded = TM.amt(state, 'accident_deductible') || 2500;
      state.pending.push({ id: TM.uid(state, 'dec'), type: 'accident', truckId: t.id, cost: dmg, title: 'Accident — ' + t.name,
        text: 'A car merged into the truck at low speed. Nobody was hurt, but the truck needs ' + TM.money(dmg) + ' of body and front-end work.',
        options: [
          { id: 'claim', label: 'File an insurance claim', desc: 'Pay the ' + TM.money(ded) + ' deductible. Premiums rise ~15% now and at renewal.' },
          { id: 'pocket', label: 'Pay out of pocket', desc: 'Pay ' + TM.money(dmg) + ' cash, keep a clean claims history.' }
        ] });
      return;
    }
    if (p(0.012)) {
      if (TM.chance(state, Math.max(0, (75 - t.condition) / 50))) {
        var fine = costOf(state, 'fines', 0.5, 2);
        TM.expense(state, 'fines', fine, 'Roadside inspection violation — ' + t.name, { truckId: t.id });
        if (t.condition < 45) { toShop(state, t, 1); }
        TM.log(state, 'bad', 'Failed roadside inspection', 'Violations (brakes/lights) cost ' + TM.money(fine) + (t.condition < 45 ? ' and an out-of-service order until repaired' : '') + '. Violations also hurt your CSA safety scores and insurance rates.');
      } else TM.log(state, 'good', 'Clean roadside inspection', 'A clean Level 1 inspection helps your safety record.');
      return;
    }
    if (p(winter ? 0.07 : 0.02)) {
      var dl = TM.round2(TM.randRange(state, 0.4, 1));
      t.trip.delay += dl;
      TM.log(state, 'warn', 'Weather/traffic delay — ' + t.name, 'Lost about ' + Math.round(dl * 11) + ' driving hours. Watch the delivery deadline.');
      return;
    }
    if (p(0.0008)) {
      var ft = costOf(state, 'fuel_theft', 0.5, 1.5);
      TM.expense(state, 'fuel_theft', ft, 'Fuel theft / card skimming — ' + t.name, { truckId: t.id });
      TM.log(state, 'bad', 'Fuel theft', 'Someone siphoned fuel or skimmed the fuel card: ' + TM.money(ft) + ' lost.');
      return;
    }
    if (t.trailer.type === 'reefer' && p(0.002)) {
      var rc = costOf(state, 'reefer_repair', 0.4, 1.4);
      TM.expense(state, 'reefer_repair', rc, 'Reefer unit repair — ' + t.name, { truckId: t.id });
      t.trip.delay += 0.5;
      TM.log(state, 'bad', 'Reefer unit failure', 'Emergency reefer repair: ' + TM.money(rc) + '.');
    }
  };

  TM.deliveryEvents = function (state, t, load, lines) {
    var claimP = (t.trailer.type === 'reefer' ? 0.015 : 0.008) * state.settings.difficulty;
    if (load.risks.indexOf('High cargo-theft area') >= 0) claimP *= 2;
    if (TM.chance(state, claimP)) {
      var claim = TM.round2(TM.amt(state, 'cargo_claim') * TM.randRange(state, 0.3, 2));
      var ded = TM.amt(state, 'cargo_deductible') || 1000;
      var pay = Math.min(claim, ded);
      TM.expense(state, 'cargo_claim', pay, 'Cargo claim deductible (' + TM.money(claim) + ' claim) — ' + t.name, { truckId: t.id });
      state.stats.claims++; state.ins.claimsThisYear++;
      lines.push('Receiver reported ' + TM.money(claim) + ' of damaged freight — cargo insurance paid it, you paid the ' + TM.money(pay) + ' deductible.');
    }
  };

  TM.companyEvents = function (state) {
    var diff = state.settings.difficulty;
    if (TM.chance(state, 0.08 / 30 * diff)) {
      var reasons = ['State audit of IRP mileage records', 'Replacement ELD tablet', 'Late-filed form penalty', 'Toll violation notices by mail', 'Broker chargeback for a pallet shortage', 'Parking ticket batch from a city lot'];
      var amt = TM.round2((TM.amt(state, 'ev_unexpected') || 500) * TM.randRange(state, 0.4, 2));
      TM.expense(state, 'ev_unexpected', amt, TM.pick(state, reasons));
      TM.log(state, 'bad', 'Unexpected bill', state.ledger[state.ledger.length - 1].desc + ': ' + TM.money(amt) + '. This is what the contingency reserve is for.', { lesson: 'reserves' });
    }
    state.drivers.forEach(function (d) {
      if (d.type !== 'hired' || !d.truckId) return;
      var t = state.trucks.filter(function (x) { return x.id === d.truckId; })[0];
      if (!t || t.status !== 'idle') return;
      if (state.pending.some(function (p) { return p.type === 'quit'; })) return;
      if (TM.chance(state, 0.05 / 30 * diff)) {
        var opts = [
          { id: 'hire', label: 'Hire a replacement', desc: 'Onboarding costs again and 4 idle days while recruiting.' },
          { id: 'park', label: 'Park the truck', desc: 'No driver — the truck earns nothing but the note, insurance and plates keep coming.' }
        ];
        var free = state.settings.partners.filter(function (p) { return !state.drivers.some(function (x) { return x.partnerId === p.id && x.truckId; }); });
        if (free.length) opts.splice(1, 0, { id: 'partner:' + free[0].id, label: free[0].name + ' drives', desc: 'A partner takes the wheel — no wages, but no one is managing full-time.' });
        state.pending.push({ id: TM.uid(state, 'dec'), type: 'quit', truckId: t.id, driverId: d.id, title: d.name + ' quit',
          text: d.name + ' took a job at a mega-carrier for a sign-on bonus. Driver turnover is one of the biggest hidden costs in trucking.', options: opts });
      }
    });
  };

  TM.resolveDecision = function (state, decId, optId) {
    var i = -1;
    state.pending.forEach(function (p, k) { if (p.id === decId) i = k; });
    if (i < 0) return false;
    var dec = state.pending.splice(i, 1)[0];
    var t = state.trucks.filter(function (x) { return x.id === dec.truckId; })[0];
    if (dec.type === 'major') {
      if (optId === 'warranty') {
        var ded = TM.amt(state, 'warranty_deductible');
        repair(state, t, 'ev_major', ded, 'Major repair — warranty deductible');
        toShop(state, t, 5);
        TM.log(state, 'good', 'Warranty paid off', 'The warranty covered a ' + TM.money(dec.cost) + ' repair; you paid ' + TM.money(ded) + '.');
      } else if (optId === 'independent') {
        repair(state, t, 'ev_major', dec.cost * 0.7, 'Major repair (independent shop)');
        toShop(state, t, 7);
        if (TM.chance(state, 0.25)) { repair(state, t, 'ev_minor', dec.cost * 0.25, 'Comeback repair'); TM.log(state, 'bad', 'Comeback repair', 'The fix did not hold — another ' + TM.money(dec.cost * 0.25) + '.'); }
      } else {
        repair(state, t, 'ev_major', dec.cost, 'Major repair (dealer)');
        toShop(state, t, 4);
      }
      t.condition = Math.min(100, t.condition + 10);
      TM.log(state, 'bad', 'Major repair — ' + t.name, 'Truck in the shop. Fixed costs continue every day it is down.', { lesson: 'reserves' });
    } else if (dec.type === 'accident') {
      if (optId === 'claim') {
        var d2 = TM.amt(state, 'accident_deductible') || 2500;
        TM.expense(state, 'accident_deductible', d2, 'Accident claim deductible — ' + t.name, { truckId: t.id });
        state.ins.mult = TM.round2(state.ins.mult * 1.15);
        state.ins.claimsThisYear++; state.stats.claims++;
      } else {
        TM.expense(state, 'ev_minor', dec.cost, 'Accident repair paid out of pocket — ' + t.name, { truckId: t.id });
      }
      toShop(state, t, 5);
    } else if (dec.type === 'quit') {
      var d = state.drivers.filter(function (x) { return x.id === dec.driverId; })[0];
      if (d) { d.truckId = null; d.left = true; }
      state.drivers = state.drivers.filter(function (x) { return x !== d; });
      t.driverId = null;
      if (optId === 'hire') { TM.hireDriver(state, t); toShop(state, t, 4); t.recruiting = true; }
      else if (optId.indexOf('partner:') === 0) TM.assignPartnerDriver(state, optId.split(':')[1], t);
      else TM.log(state, 'warn', t.name + ' parked', 'Hire a driver from the Fleet page when you are ready.');
    }
    return true;
  };
})(globalThis.TM = globalThis.TM || {});
