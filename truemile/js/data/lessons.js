/* TrueMile — lessons, glossary and challenges. */
(function (TM) {
  'use strict';

  TM.LESSONS = [
    { id: 'profit-vs-cash', title: 'Why a profitable trucking company can run out of cash',
      body: [
        'Revenue is recorded when you deliver. Cash arrives when the broker pays — often 30 to 45 days later. In between, you have already paid for diesel, the driver, insurance and the truck note.',
        'Loan principal, partner draws and tax distributions all take cash but never appear as expenses. Depreciation is the reverse: an expense with no cash leaving.',
        'Fixes: start with enough working capital, use quick pay or factoring for the first months, keep a line of credit open before you need it, and do not pay out profit you have not collected.'
      ] },
    { id: 'cpm', title: 'Cost per mile and break-even rate',
      body: [
        'Cost per mile (CPM) = all expenses ÷ all miles (loaded + empty). Break-even rate = all expenses ÷ loaded miles — because only loaded miles get paid.',
        'Fixed costs (truck note, insurance, plates) are spread over miles: drive fewer miles and your CPM goes up even though nothing got more expensive.',
        'Never accept a load without knowing your break-even rate. The Load Board estimates each load\'s contribution and its share of fixed costs.'
      ] },
    { id: 'deadhead', title: 'Deadhead: the miles nobody pays for',
      body: [
        'Every empty mile burns fuel, tires and driver time. A $2.50/mile load with 150 miles of deadhead can pay less per total mile than a $2.20 load picked up next door.',
        'Destinations matter too: Florida and the Northwest pay well inbound but have few outbound loads, so you often deadhead out or accept cheap freight to leave.'
      ] },
    { id: 'reserves', title: 'Maintenance and contingency reserves',
      body: [
        'Truck costs are lumpy: a set of tires (~$4,700), an aftertreatment repair or a turbo ($5–12k) arrive all at once.',
        'Set aside cents per mile (the maintenance reserve) so the money is there when the bill comes. Reserves are earmarked cash, not expenses.'
      ] },
    { id: 'credit', title: 'Broker credit and getting paid',
      body: [
        'Check every broker\'s credit score and days-to-pay before booking. A high rate from a 40-credit broker is a gamble.',
        'Quick pay trades a small fee (1.5–5%) for cash in days. Factoring buys all your invoices for 2–5%; non-recourse factoring also takes the risk of the broker not paying.'
      ] },
    { id: 'financing', title: 'Loan principal, interest and depreciation',
      body: [
        'Each truck payment has two parts: interest (an expense) and principal (repaying the debt — not an expense).',
        'Depreciation spreads the truck\'s cost over its useful life as a non-cash expense. Book and tax depreciation differ (tax rules like Section 179 or bonus depreciation can front-load it) — talk to a CPA.',
        'A bigger down payment means lower payments and less interest but leaves less cash to survive the first months.'
      ] },
    { id: 'partners', title: 'Paying the partners: draws vs guaranteed payments',
      body: [
        'In a multi-member LLC taxed as a partnership, partners are not employees. A guaranteed payment (fixed pay for services like driving) is deductible by the company. A draw or distribution is a withdrawal of profit — not an expense.',
        'If a partner drives for free, the company looks more profitable than it really is. Compare the result with the cost of a hired driver before deciding the business works.',
        'Partners owe income and self-employment tax on their share of profit whether or not cash is distributed — hence quarterly tax distributions.'
      ] },
    { id: 'models', title: 'Own authority vs leasing onto a carrier',
      body: [
        'Leased on: you give up a percentage (often 20–30%) but avoid authority filings and primary liability/cargo premiums, and get weekly settlements.',
        'Own authority: you keep the full rate but pay for insurance (highest for new authorities), compliance and wait 30+ days for broker payments.'
      ] },
    { id: 'ifta', title: 'IFTA and fuel taxes',
      body: [
        'Pump prices already include state fuel tax. IFTA redistributes that tax between states based on where you drove. If you buy fuel in low-tax states but drive in high-tax states, you owe the difference each quarter.',
        'The simulator never charges fuel tax twice: it charges the pump price, then only the quarterly net difference.'
      ] }
  ];

  TM.GLOSSARY = [
    ['Deadhead', 'Empty miles driven without a paying load.'],
    ['RPM', 'Rate per mile — revenue divided by miles.'],
    ['CPM', 'Cost per mile — total expenses divided by total miles.'],
    ['Operating ratio', 'Expenses ÷ revenue. Below 100% means profit; trucking companies aim for 85–95%.'],
    ['Accounts receivable (AR)', 'Money customers owe you for delivered loads.'],
    ['DSO', 'Days sales outstanding — average days to collect an invoice.'],
    ['Factoring', 'Selling invoices to a factoring company for immediate cash minus a fee.'],
    ['Quick pay', 'A broker program paying early in exchange for a fee.'],
    ['Detention', 'Pay for waiting at a shipper/receiver beyond the free time (often 2 hours).'],
    ['Lumper', 'Third-party warehouse labor that unloads the truck; usually reimbursed.'],
    ['FSC', 'Fuel surcharge — extra pay tied to diesel prices.'],
    ['IRP', 'International Registration Plan — apportioned plates for interstate trucks.'],
    ['IFTA', 'International Fuel Tax Agreement — quarterly fuel-tax reconciliation between states.'],
    ['UCR', 'Unified Carrier Registration — annual federal-state fee for interstate carriers.'],
    ['BOC-3', 'Designation of process agents in every state, required for authority.'],
    ['HVUT / Form 2290', 'Federal Heavy Vehicle Use Tax on trucks ≥ 55,000 lbs.'],
    ['Guaranteed payment', 'Fixed pay to a partner for services; deductible by the partnership.'],
    ['Draw', 'A partner withdrawing profit from the company. Not an expense.'],
    ['Depreciation', 'Allocation of an asset\'s cost over its useful life. A non-cash expense.'],
    ['Working capital', 'Cash plus receivables minus short-term bills: the cushion that keeps trucks running.']
  ];

  TM.CHALLENGES = [
    { id: 'first_load', title: 'First load', desc: 'Deliver your first load.', test: function (s) { return s.stats.loads >= 1; } },
    { id: 'first_cash', title: 'Show me the money', desc: 'Collect your first customer payment.', test: function (s) { return s.ar.some(function (a) { return a.status === 'paid' || a.status === 'factored'; }); } },
    { id: 'survive90', title: 'Survive 90 days', desc: 'Stay in business for 90 days.', test: function (s) { return s.day >= 90 && !s.gameOver; } },
    { id: 'ten_loads_ontime', title: 'Reliable carrier', desc: 'Deliver 10 loads with no more than 1 late.', test: function (s) { return s.stats.loads >= 10 && s.stats.late <= 1; } },
    { id: 'profit_month', title: 'In the black', desc: 'Finish a calendar month with a net profit.', test: function (s) { return s.stats.profitableMonths >= 1; } },
    { id: 'three_profit', title: 'Consistent', desc: 'Three profitable months.', test: function (s) { return s.stats.profitableMonths >= 3; } },
    { id: 'reserve10k', title: 'Cushion', desc: 'Hold $10,000 cash with no line-of-credit balance.', test: function (s) { return s.bal.cash >= 10000 && s.credit.balance <= 0; } },
    { id: 'reserve25k', title: 'Rainy-day fund', desc: 'Hold $25,000 cash.', test: function (s) { return s.bal.cash >= 25000; } },
    { id: 'payoff', title: 'Debt free (truck)', desc: 'Pay off a truck loan.', test: function (s) { return s.loans.some(function (l) { return l.balance <= 0 && !l.trailer; }); } },
    { id: 'hire', title: 'Employer', desc: 'Hire your first driver.', test: function (s) { return s.drivers.some(function (d) { return d.type === 'hired'; }); } },
    { id: 'second_truck', title: 'Fleet owner', desc: 'Operate two trucks at once.', test: function (s) { return s.trucks.filter(function (t) { return !t.sold; }).length >= 2; } },
    { id: 'year_one', title: 'One year in', desc: 'Complete a full year without going bankrupt.', test: function (s) { return s.day >= 365 && !s.gameOver; } },
    { id: 'equity50', title: 'Building value', desc: 'Grow owners\' equity to $50,000.', test: function (s) { return (s.bal.contrib - s.bal.draws + s.bal.pnl) >= 50000; } }
  ];

  TM.evalChallenges = function (state) {
    TM.CHALLENGES.forEach(function (c) {
      if (state.challenges[c.id]) return;
      if (c.test(state)) {
        state.challenges[c.id] = state.day;
        TM.log(state, 'good', 'Challenge complete: ' + c.title, c.desc);
      }
    });
  };
})(globalThis.TM = globalThis.TM || {});
