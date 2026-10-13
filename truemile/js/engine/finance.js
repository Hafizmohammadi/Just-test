/* TrueMile — loan math, amortization and depreciation. */
(function (TM) {
  'use strict';

  // Monthly payment for principal pv, APR (percent), n months, optional balloon (amount due at end).
  TM.loanPayment = function (pv, aprPct, n, balloon) {
    var fv = balloon || 0;
    if (n <= 0) return pv;
    var r = aprPct / 100 / 12;
    if (r === 0) return (pv - fv) / n;
    return r * (pv - fv / Math.pow(1 + r, n)) / (1 - Math.pow(1 + r, -n));
  };

  // Full schedule: [{n, payment, interest, principal, balance}] — last row includes any balloon.
  TM.amortize = function (pv, aprPct, n, balloon) {
    var pmt = TM.loanPayment(pv, aprPct, n, balloon), r = aprPct / 100 / 12, bal = pv, rows = [];
    for (var i = 1; i <= n; i++) {
      var interest = bal * r;
      var principal = pmt - interest;
      if (i === n) principal = bal; // final payment clears the balance (incl. balloon & rounding)
      bal = bal - principal;
      rows.push({ n: i, payment: interest + principal, interest: interest, principal: principal, balance: Math.max(0, bal) });
    }
    return rows;
  };

  TM.loanSummary = function (pv, aprPct, n, balloon) {
    var rows = TM.amortize(pv, aprPct, n, balloon);
    var interest = rows.reduce(function (s, r) { return s + r.interest; }, 0);
    return { payment: TM.loanPayment(pv, aprPct, n, balloon), totalInterest: interest, totalPaid: pv + interest, rows: rows };
  };

  // Down-payment × term grid for the Compare view.
  TM.financingGrid = function (price, aprPct, downs, terms) {
    return downs.map(function (d) {
      var pv = price * (1 - d / 100);
      return {
        downPct: d, down: price * d / 100, principal: pv,
        cells: terms.map(function (t) {
          var s = TM.loanSummary(pv, aprPct, t, 0);
          return { term: t, payment: s.payment, interest: s.totalInterest, total: s.totalPaid + price * d / 100 };
        })
      };
    });
  };

  TM.monthlyDepreciation = function (cost, salvagePct, lifeYears) {
    if (!lifeYears) return 0;
    return Math.max(0, cost * (1 - salvagePct / 100)) / (lifeYears * 12);
  };
})(globalThis.TM = globalThis.TM || {});
