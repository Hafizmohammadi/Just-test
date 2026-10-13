# TrueMile Transport LLC — Trucking Business Simulator

An interactive simulator for learning how a small U.S. trucking company makes (and loses) money. You start TrueMile Transport LLC with limited capital, finance a truck, book freight, pay every bill, wait for brokers to pay, handle breakdowns and claims, pay the partners, and try to grow from one truck to a fleet without running out of cash.

All figures are **editable examples for learning**. They are not market quotes or legal, tax, insurance or financial advice.

## Run it

No build step and no dependencies. Open `truemile/index.html` in a browser, or serve the folder:

```sh
npx serve truemile      # or: python3 -m http.server -d truemile
```

The game saves itself in the browser's `localStorage`.

Run the engine tests with `node --test truemile/tests/`.

## What's inside

| Area | What you can do |
|---|---|
| **Setup & startup planner** | Set the company, partners (ownership %, capital, who drives), business model, truck (new/used, cash/loan/lease/personal), loan terms and balloon, trailer type and how you get it, operating assumptions and partner pay. The planner itemizes every dollar spent before the first load and works out the cash you need to survive until the first payment arrives. It flags a shortfall and suggests fixes. |
| **6 business models** | Owner-operator with a personal truck on a carrier · owner-operator leasing a truck · own truck with own authority · own truck leased onto a carrier · own truck with a hired driver · fleet. Each one changes which expenses apply, how revenue is settled and how fast cash arrives. |
| **Expense database** | About 190 items in 15 categories: formation, compliance, acquisition & financing, trailer, fuel, insurance, maintenance, payroll, trip, freight acquisition, admin, taxes, reserves and events. Each item has an amount, timing, scale, fixed/variable flag, government/private source and estimate flag. Items can be turned on and off, edited and added. Rules decide which items apply to your setup so no cost is counted twice. |
| **Load board** | Loads are generated from a market model covering 35 cities: lane strength, seasonality, short-haul premiums, trailer type, broker credit and payment days, direct shippers with a separate fuel surcharge, and risk tags. Each load shows an estimate of fuel, variable costs, non-payment risk, fixed-cost share, true profit and profit per day. You can deadhead to a better market. |
| **Daily simulation** | Diesel is priced by state and charged per mile driven. Also simulated: DEF, idle fuel, IFTA quarterly true-up, maintenance due at mileage intervals, tire sets, age-adjusted repairs, weekly 34-hour resets, detention, lumpers (pass-through), late penalties, driver payroll with FICA/FUTA/SUTA, guaranteed payments vs draws, quarterly tax distributions, insurance down payment plus installments and renewals, loan amortization, depreciation, and line-of-credit interest. |
| **Events & decisions** | Tire failures, breakdowns, major repairs (dealer vs independent shop vs warranty), accidents (file a claim or pay out of pocket), roadside inspections, weather, fuel theft, cargo claims, late-paying or bankrupt brokers, unexpected bills, driver turnover. |
| **Finances** | Accrual P&L by month with operating metrics, cash-flow statement, balance sheet that always balances, receivables with quick pay and spot factoring, loan amortization schedules and early payoff, partner capital accounts, line of credit, capital contributions and a searchable ledger. |
| **Compare** | Business models side by side, partner-driver vs hired driver, down-payment × loan-term grid, and a sensitivity table for rate vs diesel price. |
| **Learn** | Lessons such as profit vs cash, CPM and break-even, deadhead, reserves, broker credit, loan principal vs interest, draws vs guaranteed payments, own authority vs leased on, and IFTA. Also a glossary and 13 challenges. |

## How the accounting works

Every transaction goes through a double-entry check: `cash + AR + deposits + equipment − accumulated depreciation = debt + accrued bills + contributed capital − draws + profit`. An entry that doesn't balance throws an error. As a result:

- Loan **principal** reduces cash and debt but is not an expense. **Interest** is an expense.
- **Depreciation** is an expense that moves no cash.
- **Revenue** is recorded at delivery and becomes **cash** only when the broker pays (or when you factor or use quick pay).
- **Partner draws** and **tax distributions** reduce cash and equity but are not expenses. **Guaranteed payments** are expenses.
- **Refundable deposits** are assets. **Lumper fees** are pass-throughs.

## Simplifications

- Insurance uses a down payment plus 10 monthly installments.
- Book depreciation is straight-line.
- Payroll taxes use flat rates.
- IFTA splits each loaded trip half and half between the origin and destination states.
- Partner income tax is handled as quarterly tax distributions. The LLC is treated as a pass-through partnership.
- Regulatory fees vary by state, weight, fleet size and year, so verify current amounts before using them for real decisions.

## Code layout

```
truemile/
  index.html, css/styles.css
  js/data/     geo (cities, diesel offsets, fuel tax), models (business models, trucks, trailers, brokers),
               expenses (the expense database), lessons (lessons, glossary, challenges)
  js/engine/   core (RNG, settings, applicability, ledger), finance (amortization, depreciation),
               sim (setup, assets, drivers, recurring bills, daily clock), loads (market, dispatch, delivery, AR),
               events (random events & decisions), project (projections, planner, comparisons)
  js/ui/       util (formatting, charts), views, finance, planner
  js/app.js    state, persistence, actions
  tests/       Node tests for the engine
```
