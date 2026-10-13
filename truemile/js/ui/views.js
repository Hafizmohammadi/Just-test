/* TrueMile views: dashboard, load board, fleet, log, learn. Each returns an HTML string. */
(function (TM) {
  'use strict';
  var UI = TM.UI, esc = UI.esc, m = UI.m;
  var V = UI.views = UI.views || {};

  function active(state) { return state.trucks.filter(function (t) { return !t.sold; }); }
  function statusBadge(t) {
    var map = { idle: ['Idle — needs a load', 'warn'], enroute: ['En route', 'info'], shop: ['In shop', 'bad'], sold: ['Sold', ''] };
    if (t.status === 'idle' && !t.driverId) return UI.badge('Parked — no driver', 'bad');
    var x = map[t.status] || [t.status, ''];
    return UI.badge(x[0], x[1]);
  }
  function tripProgress(t) {
    if (!t.trip) return '';
    var total = (t.trip.load ? t.trip.load.deadhead + t.trip.load.miles : t.trip.deadLeft + t.trip.loadedLeft + 1);
    var left = t.trip.deadLeft + t.trip.loadedLeft;
    var pct = TM.clamp(100 * (1 - left / total), 0, 100);
    var to = t.trip.load ? UI.city(t.trip.load.pickup) + ' → ' + UI.city(t.trip.load.dest) : 'Deadhead to ' + UI.city(t.trip.dest);
    return '<div class="small t2">' + esc(to) + ' · ' + Math.round(left) + ' mi left' + (t.trip.load ? ' · due ' + esc(TM.fmtDate(UI.app.state, t.trip.load.deliverBy)) : '') + '</div><div class="progress"><i style="width:' + pct.toFixed(0) + '%"></i></div>';
  }
  V.statusBadge = statusBadge;

  /* ---------------- dashboard ---------------- */
  V.dashboard = function (state) {
    var b = state.bal, h = '';
    if (state.gameOver) {
      h += '<div class="callout bad"><b>Game over — ' + esc(state.gameOver.reason) + '.</b> ' + esc(state.gameOver.text) +
        ' <button class="btn sm" data-action="go" data-view="learn">Read: profit vs cash</button> <button class="btn sm primary" data-action="go" data-view="setup">Start over</button></div>';
    }
    if (state.pending.length) h += '<div class="callout warn"><b>Decision needed:</b> ' + esc(state.pending[0].title) + ' <button class="btn sm" data-action="show-decision">Decide</button></div>';
    if (b.cash < 0 && !state.gameOver) h += '<div class="callout bad"><b>Overdrawn by ' + m(-b.cash) + '.</b> You have ' + (14 - state.negDays) + ' days to fix it: collect or factor invoices, use quick pay, open a line of credit, or add partner capital (Finances → Funding).</div>';
    var idle = active(state).filter(function (t) { return t.status === 'idle'; });
    if (idle.length && !state.gameOver) h += '<div class="callout info">' + idle.length + ' truck' + (idle.length > 1 ? 's are' : ' is') + ' sitting idle. Fixed costs keep running every day. <button class="btn sm primary" data-action="go" data-view="loads">Find a load</button></div>';

    var openAR = state.ar.filter(function (a) { return a.status === 'open' || a.status === 'disputed'; });
    var equity = b.contrib - b.draws + b.pnl;
    var pr = TM.project(state);
    var dailyFixed = (pr.fixed + pr.financing + pr.principal) / 30;
    var runway = dailyFixed > 0 ? Math.max(0, b.cash) / dailyFixed : 0;
    h += '<div class="grid g4">' +
      UI.stat('Cash in bank', UI.signed(b.cash), 'Maintenance reserve earmarked: ' + m(state.reserves.maint), b.cash < 0 ? 'neg' : '') +
      UI.stat('Owed by customers (AR)', m(b.ar), openAR.length + ' open invoice' + (openAR.length === 1 ? '' : 's')) +
      UI.stat('Net profit to date', UI.signed(b.pnl), 'Includes startup costs and depreciation') +
      UI.stat('Debt', m(b.debt), 'Unpaid bills: ' + m(b.accrued)) +
      UI.stat('Owners\' equity', UI.signed(equity), 'Contributed ' + m(b.contrib) + ' · drawn ' + m(b.draws)) +
      UI.stat('Cash runway', dailyFixed > 0 ? Math.floor(runway) + ' days' : '—', 'Days of fixed costs + loan payments covered by cash') +
      UI.stat('Loads delivered', state.stats.loads, state.stats.late + ' late · ' + Math.round(state.stats.miles).toLocaleString() + ' miles') +
      UI.stat('Revenue per loaded mile', state.stats.loadedMiles ? '$' + (state.stats.revenue / state.stats.loadedMiles).toFixed(2) : '—',
        'Deadhead ' + (state.stats.miles ? TM.pct(1 - state.stats.loadedMiles / state.stats.miles) : '—') + ' · break-even ≈ $' + pr.breakevenRpm.toFixed(2)) +
      '</div>';

    // charts
    var hist = state.history, step = Math.max(1, Math.ceil(hist.length / 120));
    var pts = hist.filter(function (x, i) { return i % step === 0 || i === hist.length - 1; }).map(function (x) {
      return { label: TM.fmtDate(state, x.d).replace(/, \d{4}$/, ''), value: x.c, tip: TM.fmtDate(state, x.d) + ' — cash ' + m(x.c) + ', AR ' + m(x.a) };
    });
    var months = Object.keys(state.agg).sort().slice(-12).map(function (k) {
      var v = Object.keys(state.agg[k].pnl).reduce(function (a, id) { return a + state.agg[k].pnl[id]; }, 0);
      return { label: TM.monthLabel(k), value: v, tip: TM.monthLabel(k) + ' net ' + (v >= 0 ? 'profit ' : 'loss ') + m(v) };
    });
    h += '<div class="grid g2" style="margin-top:14px">' +
      '<div class="card"><h3>Cash in bank</h3>' + UI.lineChart(pts, { label: 'Cash balance over time' }) + '</div>' +
      '<div class="card"><h3>Net profit by month</h3>' + UI.barChart(months, { label: 'Monthly net profit' }) + '</div></div>';

    // profit vs cash bridge
    h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h3>Where did the profit go? <button class="btn sm" data-action="go" data-view="learn">Why?</button></h3>' +
      '<p class="small t2">Cash always equals this bridge. Profit and cash differ because of timing (receivables, unpaid bills), financing (loans, principal) and owner withdrawals.</p><table>' +
      bridgeRow('Capital contributed by partners', b.contrib) +
      bridgeRow('Net profit (loss) to date', b.pnl) +
      bridgeRow('+ Depreciation (expense, but no cash left)', b.accDep) +
      bridgeRow('− Money customers still owe you (AR)', -b.ar) +
      bridgeRow('− Equipment bought (at cost)', -b.fixed) +
      bridgeRow('+ Borrowed and not yet repaid', b.debt) +
      bridgeRow('+ Bills owed but not yet paid (wages, partner pay)', b.accrued) +
      bridgeRow('− Refundable deposits held by others', -b.dep) +
      bridgeRow('− Partner draws & tax distributions', -b.draws) +
      '<tr class="total"><td>= Cash in bank</td><td class="num">' + UI.signed(b.cash) + '</td></tr></table></div>';

    // fleet
    h += '<div class="card"><h3>Fleet <button class="btn sm" data-action="go" data-view="fleet">Manage</button></h3>';
    active(state).forEach(function (t) {
      var d = TM.driverOf(state, t);
      h += '<div style="padding:8px 0;border-bottom:1px solid var(--border)"><div class="row"><b>' + esc(t.name) + '</b>' + statusBadge(t) +
        '<span class="small t2">' + esc(UI.city(t.city)) + ' · ' + (d ? esc(d.name) : 'no driver') + ' · condition ' + Math.round(t.condition) + '%</span><span class="spacer"></span>' +
        (t.status === 'idle' && t.driverId ? '<button class="btn sm primary" data-action="pick-truck" data-truck="' + t.id + '">Loads</button>' : '') +
        (t.status === 'shop' ? '<span class="small">' + t.shopDays + ' day(s) left</span>' : '') + '</div>' + tripProgress(t) + '</div>';
    });
    h += '</div></div>';

    // plan vs actual + recent log
    var lastKey = Object.keys(state.agg).sort().slice(-2)[0];
    var last = lastKey ? state.agg[lastKey] : null;
    var lastNet = last ? Object.keys(last.pnl).reduce(function (a, id) { return a + last.pnl[id]; }, 0) : 0;
    h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h3>Monthly plan (projection)</h3>' +
      '<p class="small t2">At $' + state.settings.ops.planRpm.toFixed(2) + '/loaded mile, ' + state.settings.ops.planDeadheadPct + '% deadhead, ' + state.settings.ops.planUtilization + '% utilization — edit in Setup.</p>' +
      '<div class="kv"><span>Revenue</span><span>' + m(pr.revenue) + '</span><span>Expenses (incl. depreciation & interest)</span><span>' + m(pr.expenses) + '</span>' +
      '<span><b>Net profit</b></span><span><b>' + UI.signed(pr.net) + '</b></span><span>Cash flow after principal' + (pr.draws ? ' & draws' : '') + '</span><span>' + UI.signed(pr.cashFlow) + '</span>' +
      '<span>Cost per mile (all miles)</span><span>$' + pr.cpm.toFixed(2) + '</span><span>Break-even rate / loaded mile</span><span>$' + pr.breakevenRpm.toFixed(2) + '</span>' +
      '<span>Cash break-even / loaded mile</span><span>$' + pr.cashBreakevenRpm.toFixed(2) + '</span>' +
      (last ? '<span>Actual net, ' + TM.monthLabel(lastKey) + '</span><span>' + UI.signed(lastNet) + '</span>' : '') + '</div></div>' +
      '<div class="card"><h3>Recent events <button class="btn sm" data-action="go" data-view="log">All</button></h3>' + V.logList(state.log.slice(0, 7), state) + '</div></div>';
    return h;
  };
  function bridgeRow(label, v) { return '<tr><td>' + esc(label) + '</td><td class="num">' + UI.signed(v) + '</td></tr>'; }

  V.logList = function (items, state) {
    if (!items.length) return '<p class="muted">Nothing yet.</p>';
    return '<ul class="log">' + items.map(function (l) {
      return '<li class="' + esc(l.type) + '"><span class="d">' + esc(TM.fmtDate(state, l.day)) + '</span><div><b>' + esc(l.title) + '</b><span class="small t2">' + esc(l.text) + '</span>' +
        (l.lesson ? ' <button class="btn sm" data-action="lesson" data-id="' + esc(l.lesson) + '">Lesson</button>' : '') + '</div></li>';
    }).join('') + '</ul>';
  };

  /* ---------------- load board ---------------- */
  V.loads = function (state, app) {
    var trucks = active(state);
    var t = trucks.filter(function (x) { return x.id === app.selTruck; })[0] || trucks.filter(function (x) { return x.status === 'idle' && x.driverId; })[0] || trucks[0];
    if (!t) return '<div class="card">No trucks. Buy one in Fleet.</div>';
    app.selTruck = t.id;
    var h = '<div class="truckbar">' + trucks.map(function (x) {
      return '<button class="btn ' + (x === t ? 'active' : '') + '" data-action="pick-truck" data-truck="' + x.id + '">' + esc(x.name) + ' ' + statusBadge(x) + '</button>';
    }).join('') + '</div>';
    if (t.status !== 'idle') {
      h += '<div class="card"><h3>' + esc(t.name) + ' is busy</h3>' + tripProgress(t) + (t.status === 'shop' ? '<p>In the shop for ' + t.shopDays + ' more day(s).</p>' : '') +
        '<p class="small t2">Press "Next day" or "Run to next free truck" to keep driving.</p></div>';
      return h + completedTable(state);
    }
    if (!t.driverId) return h + '<div class="card"><h3>' + esc(t.name) + ' has no driver</h3><p>Hire a driver or assign a partner in Fleet.</p><button class="btn primary" data-action="go" data-view="fleet">Go to Fleet</button></div>';

    var board = TM.boardFor(state, t).map(function (l) { return { l: l, e: TM.estimateLoad(state, t, l) }; });
    var sort = app.loadSort || 'perDay';
    board.sort(function (a, b) {
      if (sort === 'rpm') return b.l.rpm - a.l.rpm;
      if (sort === 'net') return b.e.net - a.e.net;
      if (sort === 'pay') return a.l.payDays - b.l.payDays;
      return b.e.perDay - a.e.perDay;
    });
    var pr = TM.project(state);
    h += '<div class="card" style="margin-bottom:12px"><div class="row"><div><b>' + esc(t.name) + '</b> empty in <b>' + esc(UI.city(t.city)) + '</b> · ' + t.trailer.type.replace('_', ' ') +
      ' · diesel here $' + TM.fuelPriceAt(state, TM.cityById(t.city).state).toFixed(2) + '/gal · your break-even ≈ <b>$' + pr.breakevenRpm.toFixed(2) + '/loaded mi</b> · fixed cost ≈ ' + m(TM.fixedMonthlyPerTruck(state) / 30) + '/day</div>' +
      '<span class="spacer"></span><label class="field inline">Sort <select data-action="load-sort">' +
      [['perDay', 'Net per day'], ['net', 'Net profit'], ['rpm', 'Rate per mile'], ['pay', 'Fastest pay']].map(function (o) { return '<option value="' + o[0] + '"' + (sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></label></div>' +
      '<details><summary class="small">Reposition empty to another market</summary><div class="row" style="margin-top:6px"><select id="repo-city">' +
      TM.CITIES.filter(function (c) { return c.id !== t.city; }).map(function (c) { var d = TM.distance(t.city, c.id); return { c: c, d: d }; })
        .sort(function (a, b) { return a.d - b.d; }).map(function (x) { return '<option value="' + x.c.id + '">' + esc(x.c.name) + ' (' + x.d + ' mi, market ' + (x.c.out >= 1.05 ? 'strong' : x.c.out < 0.85 ? 'weak' : 'average') + ')</option>'; }).join('') +
      '</select><button class="btn" data-action="reposition" data-truck="' + t.id + '">Deadhead there</button><span class="small muted">Or press "Next day" to wait for tomorrow\'s loads.</span></div></details></div>';

    if (!board.length) h += '<div class="card">No loads posted here today. Wait a day or reposition.</div>';
    h += '<div class="grid">' + board.map(function (x) {
      var l = x.l, e = x.e, cls = e.net >= 0 ? 'pos' : 'neg';
      var allMi = l.deadhead + l.miles;
      return '<div class="load"><div><div class="route">' + esc(UI.city(l.pickup)) + ' → ' + esc(UI.city(l.dest)) + '</div><div class="meta">' +
        '<span>' + l.miles + ' loaded mi</span><span>' + l.deadhead + ' deadhead mi</span><span>' + esc(l.commodity) + ', ' + (l.weight / 1000).toFixed(0) + 'k lb</span>' +
        '<span>Pick up ' + (l.pickupDay === state.day ? 'today' : 'tomorrow') + '</span><span>Deliver by ' + esc(TM.fmtDate(state, l.deliverBy)) + '</span></div>' +
        '<div class="meta"><span>' + esc(l.payerName) + '</span><span>Credit ' + l.credit + '</span><span>Pays in ~' + l.payDays + ' days</span>' + (l.direct ? UI.badge('Direct shipper', 'good') : '') + '</div>' +
        (l.risks.length ? '<div class="meta">' + l.risks.map(function (r) { return UI.badge(r, 'warn'); }).join(' ') + '</div>' : '') + '</div>' +
        '<div class="money"><b>' + m(l.total) + '</b><div class="small t2">$' + l.rpm.toFixed(2) + '/loaded mi · $' + (l.total / allMi).toFixed(2) + '/total mi</div>' + (l.fsc ? '<div class="small t2">incl. FSC ' + m(l.fsc) + '</div>' : '') + '</div>' +
        '<div class="econ"><div><span>Gross</span>' + m(e.gross) + '</div>' + (e.deductions - e.risk > 0.5 ? '<div><span>Carrier/dispatch/factoring</span>−' + m(e.deductions - e.risk) + '</div>' : '') +
        (e.risk > 0.5 ? '<div><span>Non-payment risk</span>−' + m(e.risk) + '</div>' : '') +
        '<div><span>Fuel (all miles)</span>−' + m(e.fuel) + '</div><div><span>Other variable (pay, maint, tires…)</span>−' + m(e.variable) + '</div>' +
        '<div><span>Contribution</span>' + UI.signed(e.contribution) + '</div><div><span>Fixed costs, ' + e.days + ' day' + (e.days > 1 ? 's' : '') + '</span>−' + m(e.fixed) + '</div>' +
        '<div><span>Est. true profit</span><b class="' + cls + '">' + m(e.net) + '</b></div><div><span>Per day</span><b class="' + cls + '">' + m(e.perDay) + '</b></div></div>' +
        '<div class="actions"><button class="btn primary" data-action="dispatch" data-truck="' + t.id + '" data-load="' + l.id + '">Book this load</button></div></div>';
    }).join('') + '</div>';
    return h + completedTable(state);
  };

  function completedTable(state) {
    if (!state.completed.length) return '';
    return '<div class="card" style="margin-top:14px"><h3>Delivered loads</h3><div class="table-wrap"><table><tr><th>Delivered</th><th>Truck</th><th>Route</th><th class="num">Loaded mi</th><th class="num">Deadhead</th><th class="num">Rate</th><th class="num">Invoiced</th><th class="num">Est. profit at booking</th><th>Payer</th><th>On time</th></tr>' +
      state.completed.slice(0, 40).map(function (c) {
        return '<tr><td>' + esc(TM.fmtDate(state, c.day)) + '</td><td>' + esc(c.truck) + '</td><td>' + esc(TM.cityById(c.pickup).name) + ' → ' + esc(TM.cityById(c.dest).name) + '</td><td class="num">' + c.miles +
          '</td><td class="num">' + c.deadhead + '</td><td class="num">' + m(c.total) + '</td><td class="num">' + m(c.invoice) + '</td><td class="num">' + (c.estNet === null ? '—' : UI.signed(c.estNet)) + '</td><td>' + esc(c.payer) + '</td><td>' +
          (c.late ? UI.badge(c.late + 'd late', 'bad') : UI.badge('On time', 'good')) + '</td></tr>';
      }).join('') + '</table></div></div>';
  }

  /* ---------------- fleet ---------------- */
  V.fleet = function (state, app) {
    var s = state.settings, h = '<div class="grid g2">';
    active(state).forEach(function (t) {
      var d = TM.driverOf(state, t), loan = state.loans.filter(function (l) { return l.id === t.loanId; })[0];
      h += '<div class="card"><h3>' + esc(t.name) + ' ' + statusBadge(t) + '</h3>' +
        '<div class="kv"><span>Acquisition</span><span>' + esc({ cash: 'Bought for cash', loan: 'Financed', lease: 'Leased', personal: 'Partner\'s personal truck (rented)' }[t.acq]) + '</span>' +
        '<span>Price</span><span>' + m(t.price) + '</span>' +
        (t.cost ? '<span>Book value (cost − depreciation)</span><span>' + m(t.cost - t.accDep) + '</span><span>Est. market value</span><span>' + m(TM.marketValue(state, t)) + '</span>' : '') +
        (loan && loan.balance > 0 ? '<span>Loan balance · payment</span><span>' + m(loan.balance) + ' · ' + m(loan.payment) + '/mo</span>' : '') +
        (t.acq === 'lease' ? '<span>Lease</span><span>' + m(t.leaseWeekly) + '/week' + (t.leaseIncludesMaint ? ' incl. maintenance' : '') + '</span>' : '') +
        (t.acq === 'personal' ? '<span>Rent to partner</span><span>' + m(t.personalRent) + '/mo</span>' : '') +
        '<span>Odometer</span><span>' + Math.round(t.odometer).toLocaleString() + ' mi</span><span>Fuel economy</span><span>' + t.mpg + ' mpg</span>' +
        '<span>Condition</span><span>' + Math.round(t.condition) + '%</span><span>Age</span><span>' + t.ageYears + ' yr</span>' +
        '<span>Trailer</span><span>' + esc(TM.TRAILER_TYPES[t.trailer.type].name) + ' (' + esc(t.trailer.acq) + ')</span>' +
        '<span>Location</span><span>' + esc(UI.city(t.city)) + '</span><span>Driver</span><span>' + (d ? esc(d.name) + (d.type === 'hired' ? ' · ' + Math.round(d.cpm * 100) + '¢/mi' : ' · partner') : '<b class="neg">none</b>') + '</span>' +
        '<span>Warranty</span><span>' + (t.warranty ? 'Yes' : 'No') + '</span><span>Revenue earned</span><span>' + m(t.revenue) + '</span></div>' +
        '<div class="row" style="margin-top:10px">' +
        (!d ? '<button class="btn primary" data-action="hire" data-truck="' + t.id + '">Hire driver</button>' + freePartners(state).map(function (p) { return '<button class="btn" data-action="assign-partner" data-truck="' + t.id + '" data-partner="' + p.id + '">' + esc(p.name) + ' drives</button>'; }).join('') : '') +
        (d && d.type === 'hired' && t.status === 'idle' ? '<button class="btn danger" data-action="let-go" data-truck="' + t.id + '">Let driver go</button>' : '') +
        (d && d.type === 'partner' && t.status === 'idle' ? '<button class="btn" data-action="partner-off" data-truck="' + t.id + '">Partner stops driving</button>' : '') +
        (loan && loan.balance > 0 ? '<button class="btn" data-action="payoff" data-loan="' + loan.id + '"' + (state.bal.cash < loan.balance ? ' disabled' : '') + '>Pay off loan</button>' : '') +
        (t.status === 'idle' ? '<button class="btn danger" data-action="sell" data-truck="' + t.id + '">' + (t.acq === 'lease' ? 'Return lease' : t.acq === 'personal' ? 'End rental' : 'Sell truck') + '</button>' : '') +
        '</div></div>';
    });
    h += '</div>';

    // services
    h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h3>Dispatcher</h3><p class="small t2">A dispatcher finds better freight (≈ +4% rates, more loads on the board) for a percentage of gross revenue.</p>' +
      '<div class="row"><label class="field inline">Fee % <input type="number" step="0.5" min="0" max="15" value="' + (s.ops.dispatcherPct || 7) + '" id="disp-pct" style="width:80px"></label>' +
      (state.dispatcher ? '<span class="badge good">Active (' + s.ops.dispatcherPct + '%)</span><button class="btn" data-action="dispatcher-off">Let dispatcher go</button>' : '<button class="btn primary" data-action="dispatcher-on">Hire dispatcher</button>') + '</div></div>' +
      '<div class="card"><h3>Factoring</h3>' + (s.authority === 'carrier' ? '<p class="small t2">Not needed under a carrier lease — the carrier settles weekly.</p>' :
        '<p class="small t2">Sell every invoice for cash on delivery at a ' + s.ops.factoringPct + '% fee (non-recourse: the factor takes the risk of non-payment).</p><div class="row">' +
        '<label class="field inline">Fee % <input type="number" step="0.25" min="0.5" max="8" value="' + s.ops.factoringPct + '" id="fact-pct" style="width:80px"></label>' +
        (s.ops.factoring ? '<span class="badge good">On</span><button class="btn" data-action="factoring-off">Stop factoring</button>' : '<button class="btn primary" data-action="factoring-on">Start factoring</button>') + '</div>') + '</div></div>';

    // drivers
    h += '<div class="card" style="margin-top:14px"><h3>Drivers</h3><div class="table-wrap"><table><tr><th>Name</th><th>Type</th><th>Truck</th><th class="num">Pay</th><th>Since</th></tr>' +
      state.drivers.map(function (d) {
        var t = state.trucks.filter(function (x) { return x.id === d.truckId; })[0];
        return '<tr><td>' + esc(d.name) + '</td><td>' + (d.type === 'hired' ? 'Hired (W-2)' : 'Partner') + '</td><td>' + (t ? esc(t.name) : '—') + '</td><td class="num">' +
          (d.type === 'hired' ? Math.round(d.cpm * 100) + '¢/mi' : s.comp.mode === 'guaranteed' ? Math.round(s.comp.driverGpCpm * 100) + '¢/mi guaranteed' : 'draws/profit') + '</td><td>' + esc(TM.fmtDate(state, d.hiredDay)) + '</td></tr>';
      }).join('') + '</table></div>' +
      '<p class="small t2">Hired driver pay: <input type="number" step="0.01" min="0.3" max="1.2" value="' + s.ops.driverCpm + '" id="driver-cpm" style="width:80px"> $/mile for new hires. Onboarding costs (drug test, MVR, Clearinghouse, DQ file, recruiting) are charged on hire.</p></div>';

    // buy truck
    var bt = app.buy || (app.buy = { marketId: 'used7', acq: 'loan', downPct: 20, apr: s.truck.apr, termMonths: 60, trailerAcq: s.trailer.acq, leaseWeekly: 750, leaseIncludesMaint: true });
    var mk = TM.TRUCK_MARKET.filter(function (x) { return x.id === bt.marketId; })[0];
    var pmt = bt.acq === 'loan' ? TM.loanPayment(mk.price * (1 - bt.downPct / 100), bt.apr, bt.termMonths, 0) : 0;
    var upfront = bt.acq === 'cash' ? mk.price : bt.acq === 'loan' ? mk.price * bt.downPct / 100 : 0;
    h += '<div class="card" style="margin-top:14px"><h3>Add a truck</h3><div class="form-grid">' +
      '<label class="field">Truck<select data-buy="marketId">' + TM.TRUCK_MARKET.map(function (x) { return '<option value="' + x.id + '"' + (x.id === bt.marketId ? ' selected' : '') + '>' + esc(x.name) + ' — ' + m(x.price) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field">Acquire by<select data-buy="acq">' + [['loan', 'Finance'], ['cash', 'Pay cash'], ['lease', 'Lease']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === bt.acq ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      (bt.acq === 'loan' ? '<label class="field">Down payment %<input type="number" data-buy="downPct" value="' + bt.downPct + '"></label><label class="field">APR %<input type="number" step="0.25" data-buy="apr" value="' + bt.apr + '"></label><label class="field">Term (months)<input type="number" data-buy="termMonths" value="' + bt.termMonths + '"></label>' : '') +
      (bt.acq === 'lease' ? '<label class="field">Weekly lease $<input type="number" data-buy="leaseWeekly" value="' + bt.leaseWeekly + '"></label><label class="field inline"><input type="checkbox" data-buy="leaseIncludesMaint"' + (bt.leaseIncludesMaint ? ' checked' : '') + '> Full-service (maintenance included)</label>' : '') +
      '<label class="field">Trailer<select data-buy="trailerAcq">' + [['rent', 'Rent'], ['cash', 'Buy for cash'], ['loan', 'Finance'], ['lease', 'Lease']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === bt.trailerAcq ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '</div><p class="small t2">' + esc(mk.name) + ': ' + mk.mpg + ' mpg, condition ' + mk.condition + '%, ' + mk.odometer.toLocaleString() + ' mi. ' +
      (bt.acq === 'loan' ? 'Payment ≈ ' + m(pmt) + '/mo. ' : '') + (bt.acq === 'lease' ? 'Lease ≈ ' + m(bt.leaseWeekly * 52 / 12) + '/mo. ' : '') +
      'Cash needed now ≈ ' + m(upfront) + ' + fees, plates, HVUT, insurance down payment and equipment. You also need a driver.</p>' +
      '<button class="btn primary" data-action="buy-truck">Acquire truck</button></div>';
    return h;
  };
  function freePartners(state) {
    return state.settings.partners.filter(function (p) { return !state.drivers.some(function (d) { return d.partnerId === p.id && d.truckId; }); });
  }

  /* ---------------- log ---------------- */
  V.log = function (state, app) {
    var f = app.logFilter || 'all';
    var items = state.log.filter(function (l) { return f === 'all' || l.type === f; });
    return '<div class="card"><h3>Event log <span class="row">' + ['all', 'good', 'bad', 'warn', 'info', 'lesson'].map(function (k) {
      return '<button class="btn sm' + (k === f ? ' primary' : '') + '" data-action="log-filter" data-f="' + k + '">' + k + '</button>';
    }).join('') + '</span></h3>' + V.logList(items.slice(0, 300), state) + '</div>';
  };

  /* ---------------- learn ---------------- */
  V.learn = function (state, app) {
    var h = '<div class="grid g2"><div>';
    TM.LESSONS.forEach(function (l) {
      h += '<details class="card" id="lesson-' + l.id + '"' + (app.openLesson === l.id ? ' open' : '') + ' style="margin-bottom:10px"><summary>' + esc(l.title) + '</summary>' +
        l.body.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</details>';
    });
    h += '<div class="card"><h3>Business models</h3>';
    Object.keys(TM.BUSINESS_MODELS).forEach(function (k) {
      var bm = TM.BUSINESS_MODELS[k];
      h += '<details><summary>' + esc(bm.name) + '</summary><p>' + esc(bm.summary) + '</p><p><b>Revenue:</b> ' + esc(bm.revenue) + '</p><ul class="tight">' +
        bm.costs.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></details>';
    });
    h += '</div></div><div>';
    h += '<div class="card" style="margin-bottom:14px"><h3>Challenges</h3><table>' + TM.CHALLENGES.map(function (c) {
      var done = state && state.challenges[c.id] !== undefined;
      return '<tr><td>' + (done ? UI.badge('Done', 'good') : UI.badge('Open', '')) + '</td><td><b>' + esc(c.title) + '</b><div class="small t2">' + esc(c.desc) + '</div></td><td class="small muted">' + (done ? esc(TM.fmtDate(state, state.challenges[c.id])) : '') + '</td></tr>';
    }).join('') + '</table></div>';
    h += '<div class="card" style="margin-bottom:14px"><h3>Glossary</h3><div class="kv" style="grid-template-columns:auto 1fr">' +
      TM.GLOSSARY.map(function (g) { return '<b>' + esc(g[0]) + '</b><span style="text-align:left">' + esc(g[1]) + '</span>'; }).join('') + '</div></div>';
    h += '<div class="card"><h3>About the numbers</h3><p class="small t2">Every price, fee, tax, premium and rate in TrueMile is an editable example for learning — not a market quote, legal, tax or financial advice. Regulatory fees vary by state, vehicle weight, fleet size and year; insurance varies by driver history, cargo and lanes. Verify current figures with FMCSA, your base state, the IRS, your insurance agent and a CPA before making real decisions.</p>' +
      '<p class="small t2">Simplifications: insurance installments are a 20%-down + 10 payments model; book depreciation is straight-line; payroll taxes use flat rates; IFTA splits each loaded trip half/half between origin and destination states; partner income taxes are paid personally via quarterly tax distributions.</p></div>';
    return h + '</div></div>';
  };
})(globalThis.TM = globalThis.TM || {});
