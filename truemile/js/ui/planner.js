/* TrueMile views: setup & startup planner, expense database editor, scenario comparisons. */
(function (TM) {
  'use strict';
  var UI = TM.UI, esc = UI.esc, m = UI.m, V = UI.views;

  function num(path, label, val, step, help) {
    return '<label class="field">' + esc(label) + '<input type="number" step="' + (step || 1) + '" data-draft="' + path + '" value="' + esc(val) + '">' + (help ? '<span class="muted">' + esc(help) + '</span>' : '') + '</label>';
  }
  function sel(path, label, val, opts) {
    return '<label class="field">' + esc(label) + '<select data-draft="' + path + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>';
  }
  function chk(path, label, val) {
    return '<label class="field inline"><input type="checkbox" data-draft="' + path + '"' + (val ? ' checked' : '') + '> ' + esc(label) + '</label>';
  }

  /* ---------------- setup ---------------- */
  V.setup = function (state, app) {
    var d = app.draft, h = '';
    if (!state) h += '<div class="callout info"><b>Plan your trucking company.</b> Every number below is an editable example. The Startup Planner at the bottom shows what it costs to open the doors and whether your capital is enough. Then press <b>Start simulation</b>.</div>';
    else h += '<div class="callout warn">Changes here apply to a <b>new</b> simulation. Your current game keeps running until you press Start. Expense edits are on the Expenses tab.</div>';

    h += '<div class="grid g2"><div class="card"><h3>1 · Company & partners</h3><div class="form-grid">' +
      '<label class="field">Company<input data-draft="company" value="' + esc(d.company) + '"></label>' +
      '<label class="field">Start date<input type="date" data-draft="startDate" value="' + esc(d.startDate) + '"></label>' +
      sel('homeCity', 'Home base', d.homeCity || 'DAL', TM.CITIES.map(function (c) { return [c.id, c.name + ', ' + c.state]; })) + '</div>' +
      '<div class="table-wrap" style="margin-top:10px"><table><tr><th>Partner</th><th>Own %</th><th>Capital $</th><th>Drives</th><th></th></tr>' +
      d.partners.map(function (p, i) {
        return '<tr><td><input data-draft="partners.' + i + '.name" value="' + esc(p.name) + '"></td><td><input type="number" data-draft="partners.' + i + '.pct" value="' + p.pct + '" style="width:70px"></td>' +
          '<td><input type="number" data-draft="partners.' + i + '.capital" value="' + p.capital + '" style="width:100px"></td><td><input type="checkbox" data-draft="partners.' + i + '.drives"' + (p.drives ? ' checked' : '') + '></td>' +
          '<td>' + (d.partners.length > 1 ? '<button class="btn sm danger" data-action="del-partner" data-i="' + i + '">Remove</button>' : '') + '</td></tr>';
      }).join('') + '</table></div>';
    var pctSum = d.partners.reduce(function (a, p) { return a + (+p.pct || 0); }, 0);
    h += '<div class="row" style="margin-top:6px">' + (d.partners.length < 4 ? '<button class="btn sm" data-action="add-partner">Add partner</button>' : '') +
      '<span class="small ' + (pctSum === 100 ? 'muted' : 'neg') + '">Ownership totals ' + pctSum + '%' + (pctSum === 100 ? '' : ' — must be 100%') + '</span>' +
      '<span class="small muted">Capital total ' + m(d.partners.reduce(function (a, p) { return a + (+p.capital || 0); }, 0)) + '</span></div></div>';

    // business model
    h += '<div class="card"><h3>2 · Business model</h3><div class="model-pick">' + Object.keys(TM.BUSINESS_MODELS).map(function (k) {
      var bm = TM.BUSINESS_MODELS[k];
      return '<label class="' + (d.model === k ? 'sel' : '') + '"><input type="radio" name="model" data-action="pick-model" value="' + k + '"' + (d.model === k ? ' checked' : '') + '><b>' + esc(bm.short) + '</b><div class="small t2">' + esc(bm.summary) + '</div></label>';
    }).join('') + '</div>';
    var bmx = TM.BUSINESS_MODELS[d.model];
    h += '<details open><summary>How this model changes revenue and costs</summary><p class="small">' + esc(bmx.revenue) + '</p><ul class="tight small">' + bmx.costs.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></details>' +
      '<div class="form-grid">' + sel('authority', 'Operating authority', d.authority, [['own', 'Own USDOT/MC authority'], ['carrier', 'Leased onto a carrier']]) +
      (d.authority === 'carrier' ? num('carrier.pct', 'Carrier keeps % of linehaul', d.carrier.pct, 0.5) + num('carrier.settleDays', 'Settlement days', d.carrier.settleDays) + chk('carrier.insChargeback', 'Carrier charges back phys. damage / bobtail / occ-acc insurance', d.carrier.insChargeback) : '') + '</div></div></div>';

    // truck & trailer
    var t = d.truck;
    h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h3>3 · Truck & financing</h3><div class="form-grid">' +
      '<label class="field">Truck type<select data-action="pick-market">' + TM.TRUCK_MARKET.map(function (x) { return '<option value="' + x.id + '"' + (x.id === t.marketId ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label>' +
      num('truck.price', 'Price $', t.price, 500) + num('truck.mpg', 'Fuel economy (mpg)', t.mpg, 0.1) + num('truck.condition', 'Condition %', t.condition) +
      num('truck.ageYears', 'Age (years)', t.ageYears) + num('truck.odometer', 'Odometer', t.odometer, 1000) + num('truck.lifeYears', 'Depreciation life (yrs)', t.lifeYears) + num('truck.salvagePct', 'Salvage value %', t.salvagePct) +
      sel('truck.acq', 'Acquire by', t.acq, [['loan', 'Finance (loan)'], ['cash', 'Pay cash'], ['lease', 'Lease'], ['personal', 'Partner\'s personal truck (rented to LLC)']]) + '</div><div class="form-grid" style="margin-top:8px">';
    if (t.acq === 'loan' || t.acq === 'personal') {
      h += num('truck.downPct', 'Down payment %', t.downPct) + num('truck.apr', 'APR %', t.apr, 0.25) + num('truck.termMonths', 'Term (months)', t.termMonths);
      if (t.acq === 'loan') h += num('truck.balloonPct', 'Balloon % of principal', t.balloonPct);
      if (t.acq === 'personal') h += num('truck.personalRent', 'Monthly rent to partner (0 = loan payment)', t.personalRent, 10);
    }
    if (t.acq === 'lease') h += num('truck.leaseWeekly', 'Weekly lease $', t.leaseWeekly, 10) + num('truck.leaseTermMonths', 'Lease term (months)', t.leaseTermMonths) + num('truck.leaseMileAllowance', 'Annual mile allowance', t.leaseMileAllowance, 1000) + chk('truck.leaseIncludesMaint', 'Full-service lease (maintenance included)', t.leaseIncludesMaint);
    h += '</div>';
    if (t.acq === 'loan') {
      var pv = t.price * (1 - t.downPct / 100), ls = TM.loanSummary(pv, t.apr, t.termMonths, pv * t.balloonPct / 100);
      h += '<p class="small t2">Loan ' + m(pv) + ' → payment <b>' + m(ls.payment, 2) + '/mo</b>, total interest ' + m(ls.totalInterest) + '. Down payment ' + m(t.price * t.downPct / 100) + '.</p>';
    }
    h += '</div><div class="card"><h3>4 · Trailer</h3><div class="form-grid">' +
      sel('trailer.type', 'Trailer type', d.trailer.type, Object.keys(TM.TRAILER_TYPES).map(function (k) { return [k, TM.TRAILER_TYPES[k].name]; })) +
      (d.trailer.type !== 'power_only' ? sel('trailer.acq', 'Acquire by', d.trailer.acq, [['rent', 'Rent monthly'], ['lease', 'Lease'], ['cash', 'Buy for cash'], ['loan', 'Finance']]) : '') +
      (d.trailer.type !== 'power_only' && (d.trailer.acq === 'cash' || d.trailer.acq === 'loan') ? num('trailer.price', 'Trailer price $', d.trailer.price, 500) : '') +
      (d.trailer.acq === 'loan' && d.trailer.type !== 'power_only' ? num('trailer.downPct', 'Down %', d.trailer.downPct) + num('trailer.apr', 'APR %', d.trailer.apr, 0.25) + num('trailer.termMonths', 'Term (months)', d.trailer.termMonths) : '') +
      (d.trailer.type !== 'power_only' && (d.trailer.acq === 'rent' || d.trailer.acq === 'lease') ? num('trailer.rent', 'Monthly rent $', d.trailer.rent, 10) : '') +
      '</div><p class="small t2">Only expenses relevant to the trailer type are activated (e.g. reefer fuel and washouts only for reefers; tarps only for flatbeds; trailer interchange for power-only).</p></div></div>';

    // operations
    h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h3>5 · Operations & market</h3><div class="form-grid">' +
      num('ops.milesPerDay', 'Miles per driving day', d.ops.milesPerDay, 10, 'Hours-of-service limit ≈ 11 h driving') +
      num('fuel.price', 'Diesel national avg $/gal', d.fuel.price, 0.01) + num('fuel.discount', 'Fuel-card discount $/gal', d.fuel.discount, 0.01) +
      num('fuel.idleGalPerDay', 'Idle gallons / truck-day', d.fuel.idleGalPerDay, 0.5) + num('fuel.defPct', 'DEF gallons per diesel gallon', d.fuel.defPct, 0.005) + num('fuel.defPrice', 'DEF $/gal', d.fuel.defPrice, 0.1) +
      num('ops.driverCpm', 'Hired driver pay $/mile', d.ops.driverCpm, 0.01) +
      chk('ops.factoring', 'Factor all invoices', d.ops.factoring) + num('ops.factoringPct', 'Factoring fee %', d.ops.factoringPct, 0.25) +
      num('insurance.downPct', 'Insurance down payment %', d.insurance.downPct) + num('credit.limit', 'Line-of-credit limit $', d.credit.limit, 500) + num('credit.apr', 'Line-of-credit APR %', d.credit.apr, 0.5) +
      sel('difficulty', 'Bad-luck level', d.difficulty, [[0.5, 'Gentle'], [1, 'Realistic'], [1.5, 'Harsh']]) + num('seed', 'Random seed', d.seed) +
      '</div><h4 style="margin-top:12px">Planning assumptions (for projections only)</h4><div class="form-grid">' +
      num('ops.planRpm', 'Expected rate $/loaded mile', d.ops.planRpm, 0.05) + num('ops.planDeadheadPct', 'Expected deadhead %', d.ops.planDeadheadPct) + num('ops.planUtilization', 'Utilization % of driving days', d.ops.planUtilization) + '</div></div>';
    var c = d.comp;
    h += '<div class="card"><h3>6 · Paying the partners</h3><div class="form-grid">' +
      sel('comp.mode', 'Method', c.mode, [['guaranteed', 'Guaranteed payments'], ['draw', 'Fixed weekly draws'], ['profit', 'Share of monthly profit'], ['none', 'No pay (reinvest everything)']]) +
      (c.mode === 'guaranteed' ? num('comp.driverGpCpm', 'Driving partner $/mile', c.driverGpCpm, 0.01) + num('comp.mgrGpWeekly', 'Managing partner $/week', c.mgrGpWeekly, 50) : '') +
      (c.mode === 'draw' ? num('comp.drawWeekly', 'Weekly draw (total, split by %)', c.drawWeekly, 50) : '') +
      (c.mode === 'profit' ? num('comp.profitSharePct', '% of last month\'s profit', c.profitSharePct) : '') +
      num('comp.minCash', 'Minimum cash before paying partners', c.minCash, 500) + num('tax.setAsidePct', 'Quarterly tax distribution %', d.tax.setAsidePct) + '</div>' +
      '<p class="small t2">Guaranteed payments are deductible company expenses and are paid when cash allows (otherwise they are owed). Draws and profit distributions are not expenses. A partner driving unpaid flatters the profit — compare with a hired driver on the Compare tab.</p></div></div>';

    // planner
    var sc;
    try { sc = TM.scenario(d, app.expList()); } catch (err) { return h + '<div class="callout bad">Planner error: ' + esc(err.message) + '</div>'; }
    var sb = sc.startup, need = sc.need, pr = sc.proj;
    var max = Math.max.apply(null, Object.keys(sb.byCat).map(function (k) { return sb.byCat[k]; }).concat([1]));
    h += '<div class="card" style="margin-top:14px"><h3>7 · Startup planner</h3><div class="grid g2"><div>' +
      '<h4>Cash used before the first load</h4>' + TM.EXPENSE_CATEGORIES.filter(function (k) { return sb.byCat[k.id]; }).map(function (k) {
        return '<div class="bar-row"><div><div class="small">' + esc(k.name) + '</div><div class="hbar" style="width:' + (100 * sb.byCat[k.id] / max).toFixed(1) + '%"></div></div><div class="num">' + m(sb.byCat[k.id]) + '</div></div>';
      }).join('') +
      '<details><summary class="small">Itemized (' + sb.items.length + ' items)</summary><div class="table-wrap"><table>' + sb.items.map(function (i) {
        return '<tr><td class="small">' + esc(i.desc) + '</td><td class="small muted">' + esc(i.kind) + '</td><td class="num">' + m(i.amount) + '</td></tr>';
      }).join('') + '</table></div></details>' +
      '<div class="kv" style="margin-top:8px"><span>Partner capital</span><span>' + m(sb.capital) + '</span><span>Spent at startup</span><span>−' + m(sb.spent) + '</span>' +
      '<span><b>Cash on day one</b></span><span><b>' + UI.signed(sb.remaining) + '</b></span></div></div><div>' +
      '<h4>Surviving until the money comes in</h4><div class="kv">' +
      '<span>First customer cash arrives around</span><span>day ' + need.firstCashDay + '</span>' +
      '<span>Cash costs per day while waiting</span><span>' + m(need.perDay) + '</span>' +
      (need.deferredPartnerPay ? '<span class="small muted">Partner guaranteed pay deferred until cash allows</span><span class="small muted">' + m(need.deferredPartnerPay) + '/mo</span>' : '') +
      '<span>Cash needed to bridge to first payment</span><span>' + m(need.bridge) + '</span>' +
      '<span>Contingency reserve target</span><span>' + m(need.contingency) + '</span>' +
      '<span><b>Recommended cash on day one</b></span><span><b>' + m(need.recommended) + '</b></span>' +
      '<span><b>Surplus / (shortfall)</b></span><span><b>' + UI.signed(need.gap) + '</b></span></div>' +
      '<h4 style="margin-top:12px">Projected typical month</h4><div class="kv"><span>Revenue</span><span>' + m(pr.revenue) + '</span><span>Expenses</span><span>' + m(pr.expenses) + '</span>' +
      '<span>Net profit</span><span>' + UI.signed(pr.net) + '</span><span>Cash flow after principal</span><span>' + UI.signed(pr.cashFlow) + '</span>' +
      '<span>Break-even $/loaded mile</span><span>$' + pr.breakevenRpm.toFixed(2) + '</span></div></div></div>';
    if (sb.remaining < 0) h += '<div class="callout bad"><b>Underfunded:</b> startup costs exceed partner capital by ' + m(-sb.remaining) + '. You would open the doors overdrawn.</div>';
    else if (need.gap < 0) h += '<div class="callout warn"><b>Thin:</b> you can open, but cash runs out before customer payments arrive unless you factor, use quick pay, or add ' + m(-need.gap) + ' of capital or credit.</div>';
    else h += '<div class="callout good"><b>Funded:</b> capital covers startup costs plus the bridge to the first payment and a contingency reserve.</div>';
    if (need.gap < 0) h += '<p class="small"><b>Ways to close the gap:</b> add partner capital · factor invoices (cash in ~2 days) · start leased onto a carrier (weekly settlements, lower insurance) · rent the trailer instead of buying · a smaller down payment (higher payments) · open a line of credit at start.</p>';
    h += '<div class="row">' + chk('startWithCredit', 'Open the ' + m(d.credit.limit) + ' line of credit on day one', d.startWithCredit) +
      (need.gap < 0 ? '<button class="btn" data-action="fund-gap" data-amt="' + Math.ceil(-need.gap / 100) * 100 + '">Add ' + m(Math.ceil(-need.gap / 100) * 100) + ' partner capital (split by %)</button>' : '') +
      '<span class="spacer"></span><button class="btn" data-action="reset-draft">Reset to example scenario</button><button class="btn primary" data-action="start-game"' + (pctSum !== 100 ? ' disabled' : '') + '>Start simulation</button></div></div>';
    return h;
  };

  /* ---------------- expense database ---------------- */
  V.expenses = function (state, app) {
    var list = app.expList(), ctx = state ? TM.context(state) : TM.context({ settings: app.draft, trucks: [], drivers: [] });
    var f = app.expFilter || { cat: 'all', q: '', applicable: false };
    var h = '<div class="card"><h3>Expense database <span class="row"><button class="btn sm" data-action="exp-reset">Reset to defaults</button></span></h3>' +
      '<p class="small t2">' + list.length + ' items. Every amount is editable and applies ' + (state ? 'to the running simulation immediately' : 'to your plan') + '. Items are switched on only when they apply to your business model, trailer type, acquisition method and drivers — so nothing is counted twice (e.g. carrier-provided insurance, full-service lease maintenance, fuel tax already in the pump price).</p>' +
      '<div class="row"><select data-action="exp-cat"><option value="all">All categories</option>' + TM.EXPENSE_CATEGORIES.map(function (c) { return '<option value="' + c.id + '"' + (f.cat === c.id ? ' selected' : '') + '>' + c.id + ' · ' + esc(c.name) + '</option>'; }).join('') + '</select>' +
      '<input type="search" placeholder="Search…" data-action="exp-q" value="' + esc(f.q) + '" style="max-width:200px">' +
      '<label class="field inline"><input type="checkbox" data-action="exp-applicable"' + (f.applicable ? ' checked' : '') + '> Only items that apply to me</label></div></div>';
    TM.EXPENSE_CATEGORIES.forEach(function (c) {
      if (f.cat !== 'all' && f.cat !== c.id) return;
      var items = list.filter(function (e) {
        if (e.cat !== c.id) return false;
        if (f.q && (e.name + ' ' + e.desc).toLowerCase().indexOf(f.q.toLowerCase()) < 0) return false;
        if (f.applicable && !TM.applies(e, ctx)) return false;
        return true;
      });
      if (!items.length) return;
      h += '<div class="card" style="margin-top:12px"><h3>' + c.id + ' · ' + esc(c.name) + '</h3><div class="table-wrap"><table><tr><th>On</th><th>Item</th><th class="num">Amount</th><th>Timing</th><th>Per</th><th>Type</th><th>Source</th><th>Applies</th></tr>' +
        items.map(function (e) {
          var applies = TM.applies(e, ctx);
          var isPct = e.pct && (e.unit === '%' || e.unit === '% of value');
          var showAmt = e.f !== 'engine' || e.a !== 0;
          return '<tr class="' + (e.on ? '' : 'off') + '"><td><input type="checkbox" data-exp-on="' + e.id + '"' + (e.on ? ' checked' : '') + ' aria-label="Enable ' + esc(e.name) + '"></td>' +
            '<td><b>' + esc(e.name) + '</b>' + (e.desc ? '<div class="small t2">' + esc(e.desc) + '</div>' : '') + (e.param ? '<div class="small muted">Set via: ' + esc(e.param) + '</div>' : '') +
            (e.custom ? ' <button class="btn sm danger" data-action="exp-del" data-id="' + e.id + '">Remove</button>' : '') + '</td>' +
            '<td class="num">' + (showAmt ? '<input type="number" step="any" data-exp-a="' + e.id + '" value="' + (isPct && e.unit === '%' && e.a < 1 ? e.a : e.a) + '">' + (e.unit ? '<div class="small muted">' + esc(e.unit) + (isPct && e.a < 1 ? ' (fraction)' : '') + '</div>' : (e.f === 'per_mile' ? '<div class="small muted">$/mile</div>' : '')) : '<span class="muted small">calculated</span>') + '</td>' +
            '<td class="small">' + esc(TM.FREQ_LABEL[e.f] || e.f) + (e.every ? ' (' + e.every.toLocaleString() + ' mi)' : '') + (e.atStart ? ', first paid at start' : '') + '</td>' +
            '<td class="small">' + esc(e.s) + '</td><td class="small">' + esc(e.k === 'expense' ? e.fv : e.k) + '</td>' +
            '<td class="small">' + esc(e.src === 'gov' ? 'Government' : e.src === 'mixed' ? 'Mixed' : 'Private') + (e.est ? ' · est.' : '') + '</td>' +
            '<td>' + (applies ? UI.badge('Yes', 'good') : UI.badge(e.on ? 'Not for this setup' : 'Off', '')) + '</td></tr>';
        }).join('') + '</table></div></div>';
    });
    h += '<div class="card" style="margin-top:12px"><h3>Add a custom expense</h3><div class="form-grid">' +
      '<label class="field">Name<input id="cx-name" placeholder="e.g. Truck parking lot"></label>' +
      '<label class="field">Category<select id="cx-cat">' + TM.EXPENSE_CATEGORIES.map(function (c) { return '<option value="' + c.id + '"' + (c.id === 'U' ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field">Amount $<input type="number" id="cx-a" value="100" step="any"></label>' +
      '<label class="field">Frequency<select id="cx-f">' + ['monthly', 'weekly', 'quarterly', 'annual', 'per_mile', 'per_load', 'startup'].map(function (x) { return '<option value="' + x + '">' + esc(TM.FREQ_LABEL[x]) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field">Scale<select id="cx-s"><option value="company">Per company</option><option value="truck">Per truck</option><option value="driver">Per driver</option></select></label>' +
      '<label class="field">Type<select id="cx-fv"><option value="fixed">Fixed</option><option value="variable">Variable</option></select></label>' +
      '</div><button class="btn primary" data-action="exp-add" style="margin-top:8px">Add expense</button></div>';
    return h;
  };

  /* ---------------- compare ---------------- */
  V.compare = function (state, app) {
    var s = state ? state.settings : app.draft, exps = app.expList(), h = '';
    var models;
    try { models = TM.compareModels(s, exps); } catch (e) { return '<div class="callout bad">' + esc(e.message) + '</div>'; }
    h += '<div class="card"><h3>Business models side by side</h3><p class="small t2">Same truck, trailer, capital and market assumptions ($' + s.ops.planRpm.toFixed(2) + '/loaded mile, ' + s.ops.planDeadheadPct + '% deadhead). Fleet model uses ' + TM.BUSINESS_MODELS.fleet.trucks + ' trucks. Monthly figures are a typical month after startup.</p>' +
      '<div class="table-wrap"><table><tr><th>Model</th><th class="num">Startup spend</th><th class="num">Cash day one</th><th class="num">Revenue / mo</th><th class="num">Expenses / mo</th><th class="num">Net profit / mo</th><th class="num">Cash flow / mo</th><th class="num">Cost / mile</th><th class="num">Break-even $/loaded mi</th><th class="num">Cash needed to first payment</th></tr>' +
      models.map(function (r) {
        return '<tr' + (r.id === s.model ? ' class="sub"' : '') + '><td><b>' + esc(r.model.short) + '</b></td><td class="num">' + m(r.startup.spent) + '</td><td class="num">' + UI.signed(r.startup.remaining) + '</td><td class="num">' + m(r.proj.revenue) + '</td><td class="num">' + m(r.proj.expenses) +
          '</td><td class="num">' + UI.signed(r.proj.net) + '</td><td class="num">' + UI.signed(r.proj.cashFlow) + '</td><td class="num">$' + r.proj.cpm.toFixed(2) + '</td><td class="num">$' + r.proj.breakevenRpm.toFixed(2) + '</td><td class="num">' + m(r.need.bridge) + '</td></tr>';
      }).join('') + '</table></div>' +
      '<p class="small t2">Note: in partner-driver models, the driving partner\'s pay (' + (s.comp.mode === 'guaranteed' ? Math.round(s.comp.driverGpCpm * 100) + '¢/mile guaranteed payments' : 'draws, not an expense') + ') is included as configured on Setup.</p></div>';

    // owner-driver vs hired
    var dc = TM.compareDriver(s, exps), a = dc.owner.proj, b = dc.hired.proj;
    var ids = {};
    a.lines.concat(b.lines).forEach(function (l) { ids[l.id] = l.name; });
    var amt = function (p, id) { return p.lines.filter(function (l) { return l.id === id; }).reduce(function (x, l) { return x + l.amount; }, 0); };
    var diffs = Object.keys(ids).map(function (id) { return { id: id, name: ids[id], a: amt(a, id), b: amt(b, id) }; }).filter(function (x) { return Math.abs(x.a - x.b) > 1; });
    h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h3>Partner drives vs hired driver (monthly)</h3><div class="table-wrap"><table><tr><th>Line</th><th class="num">Partner drives</th><th class="num">Hired driver</th></tr>' +
      diffs.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="num">' + m(x.a) + '</td><td class="num">' + m(x.b) + '</td></tr>'; }).join('') +
      '<tr class="total"><td>Net profit</td><td class="num">' + UI.signed(a.net) + '</td><td class="num">' + UI.signed(b.net) + '</td></tr>' +
      '<tr><td>Startup cash on day one</td><td class="num">' + UI.signed(dc.owner.startup.remaining) + '</td><td class="num">' + UI.signed(dc.hired.startup.remaining) + '</td></tr></table></div>' +
      '<p class="small t2">With a hired driver you add wages, payroll taxes, workers\' comp and onboarding — but a partner is free to find freight, manage cash and grow.</p></div>';

    // financing grid
    var price = s.truck.price, apr = s.truck.apr;
    var oe = exps.filter(function (e) { return e.id === 'opportunity_cost'; })[0], opp = oe && oe.on ? oe.a : 0;
    var grid = TM.financingGrid(price, apr, [0, 10, 20, 30, 40, 50], [36, 48, 60, 72]);
    h += '<div class="card"><h3>Down payment × loan term</h3><p class="small t2">' + m(price) + ' truck at ' + apr + '% APR. Each cell: monthly payment / total interest.</p><div class="table-wrap"><table><tr><th>Down</th>' +
      [36, 48, 60, 72].map(function (t) { return '<th class="num">' + t + ' mo</th>'; }).join('') + '</tr>' +
      grid.map(function (r) {
        return '<tr' + (r.downPct === s.truck.downPct ? ' class="sub"' : '') + '><td>' + r.downPct + '% (' + m(r.down) + ')</td>' + r.cells.map(function (c) {
          return '<td class="num' + (c.term === s.truck.termMonths && r.downPct === s.truck.downPct ? ' pos' : '') + '">' + m(c.payment) + '<div class="small muted">' + m(c.interest) + '</div></td>';
        }).join('') + '</tr>';
      }).join('') + '</table></div><p class="small t2">Bigger down payment → lower payment and less interest, but less cash to survive the first 30–60 days. Opportunity cost at ' + (opp * 100).toFixed(1) + '%/yr on a ' + m(price * s.truck.downPct / 100) + ' down payment ≈ ' + m(price * s.truck.downPct / 100 * opp) + '/yr (shown, never charged).</p></div></div>';

    // sensitivity
    var base = state || TM.newGame(s, { expenses: exps });
    var rpms = [-0.30, -0.15, 0, 0.15, 0.30], fuels = [-0.5, 0, 0.5, 1.0];
    h += '<div class="card" style="margin-top:14px"><h3>Sensitivity: monthly net profit</h3><p class="small t2">How rates and diesel prices move your monthly profit (current setup).</p><div class="table-wrap"><table><tr><th>Diesel ↓ / Rate →</th>' +
      rpms.map(function (r) { return '<th class="num">$' + (s.ops.planRpm + r).toFixed(2) + '</th>'; }).join('') + '</tr>' +
      fuels.map(function (fd) {
        var fp = base.fuelPrice + fd;
        return '<tr><td>$' + fp.toFixed(2) + '/gal</td>' + rpms.map(function (r) { var p = TM.project(base, { rpm: s.ops.planRpm + r, fuelPrice: fp }); return '<td class="num">' + UI.signed(p.net) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</table></div></div>';
    return h;
  };
})(globalThis.TM = globalThis.TM || {});
