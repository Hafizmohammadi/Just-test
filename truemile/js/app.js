/* TrueMile app shell: state, persistence, navigation and actions. */
(function (TM) {
  'use strict';
  var UI = TM.UI, V = UI.views;
  var SAVE_KEY = 'truemile.save.v1', DRAFT_KEY = 'truemile.draft.v1';

  var TABS = [['dashboard', 'Dashboard'], ['loads', 'Load board'], ['fleet', 'Fleet & drivers'], ['finances', 'Finances'], ['expenses', 'Expenses'], ['compare', 'Compare'], ['learn', 'Learn'], ['log', 'Log'], ['setup', 'Setup']];

  var app = UI.app = {
    state: null, view: 'setup', draft: null, draftExp: null, auto: null,
    expList: function () { return app.state ? app.state.expenses : (app.draftExp || (app.draftExp = TM.clone(TM.EXPENSES))); }
  };

  /* ---------- storage (always guarded) ---------- */
  function load(key) { try { var s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function store(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function save() {
    if (app.state) store(SAVE_KEY, app.state);
    store(DRAFT_KEY, { draft: app.draft, exp: app.state ? null : app.draftExp, view: app.view });
  }

  function init() {
    var saved = load(SAVE_KEY), d = load(DRAFT_KEY);
    app.draft = (d && d.draft) || TM.defaultSettings();
    if (!app.draft.homeCity) app.draft.homeCity = 'DAL';
    app.draftExp = d && d.exp ? TM.mergeExpenses(d.exp) : null;
    if (saved && saved.version === 1 && saved.bal) {
      app.state = saved;
      app.view = (d && d.view) || 'dashboard';
    }
    try {
      var theme = localStorage.getItem('truemile.theme');
      if (theme) document.documentElement.setAttribute('data-theme', theme);
    } catch (e) { /* ignore */ }
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input,select,textarea')) return;
      if (e.key === 'n' || e.key === 'N') act('next');
    });
    UI.bindChartHover(document.getElementById('main'));
    window.addEventListener('resize', measureTopbar);
    render();
  }

  function measureTopbar() {
    var tb = document.getElementById('topbar');
    if (tb) document.documentElement.style.setProperty('--topbar-h', tb.offsetHeight + 'px');
  }

  /* ---------- rendering ---------- */
  function render() {
    var s = app.state;
    renderTopbar();
    var nav = document.getElementById('tabs');
    nav.innerHTML = TABS.map(function (t) {
      var disabled = !s && ['dashboard', 'loads', 'fleet', 'finances', 'log'].indexOf(t[0]) >= 0;
      if (disabled) return '';
      var badge = '';
      if (s && t[0] === 'loads') { var idle = s.trucks.filter(function (x) { return !x.sold && x.status === 'idle' && x.driverId; }).length; if (idle) badge = UI.badge(idle, 'warn'); }
      if (s && t[0] === 'finances' && s.bal.cash < 0) badge = UI.badge('!', 'bad');
      return '<button class="' + (app.view === t[0] ? 'active' : '') + '" data-action="go" data-view="' + t[0] + '">' + t[1] + badge + '</button>';
    }).join('');
    var main = document.getElementById('main');
    var fn = V[app.view] || V.setup;
    try {
      main.innerHTML = fn(s, app);
    } catch (err) {
      main.innerHTML = '<div class="callout bad">Something went wrong rendering this page: ' + UI.esc(err.message) + '</div>';
      if (window.console) console.error(err);
    }
    renderModal();
    measureTopbar();
  }

  function renderTopbar() {
    var s = app.state, tb = document.getElementById('topbar');
    var h = '<div class="brand">' + UI.esc(s ? s.settings.company : app.draft.company) + ' <span>sim</span></div>';
    if (s) {
      var b = s.bal;
      h += '<div class="kpis">' +
        '<div class="kpi"><span>Date</span><b>' + UI.esc(TM.fmtDate(s)) + '</b></div>' +
        '<div class="kpi"><span>Day</span><b>' + s.day + '</b></div>' +
        '<div class="kpi"><span>Cash</span><b class="' + (b.cash < 0 ? 'neg' : '') + '">' + TM.money(b.cash) + '</b></div>' +
        '<div class="kpi"><span>Receivables</span><b>' + TM.money(b.ar) + '</b></div>' +
        '<div class="kpi"><span>Profit to date</span><b class="' + (b.pnl < 0 ? 'neg' : 'pos') + '">' + TM.money(b.pnl) + '</b></div>' +
        '<div class="kpi"><span>Diesel</span><b>$' + s.fuelPrice.toFixed(2) + '</b></div></div>' +
        '<div class="controls">' +
        '<button class="btn primary" data-action="next" title="Advance one day (N)"' + (s.gameOver ? ' disabled' : '') + '>Next day</button>' +
        '<button class="btn" data-action="until"' + (s.gameOver ? ' disabled' : '') + '>Run to next free truck</button>' +
        '<button class="btn" data-action="week"' + (s.gameOver ? ' disabled' : '') + '>+7 days</button>' +
        '<button class="btn" data-action="auto"' + (s.gameOver ? ' disabled' : '') + '>' + (app.auto ? '❚❚ Pause' : '▶ Auto') + '</button>' +
        '<button class="btn" data-action="theme" title="Toggle light/dark">◐</button></div>';
    } else {
      h += '<div class="kpis"><div class="kpi"><span>Status</span><b>Planning</b></div></div><div class="controls"><button class="btn" data-action="theme" title="Toggle light/dark">◐</button></div>';
    }
    tb.innerHTML = h;
  }

  function renderModal() {
    var host = document.getElementById('modal');
    var s = app.state;
    if (s && s.pending.length && app.showDecision !== false) {
      var d = s.pending[0];
      host.innerHTML = '<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="dec-title"><h2 id="dec-title">' + UI.esc(d.title) + '</h2><p>' + UI.esc(d.text) + '</p>' +
        '<p class="small t2">Cash ' + TM.money(s.bal.cash) + ' · maintenance reserve ' + TM.money(s.reserves.maint) + (s.credit.open ? ' · credit available ' + TM.money(s.credit.limit - s.credit.balance) : '') + '</p>' +
        '<div class="options">' + d.options.map(function (o) {
          return '<button class="btn" data-action="decide" data-dec="' + d.id + '" data-opt="' + UI.esc(o.id) + '">' + UI.esc(o.label) + '<small>' + UI.esc(o.desc) + '</small></button>';
        }).join('') + '</div></div></div>';
      var first = host.querySelector('button'); if (first) first.focus();
    } else if (app.modalHtml) {
      host.innerHTML = '<div class="modal-bg" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true">' + app.modalHtml + '<div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn" data-action="close-modal">Close</button></div></div></div>';
    } else host.innerHTML = '';
  }

  /* ---------- actions ---------- */
  function stopAuto() { if (app.auto) { clearInterval(app.auto); app.auto = null; } }

  function step(fn) {
    var s = app.state;
    if (!s) return;
    var before = s.log.length ? s.log[0] : null;
    var r = fn(s);
    if (r && r.ok === false && r.reason) UI.toast(r.reason);
    if (s.pending.length || s.gameOver) stopAuto();
    save();
    render();
    var newest = s.log[0];
    if (newest && newest !== before && (newest.type === 'bad' || newest.type === 'good') && !app.auto) UI.toast(newest.title);
  }

  function act(name, el) {
    var s = app.state, d = el ? el.dataset : {};
    switch (name) {
      case 'go': app.view = d.view; stopAuto(); save(); render(); window.scrollTo(0, 0); return;
      case 'next': return step(function (st) { return TM.advanceDay(st); });
      case 'week': return step(function (st) { for (var i = 0; i < 7; i++) { var r = TM.advanceDay(st); if (!r.ok) return r; if (st.pending.length) break; } return { ok: true }; });
      case 'until': return step(function (st) { return TM.advanceUntil(st, 30); });
      case 'auto':
        if (app.auto) { stopAuto(); render(); return; }
        app.auto = setInterval(function () {
          var st = app.state;
          if (!st || st.gameOver || st.pending.length) { stopAuto(); render(); return; }
          var r = TM.advanceDay(st);
          if (!r.ok) stopAuto();
          if (st.trucks.some(function (t) { return !t.sold && t.status === 'idle' && t.driverId; })) { stopAuto(); UI.toast('A truck needs a load'); }
          save(); render();
        }, 450);
        render(); return;
      case 'theme': {
        var root = document.documentElement, cur = root.getAttribute('data-theme');
        var dark = cur ? cur === 'dark' : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', dark ? 'light' : 'dark');
        try { localStorage.setItem('truemile.theme', dark ? 'light' : 'dark'); } catch (e) { /* ignore */ }
        return;
      }
      case 'decide': TM.resolveDecision(s, d.dec, d.opt); save(); render(); return;
      case 'show-decision': app.showDecision = true; render(); return;
      case 'close-modal': if (el.classList.contains('modal-bg') || el.tagName === 'BUTTON') { app.modalHtml = null; render(); } return;
      case 'lesson': {
        var l = TM.LESSONS.filter(function (x) { return x.id === d.id; })[0];
        if (l) { app.modalHtml = '<h2>' + UI.esc(l.title) + '</h2>' + l.body.map(function (p) { return '<p>' + UI.esc(p) + '</p>'; }).join(''); render(); }
        return;
      }
      case 'pick-truck': app.selTruck = d.truck; app.view = 'loads'; render(); return;
      case 'dispatch': return step(function (st) { return TM.dispatch(st, d.truck, d.load); });
      case 'reposition': { var c = document.getElementById('repo-city').value; return step(function (st) { return TM.reposition(st, d.truck, c); }); }
      case 'log-filter': app.logFilter = d.f; render(); return;
      case 'fin-sub': app.finSub = d.sub; render(); return;
      case 'toggle-loan': app.openLoan = app.openLoan === d.loan ? null : d.loan; render(); return;
      case 'payoff': return step(function (st) { return TM.payoffLoan(st, d.loan) ? { ok: true } : { ok: false, reason: 'Not enough cash.' }; });
      case 'quickpay': return step(function (st) { return TM.quickPay(st, d.ar) ? { ok: true } : { ok: false, reason: 'Quick pay unavailable.' }; });
      case 'spot-factor': return step(function (st) { TM.factorInvoice(st, d.ar); TM.log(st, 'info', 'Invoice factored', 'Cash now, minus a fee.'); return { ok: true }; });
      case 'open-credit': return step(function (st) { TM.openCredit(st); return { ok: true }; });
      case 'repay-credit': { var amt = +document.getElementById('repay-amt').value; return step(function (st) { TM.repayCredit(st, amt); return { ok: true }; }); }
      case 'contribute': {
        var pid = document.getElementById('contrib-partner').value, ca = +document.getElementById('contrib-amt').value;
        return step(function (st) { TM.contribute(st, pid, ca); return { ok: true }; });
      }
      case 'hire': return step(function (st) { var t = truck(st, d.truck); TM.hireDriver(st, t); return { ok: true }; });
      case 'assign-partner': return step(function (st) { TM.assignPartnerDriver(st, d.partner, truck(st, d.truck)); st.settings.partners.forEach(function (p) { if (p.id === d.partner) p.drives = true; }); return { ok: true }; });
      case 'let-go': case 'partner-off': return step(function (st) {
        var t = truck(st, d.truck), drv = TM.driverOf(st, t);
        if (drv) {
          st.drivers = st.drivers.filter(function (x) { return x !== drv; });
          if (drv.type === 'partner') st.settings.partners.forEach(function (p) { if (p.id === drv.partnerId) p.drives = false; });
          var owed = st.accruals.wages[drv.id] || 0;
          if (owed) { TM.post(st, { id: 'driver_wages', desc: 'Final paycheck — ' + drv.name, cash: -owed, accrued: -owed, cf: 'op' }); st.accruals.wages[drv.id] = 0; }
          TM.log(st, 'info', drv.name + ' no longer drives ' + t.name, 'The truck is parked until it has a driver.');
        }
        t.driverId = null; return { ok: true };
      });
      case 'sell': if (!confirm('Dispose of this truck? This cannot be undone.')) return; return step(function (st) { return TM.sellTruck(st, d.truck); });
      case 'dispatcher-on': return step(function (st) { st.settings.ops.dispatcherPct = +document.getElementById('disp-pct').value || 7; st.dispatcher = true; TM.log(st, 'info', 'Dispatcher hired', st.settings.ops.dispatcherPct + '% of gross revenue.'); st.boardDay = -1; TM.refreshBoards(st); return { ok: true }; });
      case 'dispatcher-off': return step(function (st) { st.dispatcher = false; st.settings.ops.dispatcherPct = 0; TM.log(st, 'info', 'Dispatcher let go', ''); return { ok: true }; });
      case 'factoring-on': return step(function (st) { st.settings.ops.factoringPct = +document.getElementById('fact-pct').value || 3; st.settings.ops.factoring = true; TM.log(st, 'info', 'Factoring started', 'Future invoices are sold for cash at delivery.'); return { ok: true }; });
      case 'factoring-off': return step(function (st) { st.settings.ops.factoring = false; return { ok: true }; });
      case 'buy-truck': return step(function (st) {
        var b = app.buy, mk = TM.TRUCK_MARKET.filter(function (x) { return x.id === b.marketId; })[0];
        var t = TM.acquireTruck(st, {
          marketId: mk.id, price: mk.price, acq: b.acq, downPct: +b.downPct, apr: +b.apr, termMonths: +b.termMonths, leaseWeekly: +b.leaseWeekly,
          leaseIncludesMaint: !!b.leaseIncludesMaint, city: st.settings.homeCity,
          trailer: { type: st.settings.trailer.type, acq: b.trailerAcq, price: TM.TRAILER_TYPES[st.settings.trailer.type].price, rent: st.settings.trailer.rent }
        });
        UI.toast(t.name + ' added in ' + TM.cityById(t.city).name + ' — it needs a driver.');
        return { ok: true };
      });
      case 'start-game': {
        stopAuto();
        if (app.state && !confirm('Start a new simulation? The current game will be replaced.')) return;
        var exps = app.expList();
        var st = TM.newGame(app.draft, { expenses: exps });
        if (app.draft.startWithCredit) { TM.openCredit(st); }
        app.state = st; app.draftExp = null; app.view = 'dashboard'; app.selTruck = null;
        save(); render(); window.scrollTo(0, 0); return;
      }
      case 'reset-draft': if (!confirm('Reset all setup values to the example scenario?')) return; app.draft = TM.defaultSettings(); app.draft.homeCity = 'DAL'; save(); render(); return;
      case 'add-partner': app.draft.partners.push({ id: 'p' + (Date.now() % 100000), name: 'Partner ' + String.fromCharCode(65 + app.draft.partners.length), pct: 0, capital: 0, drives: false }); save(); render(); return;
      case 'del-partner': app.draft.partners.splice(+d.i, 1); save(); render(); return;
      case 'fund-gap': {
        var add = +d.amt;
        app.draft.partners.forEach(function (p) { p.capital = Math.round((+p.capital || 0) + add * (+p.pct || 0) / 100); });
        save(); render(); return;
      }
      case 'exp-reset':
        if (!confirm('Reset every expense to its default amount and on/off state?')) return;
        if (app.state) app.state.expenses = TM.clone(TM.EXPENSES); else app.draftExp = TM.clone(TM.EXPENSES);
        save(); render(); return;
      case 'exp-del': {
        var list = app.expList(), i = list.findIndex(function (e) { return e.id === d.id; });
        if (i >= 0) list.splice(i, 1); save(); render(); return;
      }
      case 'exp-add': {
        var name = document.getElementById('cx-name').value.trim();
        if (!name) { UI.toast('Give the expense a name'); return; }
        var f = document.getElementById('cx-f').value;
        app.expList().push({
          id: 'custom_' + Date.now(), cat: document.getElementById('cx-cat').value, name: name, a: +document.getElementById('cx-a').value || 0, f: f,
          s: document.getElementById('cx-s').value, k: 'expense', fv: document.getElementById('cx-fv').value, src: 'private', est: true, w: null, on: true,
          desc: 'Custom item', every: 0, atStart: false, maint: false, loadedOnly: false, pct: false, param: null, unit: null, custom: true
        });
        UI.toast('Added "' + name + '"'); save(); render(); return;
      }
    }
  }
  function truck(st, id) { return st.trucks.filter(function (t) { return t.id === id; })[0]; }

  function onClick(e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    if (el.dataset.action === 'close-modal' && el.classList.contains('modal-bg') && e.target !== el) return;
    act(el.dataset.action, el);
  }

  function setPath(obj, path, val) {
    var p = path.split('.'), o = obj;
    for (var i = 0; i < p.length - 1; i++) o = o[p[i]];
    o[p[p.length - 1]] = val;
  }
  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj); }
  function valueOf(el, prev) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number' || typeof prev === 'number') { var v = parseFloat(el.value); return isNaN(v) ? 0 : v; }
    return el.value;
  }

  function onChange(e) {
    var el = e.target, d = el.dataset;
    if (d.draft) {
      setPath(app.draft, d.draft, valueOf(el, getPath(app.draft, d.draft)));
      if (d.draft === 'authority' && app.draft.authority === 'own' && app.draft.carrier) app.draft.carrier.insChargeback = false;
      save(); render(); return;
    }
    if (d.set && app.state) { setPath(app.state.settings, d.set, valueOf(el, getPath(app.state.settings, d.set))); save(); render(); return; }
    if (d.buy) { app.buy[d.buy] = valueOf(el, app.buy[d.buy]); render(); return; }
    if (d.expOn) { var x = app.expList().filter(function (z) { return z.id === d.expOn; })[0]; if (x) x.on = el.checked; save(); render(); return; }
    if (d.expA) { var y = app.expList().filter(function (z) { return z.id === d.expA; })[0]; if (y) y.a = parseFloat(el.value) || 0; save(); render(); return; }
    if (el.id === 'driver-cpm' && app.state) { app.state.settings.ops.driverCpm = parseFloat(el.value) || 0.6; save(); return; }
    switch (d.action) {
      case 'pick-model': TM.applyModel(app.draft, el.value); save(); render(); return;
      case 'pick-market': {
        var mk = TM.TRUCK_MARKET.filter(function (x) { return x.id === el.value; })[0], t = app.draft.truck;
        t.marketId = mk.id; t.price = mk.price; t.mpg = mk.mpg; t.condition = mk.condition; t.odometer = mk.odometer; t.ageYears = mk.ageYears; t.lifeYears = mk.life;
        save(); render(); return;
      }
      case 'load-sort': app.loadSort = el.value; render(); return;
      case 'exp-cat': (app.expFilter = app.expFilter || { cat: 'all', q: '', applicable: false }).cat = el.value; render(); return;
      case 'exp-applicable': (app.expFilter = app.expFilter || { cat: 'all', q: '', applicable: false }).applicable = el.checked; render(); return;
    }
  }

  var qTimer = null;
  function onInput(e) {
    var el = e.target, a = el.dataset.action;
    if (a !== 'exp-q' && a !== 'ledger-q') return;
    clearTimeout(qTimer);
    qTimer = setTimeout(function () {
      if (a === 'exp-q') (app.expFilter = app.expFilter || { cat: 'all', q: '', applicable: false }).q = el.value;
      else app.ledgerQ = el.value;
      render();
      var again = document.querySelector('[data-action="' + a + '"]');
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(globalThis.TM = globalThis.TM || {});
