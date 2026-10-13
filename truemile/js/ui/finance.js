/* TrueMile views: financial statements, receivables, loans, ledger, partners & funding. */
(function (TM) {
  'use strict';
  var UI = TM.UI, esc = UI.esc, m = UI.m, V = UI.views;

  var SUBS = [['pl', 'Profit & loss'], ['cf', 'Cash flow'], ['bs', 'Balance sheet'], ['ar', 'Receivables'], ['loans', 'Loans'], ['partners', 'Partners & funding'], ['ledger', 'Ledger']];

  V.finances = function (state, app) {
    var sub = app.finSub || 'pl';
    var h = '<div class="steps">' + SUBS.map(function (s) { return '<button class="btn sm' + (s[0] === sub ? ' primary' : '') + '" data-action="fin-sub" data-sub="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div>';
    return h + (FN[sub] || FN.pl)(state, app);
  };

  function groupOf(state, id) {
    if (TM.REVENUE_LINES[id]) return 'REV';
    var e = TM.exp(state, id);
    return e ? e.cat : 'X';
  }
  function catName(c) {
    var x = TM.EXPENSE_CATEGORIES.filter(function (k) { return k.id === c; })[0];
    return x ? x.name : 'Other';
  }

  var FN = {};
  FN.pl = function (state) {
    var keys = Object.keys(state.agg).sort();
    var cols = keys.slice(-6);
    var all = {}, byMonth = {};
    keys.forEach(function (k) {
      Object.keys(state.agg[k].pnl).forEach(function (id) { all[id] = (all[id] || 0) + state.agg[k].pnl[id]; });
    });
    cols.forEach(function (k) { byMonth[k] = state.agg[k].pnl; });
    var ids = Object.keys(all);
    var rev = ids.filter(function (id) { return groupOf(state, id) === 'REV'; });
    var cats = {};
    ids.forEach(function (id) { var g = groupOf(state, id); if (g !== 'REV') (cats[g] = cats[g] || []).push(id); });
    function cell(v, neg) { return '<td class="num">' + (v ? (neg ? m(-v) : m(v)) : '<span class="muted">—</span>') + '</td>'; }
    var head = '<tr><th>Line</th>' + cols.map(function (k) { return '<th class="num">' + TM.monthLabel(k) + '</th>'; }).join('') + '<th class="num">To date</th></tr>';
    var rows = '<tr class="sub"><td colspan="' + (cols.length + 2) + '">Revenue</td></tr>';
    var sumRow = function (list, neg) {
      return cols.map(function (k) { return list.reduce(function (a, id) { return a + (byMonth[k][id] || 0); }, 0); }).map(function (v) { return '<td class="num">' + (neg ? m(-v) : m(v)) + '</td>'; }).join('') +
        '<td class="num">' + (neg ? m(-list.reduce(function (a, id) { return a + all[id]; }, 0)) : m(list.reduce(function (a, id) { return a + all[id]; }, 0))) + '</td>';
    };
    rev.forEach(function (id) { rows += '<tr><td class="indent">' + esc(TM.expName(state, id)) + '</td>' + cols.map(function (k) { return cell(byMonth[k][id]); }).join('') + cell(all[id]) + '</tr>'; });
    rows += '<tr class="total"><td>Total revenue</td>' + sumRow(rev) + '</tr>';
    rows += '<tr class="sub"><td colspan="' + (cols.length + 2) + '">Expenses</td></tr>';
    TM.EXPENSE_CATEGORIES.forEach(function (c) {
      var list = cats[c.id];
      if (!list) return;
      list.sort(function (a, b) { return all[a] - all[b]; });
      rows += '<tr><td><details><summary>' + esc(c.name) + '</summary>' + list.map(function (id) { return '<div class="small t2" style="padding-left:12px">' + esc(TM.expName(state, id)) + ': ' + m(-all[id]) + '</div>'; }).join('') + '</details></td>' + sumRow(list, true) + '</tr>';
    });
    var expIds = ids.filter(function (id) { return groupOf(state, id) !== 'REV'; });
    rows += '<tr class="total"><td>Total expenses</td>' + sumRow(expIds, true) + '</tr>';
    rows += '<tr class="total"><td>Net profit (loss)</td>' + cols.map(function (k) { var v = Object.keys(byMonth[k]).reduce(function (a, id) { return a + byMonth[k][id]; }, 0); return '<td class="num">' + UI.signed(v) + '</td>'; }).join('') + '<td class="num">' + UI.signed(state.bal.pnl) + '</td></tr>';
    // operating metrics
    rows += '<tr class="sub"><td colspan="' + (cols.length + 2) + '">Operating metrics</td></tr>';
    function metric(label, fn, fmt) {
      return '<tr><td class="indent">' + label + '</td>' + cols.map(function (k) { var v = fn(state.agg[k]); return '<td class="num">' + (v === null ? '—' : fmt(v)) + '</td>'; }).join('') + '<td></td></tr>';
    }
    var revOf = function (a) { return rev.reduce(function (s, id) { return s + (a.pnl[id] || 0); }, 0); };
    var expOf = function (a) { return -expIds.reduce(function (s, id) { return s + (a.pnl[id] || 0); }, 0); };
    rows += metric('Total miles', function (a) { return a.miles; }, function (v) { return Math.round(v).toLocaleString(); });
    rows += metric('Loads delivered', function (a) { return a.loads; }, String);
    rows += metric('Revenue / loaded mile', function (a) { return a.loaded ? revOf(a) / a.loaded : null; }, function (v) { return '$' + v.toFixed(2); });
    rows += metric('Cost / total mile', function (a) { return a.miles ? expOf(a) / a.miles : null; }, function (v) { return '$' + v.toFixed(2); });
    rows += metric('Operating ratio', function (a) { var r = revOf(a); return r ? expOf(a) / r : null; }, function (v) { return TM.pct(v); });
    return '<div class="card"><h3>Profit & loss statement</h3><p class="small t2">Accrual basis: revenue counts when delivered, wages and partner pay when earned. Loan principal, partner draws and equipment purchases are not expenses — see the Cash flow tab.</p>' +
      '<div class="table-wrap"><table>' + head + rows + '</table></div></div>';
  };

  FN.cf = function (state) {
    var keys = Object.keys(state.agg).sort();
    var cols = keys.slice(-12);
    var row = function (label, f, cls) {
      return '<tr class="' + (cls || '') + '"><td>' + label + '</td>' + cols.map(function (k) { return '<td class="num">' + UI.signed(f(state.agg[k])) + '</td>'; }).join('') + '</tr>';
    };
    var totals = keys.reduce(function (t, k) { var c = state.agg[k].cf; t.op += c.op; t.inv += c.inv; t.fin += c.fin; return t; }, { op: 0, inv: 0, fin: 0 });
    return '<div class="card"><h3>Cash flow statement</h3><p class="small t2">Where cash actually came from and went. Operating = running the trucks (collections, fuel, bills). Investing = equipment and deposits. Financing = partner capital, loans, principal repayments, draws.</p>' +
      '<div class="table-wrap"><table><tr><th></th>' + cols.map(function (k) { return '<th class="num">' + TM.monthLabel(k) + '</th>'; }).join('') + '</tr>' +
      row('Operating activities', function (a) { return a.cf.op; }) + row('Investing activities', function (a) { return a.cf.inv; }) + row('Financing activities', function (a) { return a.cf.fin; }) +
      row('Net change in cash', function (a) { return a.cf.op + a.cf.inv + a.cf.fin; }, 'total') + row('Ending cash', function (a) { return a.cashEnd; }) + '</table></div>' +
      '<div class="kv" style="margin-top:12px;max-width:420px"><span>Operating, to date</span><span>' + UI.signed(totals.op) + '</span><span>Investing, to date</span><span>' + UI.signed(totals.inv) + '</span><span>Financing, to date</span><span>' + UI.signed(totals.fin) + '</span><span><b>Cash now</b></span><span><b>' + UI.signed(state.bal.cash) + '</b></span></div></div>';
  };

  FN.bs = function (state) {
    var b = state.bal;
    var wages = Object.keys(state.accruals.wages).reduce(function (a, k) { return a + state.accruals.wages[k]; }, 0);
    var gp = Object.keys(state.accruals.gp).reduce(function (a, k) { return a + state.accruals.gp[k]; }, 0);
    var loans = state.loans.filter(function (l) { return l.balance > 0; });
    var r = function (l, v, cls) { return '<tr class="' + (cls || '') + '"><td>' + l + '</td><td class="num">' + UI.signed(v) + '</td></tr>'; };
    var assets = b.cash + b.ar + b.dep + b.fixed - b.accDep;
    var liab = b.debt + b.accrued;
    var h = '<div class="grid g2"><div class="card"><h3>Assets</h3><table>' + r('Cash', b.cash) + r('Accounts receivable', b.ar) + r('Refundable deposits', b.dep) +
      r('Equipment at cost', b.fixed) + r('Less accumulated depreciation', -b.accDep) + r('Total assets', assets, 'total') + '</table>' +
      '<p class="small t2">Cash earmarked for maintenance: ' + m(state.reserves.maint) + ' (part of cash, not a separate asset).</p></div>';
    h += '<div class="card"><h3>Liabilities & equity</h3><table>' +
      loans.map(function (l) { return r(esc(l.name), l.balance); }).join('') + (state.credit.balance ? r('Line of credit', state.credit.balance) : '') +
      (wages ? r('Wages payable', wages) : '') + (gp ? r('Partner guaranteed payments owed', gp) : '') + r('Total liabilities', liab, 'total') +
      state.settings.partners.map(function (p) {
        var eq = state.partnerEq[p.id];
        return r(esc(p.name) + ' capital account (' + p.pct + '%)', eq.contrib - eq.draws + b.pnl * p.pct / 100);
      }).join('') + r('Total equity', b.contrib - b.draws + b.pnl, 'total') + r('Liabilities + equity', liab + b.contrib - b.draws + b.pnl, 'total') + '</table>' +
      '<p class="small ' + (Math.abs(TM.balanceCheck(state)) < 0.05 ? 'pos' : 'neg') + '">Balance check: assets − liabilities − equity = ' + m(TM.balanceCheck(state), 2) + '</p></div></div>';
    return h;
  };

  FN.ar = function (state) {
    var open = state.ar.filter(function (a) { return a.status === 'open' || a.status === 'disputed'; });
    var paid = state.ar.filter(function (a) { return a.paidDay !== undefined; });
    var dso = paid.length ? paid.reduce(function (s, a) { return s + (a.paidDay - a.invoiceDay); }, 0) / paid.length : 0;
    var h = '<div class="grid g4">' + UI.stat('Open receivables', m(state.bal.ar), open.length + ' invoices') + UI.stat('Average days to collect', paid.length ? dso.toFixed(0) + ' days' : '—', 'Across ' + paid.length + ' paid invoices') +
      UI.stat('Bad debt written off', m(state.stats.badDebt), 'Unpaid invoices') + '</div>';
    h += '<div class="card" style="margin-top:14px"><h3>Open invoices</h3><div class="table-wrap"><table><tr><th>Invoice</th><th>Payer</th><th class="num">Amount</th><th>Invoiced</th><th>Expected</th><th class="num">Days out</th><th>Status</th><th></th></tr>' +
      (open.length ? open.map(function (a) {
        var b = TM.BROKERS.filter(function (x) { return x.id === a.payerId; })[0];
        return '<tr><td>' + esc(a.id) + '</td><td>' + esc(a.payerName) + ' <span class="small muted">(credit ' + a.credit + ')</span></td><td class="num">' + m(a.amount) + '</td><td>' + esc(TM.fmtDate(state, a.invoiceDay)) + '</td><td>' + esc(TM.fmtDate(state, a.dueDay)) + '</td><td class="num">' + (state.day - a.invoiceDay) + '</td><td>' +
          (a.status === 'disputed' ? UI.badge('Not paying', 'bad') : a.late ? UI.badge('Late', 'warn') : UI.badge('Open', 'info')) + '</td><td class="row">' +
          (a.status === 'open' && b ? '<button class="btn sm" data-action="quickpay" data-ar="' + a.id + '">Quick pay (' + (b.quickPay * 100).toFixed(1) + '%: ' + m(a.amount * b.quickPay) + ')</button>' : '') +
          (a.status === 'open' && a.payerId !== 'carrier' ? '<button class="btn sm" data-action="spot-factor" data-ar="' + a.id + '">Factor (' + (state.settings.ops.factoringPct + 1) + '%)</button>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="8" class="muted">No open invoices.</td></tr>') + '</table></div></div>';
    h += '<div class="card" style="margin-top:14px"><h3>Recently paid</h3><div class="table-wrap"><table><tr><th>Payer</th><th class="num">Amount</th><th>Invoiced</th><th>Paid</th><th class="num">Days</th><th>How</th></tr>' +
      paid.slice(-25).reverse().map(function (a) {
        return '<tr><td>' + esc(a.payerName) + '</td><td class="num">' + m(a.amount) + '</td><td>' + esc(TM.fmtDate(state, a.invoiceDay)) + '</td><td>' + esc(TM.fmtDate(state, a.paidDay)) + '</td><td class="num">' + (a.paidDay - a.invoiceDay) + '</td><td>' + esc(a.status === 'factored' ? 'Factored' : a.status === 'bad' ? 'Written off' : 'Paid') + '</td></tr>';
      }).join('') + '</table></div></div>';
    return h;
  };

  FN.loans = function (state, app) {
    if (!state.loans.length) return '<div class="card">No loans. ' + (state.trucks.some(function (t) { return t.acq === 'lease'; }) ? 'Lease payments are operating expenses, not debt.' : '') + '</div>';
    return state.loans.map(function (l) {
      var rows = TM.amortize(l.principal, l.apr, l.termMonths, l.balloon);
      var open = app.openLoan === l.id;
      return '<div class="card" style="margin-bottom:14px"><h3>' + esc(l.name) + ' ' + (l.balance <= 0 ? UI.badge('Paid off', 'good') : '') + '</h3>' +
        '<div class="kv" style="max-width:520px"><span>Original principal</span><span>' + m(l.principal) + '</span><span>APR · term</span><span>' + l.apr + '% · ' + l.termMonths + ' months</span>' +
        '<span>Monthly payment</span><span>' + m(l.payment, 2) + '</span>' + (l.balloon ? '<span>Balloon at end</span><span>' + m(l.balloon) + '</span>' : '') +
        '<span>Payments made</span><span>' + l.paymentsMade + '</span><span>Interest paid so far (expense)</span><span>' + m(l.interestPaid, 2) + '</span>' +
        '<span>Balance</span><span>' + m(l.balance, 2) + '</span><span>Total interest over the loan</span><span>' + m(rows.reduce(function (a, r) { return a + r.interest; }, 0)) + '</span></div>' +
        '<div class="row" style="margin-top:8px"><button class="btn sm" data-action="toggle-loan" data-loan="' + l.id + '">' + (open ? 'Hide' : 'Show') + ' amortization schedule</button>' +
        (l.balance > 0 ? '<button class="btn sm" data-action="payoff" data-loan="' + l.id + '"' + (state.bal.cash < l.balance ? ' disabled' : '') + '>Pay off ' + m(l.balance) + '</button>' : '') + '</div>' +
        (open ? '<div class="table-wrap" style="max-height:360px;overflow-y:auto;margin-top:8px"><table><tr><th>#</th><th class="num">Payment</th><th class="num">Interest (expense)</th><th class="num">Principal (not expense)</th><th class="num">Balance</th></tr>' +
          rows.map(function (r) { return '<tr' + (r.n <= l.paymentsMade ? ' class="off"' : '') + '><td>' + r.n + '</td><td class="num">' + m(r.payment, 2) + '</td><td class="num">' + m(r.interest, 2) + '</td><td class="num">' + m(r.principal, 2) + '</td><td class="num">' + m(r.balance, 2) + '</td></tr>'; }).join('') + '</table></div>' : '') + '</div>';
    }).join('');
  };

  FN.partners = function (state) {
    var s = state.settings, c = s.comp, b = state.bal;
    var h = '<div class="grid g2"><div class="card"><h3>Partners</h3><div class="table-wrap"><table><tr><th>Partner</th><th class="num">Own</th><th class="num">Contributed</th><th class="num">Drawn</th><th class="num">Share of profit</th><th class="num">Capital account</th><th class="num">Pay owed</th></tr>' +
      s.partners.map(function (p) {
        var eq = state.partnerEq[p.id], share = b.pnl * p.pct / 100;
        return '<tr><td>' + esc(p.name) + (p.drives ? ' ' + UI.badge('drives', 'info') : '') + '</td><td class="num">' + p.pct + '%</td><td class="num">' + m(eq.contrib) + '</td><td class="num">' + m(eq.draws) + '</td><td class="num">' + UI.signed(share) + '</td><td class="num">' + UI.signed(eq.contrib - eq.draws + share) + '</td><td class="num">' + m(state.accruals.gp[p.id] || 0) + '</td></tr>';
      }).join('') + '</table></div>' +
      '<p class="small t2">Each partner is taxed personally on their share of profit (Schedule K-1) — whether or not cash was distributed. Guaranteed payments are company expenses; draws are not.</p></div>';

    h += '<div class="card"><h3>Compensation policy</h3><div class="form-grid">' +
      '<label class="field">Method<select data-set="comp.mode">' + [['guaranteed', 'Guaranteed payments (salary-like)'], ['draw', 'Fixed weekly draws'], ['profit', 'Share of monthly profit'], ['none', 'No pay (reinvest)']].map(function (o) { return '<option value="' + o[0] + '"' + (c.mode === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      (c.mode === 'guaranteed' ? '<label class="field">Driving partner $/mile<input type="number" step="0.01" data-set="comp.driverGpCpm" value="' + c.driverGpCpm + '"></label><label class="field">Managing partner $/week<input type="number" data-set="comp.mgrGpWeekly" value="' + c.mgrGpWeekly + '"></label>' : '') +
      (c.mode === 'draw' ? '<label class="field">Total weekly draw (split by %)<input type="number" data-set="comp.drawWeekly" value="' + c.drawWeekly + '"></label>' : '') +
      (c.mode === 'profit' ? '<label class="field">% of last month\'s profit<input type="number" data-set="comp.profitSharePct" value="' + c.profitSharePct + '"></label>' : '') +
      '<label class="field">Keep at least this much cash before paying partners<input type="number" data-set="comp.minCash" value="' + c.minCash + '"></label>' +
      '<label class="field">Quarterly tax distribution (% of profit)<input type="number" data-set="tax.setAsidePct" value="' + s.tax.setAsidePct + '"></label></div>' +
      '<p class="small t2">If a partner drives for free, compare with a hired driver at ' + Math.round(s.ops.driverCpm * 100) + '¢/mile plus payroll taxes — that is what the business must cover to be truly profitable.</p></div></div>';

    h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h3>Line of credit</h3>' +
      (state.credit.open ? '<div class="kv"><span>Limit</span><span>' + m(state.credit.limit) + '</span><span>Balance</span><span>' + m(state.credit.balance) + '</span><span>APR</span><span>' + state.credit.apr + '%</span></div>' +
        '<div class="row" style="margin-top:8px"><input type="number" id="repay-amt" value="' + Math.round(Math.min(state.credit.balance, Math.max(0, b.cash))) + '" style="width:120px"><button class="btn" data-action="repay-credit">Repay</button></div>'
        : '<p class="small t2">A ' + m(state.credit.limit) + ' line at ' + state.credit.apr + '% APR. Draws automatically if cash goes negative; interest is charged monthly. Open it before you need it.</p><button class="btn primary" data-action="open-credit">Open line of credit</button>') + '</div>' +
      '<div class="card"><h3>Partner capital</h3><p class="small t2">Partners can put more money in. Contributions raise equity — they are not revenue and not a loan.</p><div class="row"><select id="contrib-partner">' +
      s.partners.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('') + '</select><input type="number" id="contrib-amt" value="5000" style="width:120px"><button class="btn primary" data-action="contribute">Contribute</button></div></div></div>';
    return h;
  };

  FN.ledger = function (state, app) {
    var q = (app.ledgerQ || '').toLowerCase();
    var rows = state.ledger.slice().reverse().filter(function (e) { return !q || (e.desc || '').toLowerCase().indexOf(q) >= 0; }).slice(0, 400);
    return '<div class="card"><h3>General ledger <input type="search" placeholder="Filter…" data-action="ledger-q" value="' + esc(app.ledgerQ || '') + '" style="max-width:220px"></h3>' +
      '<p class="small t2">Every transaction and its effect on cash and on profit. Many cash movements (principal, draws, equipment, collections) have no profit effect — and depreciation affects profit without moving cash.</p>' +
      '<div class="table-wrap"><table><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Cash</th><th class="num">Profit effect</th><th>Type</th></tr>' +
      rows.map(function (e) {
        var g = groupOf(state, e.id);
        return '<tr><td>' + esc(TM.fmtDate(state, e.day)) + '</td><td>' + esc(e.desc) + '</td><td class="small t2">' + esc(g === 'REV' ? 'Revenue' : catName(g)) + '</td><td class="num">' + (e.cash ? UI.signed(e.cash, 2) : '') + '</td><td class="num">' + (e.pnl ? UI.signed(e.pnl, 2) : '') + '</td><td class="small muted">' +
          esc(e.cf === 'fin' ? 'financing' : e.cf === 'inv' ? 'investing' : e.cash ? 'operating' : e.accDep ? 'non-cash' : e.ar ? 'receivable' : 'accrual') + '</td></tr>';
      }).join('') + '</table></div></div>';
  };
})(globalThis.TM = globalThis.TM || {});
