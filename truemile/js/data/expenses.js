/* TrueMile — the expense database.
 *
 * Every item: id, cat, name, desc, a (amount), f (frequency/timing), s (scale), k (kind),
 * fv (fixed|variable), src (gov|private|mixed), est (amount is an estimate), w (conditions), on (enabled by default).
 *
 * Frequencies the engine understands:
 *   startup      one-time, paid on day 0 (or when you buy a truck/trailer if s = 'truck'/'trailer')
 *   acquisition  paid when a truck is acquired (read by the purchase flow)
 *   hire         paid each time a driver is hired
 *   weekly | monthly | quarterly | annual   recurring (annual items with atStart are paid on day 0, then on each anniversary)
 *   insurance    annual premium: down payment at start, remainder in 10 monthly installments
 *   per_mile     $ per mile driven (all miles) — or loaded miles only when loadedOnly
 *   per_load     $ per delivered load
 *   interval     paid every `every` miles on each truck (lumpy, like real maintenance)
 *   event        cost used by random events (tire failure, breakdown…)
 *   engine       calculated by the simulator from settings (fuel, interest, wages…) — listed so nothing is hidden
 *   reserve      a cash earmark, not an expense
 *
 * Kinds: expense | deposit (refundable asset) | capital (added to asset cost) | reserve | passthrough | info
 * Scale: company | truck | driver | trailer | hired (per hired driver) | partnerDriver
 *
 * Conditions (w): authority 'own'|'carrier'; acq [truck acquisitions]; trailer [types]; trailerAcq [...];
 * hired true; partnerDriver true; owned true (company/partner owns at least one truck);
 * noCarrierIns true (suppressed when the carrier charges insurance back); carrierIns true.
 * Items with maint:true are suppressed for trucks on a full-service lease that includes maintenance.
 */
(function (TM) {
  'use strict';

  TM.EXPENSE_CATEGORIES = [
    { id: 'A', name: 'Business formation & startup' },
    { id: 'B', name: 'Authority, compliance & registration' },
    { id: 'C', name: 'Truck acquisition & financing' },
    { id: 'D', name: 'Trailer' },
    { id: 'E', name: 'Fuel & energy' },
    { id: 'F', name: 'Insurance' },
    { id: 'G', name: 'Truck maintenance, tires & repairs' },
    { id: 'H', name: 'Drivers & payroll' },
    { id: 'I', name: 'Trip & road expenses' },
    { id: 'J', name: 'Freight acquisition & settlement' },
    { id: 'K', name: 'Office, admin & professional' },
    { id: 'L', name: 'Taxes' },
    { id: 'R', name: 'Reserves (cash earmarks, not expenses)' },
    { id: 'X', name: 'Unexpected events (cost assumptions)' },
    { id: 'U', name: 'Custom items' }
  ];

  var list = [];
  function E(cat, id, name, a, f, opt) {
    var o = opt || {};
    list.push({
      id: id, cat: cat, name: name, a: a, f: f,
      s: o.s || 'company', k: o.k || 'expense', fv: o.fv || (f === 'per_mile' || f === 'per_load' || f === 'interval' || f === 'event' ? 'variable' : 'fixed'),
      src: o.src || 'private', est: o.est !== false, w: o.w || null, on: o.on !== false,
      desc: o.d || '', every: o.every || 0, atStart: !!o.atStart, maint: !!o.maint,
      loadedOnly: !!o.loadedOnly, pct: !!o.pct, param: o.param || null, unit: o.unit || null
    });
  }
  var OWN = { authority: 'own' }, CARRIER = { authority: 'carrier' };

  /* ---------- A. Business formation & startup (defaults total $3,500) ---------- */
  E('A', 'llc_filing', 'LLC formation filing fee', 150, 'startup', { src: 'gov', d: 'State filing fee to form the LLC. Ranges roughly $50–$500 depending on the state.' });
  E('A', 'reg_agent', 'Registered agent (first year)', 125, 'startup', { d: 'Commercial registered agent service. $0 if a partner serves as agent with a physical in-state address.' });
  E('A', 'biz_license', 'Business license', 75, 'startup', { src: 'gov', d: 'City/county business license where required. Many places charge nothing for a trucking LLC.' });
  E('A', 'ein_service', 'EIN application assistance (paid service)', 75, 'startup', { on: false, d: 'The IRS issues EINs free online. Only pay a service if you choose to.' });
  E('A', 'op_agreement', 'Operating agreement / legal documents', 200, 'startup', { d: 'Template or attorney-drafted operating agreement. Critical with two partners: ownership %, draws, buyout and deadlock rules.' });
  E('A', 'attorney', 'Business attorney consultation', 350, 'startup', { d: 'One-time review of the partnership terms, broker-carrier agreements and lease terms.' });
  E('A', 'acct_setup', 'Accounting setup & bookkeeping software', 250, 'startup', { d: 'Chart of accounts setup, software onboarding, IFTA mileage tracking setup.' });
  E('A', 'tax_consult', 'Initial tax consultation', 200, 'startup', { d: 'CPA advice on partnership taxation, guaranteed payments vs draws, depreciation elections.' });
  E('A', 'bank_fees', 'Business bank account opening fees', 0, 'startup', { d: 'Many banks open business accounts free; minimum-balance requirements may apply.' });
  E('A', 'cc_fees', 'Business credit card fees', 0, 'startup', { on: false, d: 'Annual fee for a business card, if any.' });
  E('A', 'eld_device', 'ELD purchase / setup', 250, 'startup', { s: 'truck', d: 'Electronic logging device hardware and activation (monthly subscription is in section B).' });
  E('A', 'dashcam', 'Dashcam installation', 250, 'startup', { s: 'truck', d: 'Road-facing dashcam. Often lowers insurance claims costs and helps in disputes.' });
  E('A', 'gps', 'GPS device (truck-specific)', 300, 'startup', { s: 'truck', on: false, d: 'Truck-routing GPS. Many drivers use a phone app instead.' });
  E('A', 'phone_mount', 'Phone mount & charging accessories', 60, 'startup', { s: 'truck' });
  E('A', 'safety_equip', 'Safety equipment (vest, gloves, glasses, boots)', 90, 'startup', { s: 'truck' });
  E('A', 'fire_ext', 'Fire extinguisher (DOT-rated)', 60, 'startup', { s: 'truck', d: 'Required on every power unit.' });
  E('A', 'triangles', 'Reflective warning triangles', 40, 'startup', { s: 'truck', d: 'Three bidirectional triangles are required.' });
  E('A', 'emergency_kit', 'Spare fuses, basic tools & emergency supplies', 340, 'startup', { s: 'truck' });
  E('A', 'loadboard_init', 'Initial load-board subscription (first month)', 150, 'startup', { d: 'First month of a load board (recurring cost is in section J).' });
  E('A', 'website', 'Website & domain', 150, 'startup');
  E('A', 'biz_email', 'Business email setup (first year)', 60, 'startup');
  E('A', 'decals', 'Logo & truck decals (USDOT number display)', 500, 'startup', { d: 'Company name and USDOT number must be displayed on both sides of the power unit.' });
  E('A', 'marketing', 'Marketing materials (cards, carrier packet)', 200, 'startup');
  E('A', 'flatbed_gear', 'Tarps, straps, chains & binders', 2500, 'startup', { s: 'truck', w: { trailer: ['flatbed'] }, d: 'Load securement gear needed before the first flatbed load.' });
  E('A', 'trailer_deposit', 'Trailer rental security deposit', 1000, 'startup', { k: 'deposit', s: 'trailer', w: { trailerAcq: ['rent', 'lease'] }, d: 'Refundable deposit — tracked as an asset, not an expense, until refunded or forfeited.' });
  E('A', 'fuelcard_deposit', 'Fuel-card / utility deposit', 0, 'startup', { k: 'deposit', on: false, d: 'Some fuel cards require a refundable deposit from new companies.' });

  /* ---------- B. Authority, compliance & registration ---------- */
  E('B', 'usdot', 'USDOT number registration', 0, 'startup', { src: 'gov', est: false, w: OWN, d: 'Free federal registration (FMCSA). Biennial updates are also free.' });
  E('B', 'mc_authority', 'Motor carrier operating authority (MC)', 300, 'startup', { src: 'gov', w: OWN, d: 'FMCSA application fee for for-hire interstate authority.' });
  E('B', 'boc3', 'BOC-3 process-agent filing', 50, 'startup', { w: OWN, d: 'Private blanket process-agent service files the BOC-3. Typically $25–$75.' });
  E('B', 'ucr', 'Unified Carrier Registration (UCR)', 46, 'annual', { atStart: true, src: 'gov', w: OWN, d: 'Annual fee set by fleet-size bracket (0–2 power units is the lowest). Check the current year\'s fee.' });
  E('B', 'irp', 'IRP apportioned registration (plates)', 1800, 'annual', { atStart: true, s: 'truck', src: 'gov', w: OWN, d: 'Apportioned plates. Varies widely by base state, weight and the states you run in. Under a carrier lease the carrier usually plates you and charges it back.' });
  E('B', 'ifta_acct', 'IFTA account & decals', 10, 'annual', { atStart: true, s: 'truck', src: 'gov', w: OWN, d: 'Decal fees vary by base state. Quarterly IFTA tax reconciliation is calculated separately (section E).' });
  E('B', 'hvut', 'Heavy Vehicle Use Tax (Form 2290)', 550, 'annual', { atStart: true, s: 'truck', src: 'gov', est: false, w: { owned: true }, d: 'Federal tax on vehicles ≥ 55,000 lbs; $550 at 75,000+ lbs. Paid by the registrant.' });
  E('B', 'state_permits', 'State permits (NY HUT, KYU, NM WDT, OR)', 150, 'annual', { atStart: true, src: 'gov', w: OWN, d: 'Registrations required by states with weight-distance taxes, if you run there.' });
  E('B', 'state_mileage_tax', 'State mileage / highway-use taxes', 0.008, 'per_mile', { s: 'truck', src: 'gov', w: OWN, d: 'Averaged $/mile for KY, NM, NY, OR weight-distance taxes. Real cost depends on where you run.' });
  E('B', 'osow_permits', 'Oversize / overweight permits', 120, 'per_load', { src: 'gov', on: false, w: { trailer: ['flatbed'] }, d: 'Only for loads exceeding legal dimensions/weight. Off by default.' });
  E('B', 'trip_permits', 'Temporary trip permits', 60, 'per_load', { src: 'gov', on: false, d: 'Needed only when entering a state without IRP coverage.' });
  E('B', 'fuel_permits', 'Temporary fuel permits', 50, 'per_load', { src: 'gov', on: false, d: 'Needed only without an IFTA license.' });
  E('B', 'new_entrant', 'New Entrant Safety Assurance Program prep', 0, 'startup', { src: 'gov', w: OWN, d: 'The FMCSA safety audit (within 12 months) is free; failing it can revoke your authority.' });
  E('B', 'consortium', 'Drug & alcohol consortium / TPA enrollment', 150, 'annual', { atStart: true, s: 'driver', w: OWN, d: 'Required random-testing pool. Covers program administration.' });
  E('B', 'random_tests', 'Random drug & alcohol tests', 32, 'quarterly', { s: 'driver', w: OWN, d: 'Averaged cost of random selections.' });
  E('B', 'clearinghouse', 'Clearinghouse annual limited query', 1.25, 'annual', { atStart: true, s: 'driver', src: 'gov', w: OWN });
  E('B', 'mvr_annual', 'Annual MVR review', 15, 'annual', { atStart: true, s: 'driver', w: OWN });
  E('B', 'medical', 'Medical examiner certificate (DOT physical)', 60, 'annual', { s: 'driver', d: 'About $120 every two years, averaged per year.' });
  E('B', 'cdl_renewal', 'CDL renewal & endorsements (averaged)', 20, 'annual', { s: 'driver', src: 'gov' });
  E('B', 'eld_sub', 'ELD / hours-of-service subscription', 35, 'monthly', { s: 'truck', d: 'Includes HOS tools, DVIR and IFTA mileage export.' });
  E('B', 'dot_inspection', 'Annual DOT inspection (truck + trailer)', 150, 'annual', { s: 'truck' });
  E('B', 'compliance_consult', 'Compliance consultant', 150, 'monthly', { on: false, w: OWN });
  E('B', 'doc_storage', 'Document storage & recordkeeping', 15, 'monthly');

  /* ---------- C. Truck acquisition & financing ---------- */
  E('C', 'truck_price', 'Truck purchase price', 0, 'engine', { k: 'capital', est: false, param: 'truck price', d: 'Set in Setup / Buy truck. Capitalized as an asset, then depreciated.' });
  E('C', 'down_payment', 'Down payment', 0, 'engine', { k: 'capital', param: 'down payment %', d: 'Cash portion of the price. Reduces cash; it is not an expense.' });
  E('C', 'loan_principal', 'Loan principal repayment', 0, 'engine', { k: 'info', param: 'APR / term', d: 'Reduces cash and debt every month — NOT an expense on the P&L.' });
  E('C', 'loan_interest', 'Loan interest', 0, 'engine', { param: 'APR / term', d: 'The interest portion of each payment is an expense.' });
  E('C', 'origination_fee', 'Loan origination fee', 500, 'acquisition', { w: { acq: ['loan'] } });
  E('C', 'processing_fee', 'Lender processing fee', 250, 'acquisition', { w: { acq: ['loan'] } });
  E('C', 'credit_fee', 'Credit report / application fees', 50, 'acquisition', { w: { acq: ['loan', 'lease'] } });
  E('C', 'doc_fee', 'Dealer documentation fee', 300, 'acquisition', { w: { acq: ['loan', 'cash'] } });
  E('C', 'title_reg', 'Title & initial registration', 150, 'acquisition', { src: 'gov', w: { acq: ['loan', 'cash', 'personal'] } });
  E('C', 'sales_tax', 'Sales / use tax (% of price)', 0, 'acquisition', { k: 'capital', src: 'gov', pct: true, unit: '%', w: { acq: ['loan', 'cash'] }, d: 'Many states exempt interstate rolling stock; others charge full sales tax. Enter your state\'s rate.' });
  E('C', 'prepurchase_insp', 'Pre-purchase inspection (independent mechanic)', 350, 'acquisition', { w: { acq: ['loan', 'cash', 'personal'] } });
  E('C', 'history_report', 'Vehicle history report', 40, 'acquisition', { w: { acq: ['loan', 'cash', 'personal'] } });
  E('C', 'immediate_repairs', 'Immediate repairs before operation', 1500, 'acquisition', { on: false, w: { acq: ['loan', 'cash', 'personal'] }, d: 'Used trucks often need brakes, tires or fluids before the first load.' });
  E('C', 'truck_delivery', 'Delivery / transport of purchased truck', 600, 'acquisition', { on: false });
  E('C', 'ext_warranty', 'Extended warranty', 3500, 'acquisition', { on: false, k: 'capital', w: { acq: ['loan', 'cash', 'personal'] }, d: 'Covers major engine/aftertreatment repairs minus a deductible. When on, major breakdowns cost only the deductible.' });
  E('C', 'warranty_deductible', 'Warranty deductible per claim', 500, 'event', { d: 'Used when an extended warranty covers a major breakdown.' });
  E('C', 'gap', 'GAP coverage', 600, 'acquisition', { on: false, w: { acq: ['loan'] }, d: 'Covers the loan balance above insured value after a total loss.' });
  E('C', 'equip_rent_partner', 'Equipment rent to partner (personal truck)', 0, 'engine', { param: 'monthly rent', w: { acq: ['personal'] }, d: 'The LLC rents the partner\'s personally-owned truck. The partner carries the bank loan personally.' });
  E('C', 'credit_interest', 'Line-of-credit interest', 0, 'engine', { d: 'Interest on any emergency business line of credit.' });
  E('C', 'lease_payment', 'Truck lease payment', 0, 'engine', { param: 'lease weekly payment', w: { acq: ['lease'] } });
  E('C', 'lease_origination', 'Lease origination / first-payment fee', 1500, 'acquisition', { w: { acq: ['lease'] } });
  E('C', 'lease_excess_miles', 'Lease excess-mileage fee ($/mile over allowance)', 0.08, 'engine', { w: { acq: ['lease'] }, d: 'Charged on miles above the annual allowance when the lease ends or is terminated.' });
  E('C', 'lease_end', 'Lease-end return / reconditioning charges', 2000, 'event', { w: { acq: ['lease'] } });
  E('C', 'lease_early_term', 'Early termination fee (× monthly payment)', 3, 'event', { w: { acq: ['lease'] }, unit: 'months', d: 'Returning a leased truck early costs this many monthly payments.' });
  E('C', 'balloon', 'Balloon payment', 0, 'engine', { param: 'balloon %', w: { acq: ['loan'] }, d: 'Lump sum due at the end of a balloon loan.' });
  E('C', 'refi_fee', 'Refinancing fee', 750, 'event', { d: 'Charged when you refinance a truck loan.' });
  E('C', 'payoff', 'Loan payoff', 0, 'engine', { k: 'info', d: 'Paying off early saves future interest; it reduces cash and debt but is not an expense.' });
  E('C', 'depreciation', 'Depreciation', 0, 'engine', { param: 'useful life / salvage', d: 'Non-cash expense spreading the truck\'s cost over its useful life (straight-line, book basis). Tax depreciation (MACRS/§179) differs — ask your CPA.' });
  E('C', 'opportunity_cost', 'Opportunity cost of cash in the truck', 0.05, 'engine', { k: 'info', pct: true, unit: '%', d: 'What the down payment could have earned elsewhere. Shown in analysis only — never charged.' });

  /* ---------- D. Trailer ---------- */
  E('D', 'trailer_price', 'Trailer purchase price', 0, 'engine', { k: 'capital', param: 'trailer price', w: { trailerAcq: ['cash', 'loan'] } });
  E('D', 'trailer_loan', 'Trailer loan payment', 0, 'engine', { param: 'trailer loan', w: { trailerAcq: ['loan'] } });
  E('D', 'trailer_rent', 'Trailer rental / lease payment', 0, 'engine', { param: 'trailer monthly rent', w: { trailerAcq: ['rent', 'lease'] } });
  E('D', 'trailer_title', 'Trailer title & registration', 120, 'startup', { s: 'trailer', src: 'gov', w: { trailerAcq: ['cash', 'loan'] } });
  E('D', 'trailer_reg_renew', 'Trailer registration renewal', 60, 'annual', { s: 'trailer', src: 'gov', w: { trailerAcq: ['cash', 'loan'] } });
  E('D', 'trailer_tires', 'Trailer tires (wear)', 0.012, 'per_mile', { s: 'trailer', w: { trailer: ['dry_van', 'reefer', 'flatbed'] } });
  E('D', 'trailer_brakes', 'Trailer brakes, chambers & air lines', 0.006, 'per_mile', { s: 'trailer', w: { trailer: ['dry_van', 'reefer', 'flatbed'], trailerAcq: ['cash', 'loan'] } });
  E('D', 'trailer_bearings', 'Wheel bearings, hubs & seals', 0.002, 'per_mile', { s: 'trailer', w: { trailer: ['dry_van', 'reefer', 'flatbed'], trailerAcq: ['cash', 'loan'] } });
  E('D', 'trailer_susp', 'Suspension & landing gear', 0.002, 'per_mile', { s: 'trailer', w: { trailer: ['dry_van', 'reefer', 'flatbed'], trailerAcq: ['cash', 'loan'] } });
  E('D', 'trailer_body', 'Doors, hinges, roof & floor repairs', 0.003, 'per_mile', { s: 'trailer', w: { trailer: ['dry_van', 'reefer'], trailerAcq: ['cash', 'loan'] } });
  E('D', 'trailer_lights', 'Lights, wiring & ABS', 0.002, 'per_mile', { s: 'trailer', w: { trailer: ['dry_van', 'reefer', 'flatbed'], trailerAcq: ['cash', 'loan'] } });
  E('D', 'reefer_fuel', 'Reefer unit fuel (gal per loaded mile)', 0.035, 'engine', { w: { trailer: ['reefer'] }, unit: 'gal/mi', d: 'Reefer diesel, priced at the current pump price. Only on loaded miles.' });
  E('D', 'reefer_maint', 'Reefer unit maintenance', 0.02, 'per_mile', { s: 'trailer', loadedOnly: true, w: { trailer: ['reefer'] } });
  E('D', 'reefer_washout', 'Reefer washout', 40, 'per_load', { w: { trailer: ['reefer'] } });
  E('D', 'trailer_wash', 'Trailer washing / sweep-out', 30, 'monthly', { s: 'trailer', w: { trailer: ['dry_van', 'flatbed'] } });
  E('D', 'trailer_storage', 'Trailer storage / yard', 150, 'monthly', { on: false, s: 'trailer' });
  E('D', 'tarp_wear', 'Tarp & strap replacement (wear)', 0.01, 'per_mile', { w: { trailer: ['flatbed'] } });
  E('D', 'drop_rental', 'Drop-trailer rental', 35, 'per_load', { on: false, d: 'Daily rental for an extra trailer used on drop-and-hook freight.' });
  E('D', 'trailer_reserve', 'Trailer replacement reserve', 150, 'monthly', { k: 'reserve', s: 'trailer', w: { trailerAcq: ['cash', 'loan'] }, d: 'Earmarks cash for the next trailer. Not an expense.' });

  /* ---------- E. Fuel & energy ---------- */
  E('E', 'diesel', 'Diesel (gallons × pump price)', 0, 'engine', { param: 'fuel price, MPG', d: 'Gallons = (loaded + deadhead + detour miles) ÷ MPG, priced at the state where you fuel. Pump price already includes state & federal fuel tax.' });
  E('E', 'idle_fuel', 'Idle fuel (gal per truck-day)', 0, 'engine', { param: 'idle gallons / day', d: 'Fuel burned idling for heat/AC on rest breaks.' });
  E('E', 'apu', 'APU fuel & maintenance', 120, 'monthly', { on: false, s: 'truck', d: 'If you install an APU, reduce idle gallons/day in Settings to reflect the savings.' });
  E('E', 'def', 'DEF (diesel exhaust fluid)', 0, 'engine', { param: 'DEF % of diesel, DEF $/gal', d: 'About 2–3 gallons of DEF per 100 gallons of diesel.' });
  E('E', 'fuelcard_fee', 'Fuel-card transaction fee', 1.5, 'engine', { d: 'Charged per fuel stop (about every 120 gallons).' });
  E('E', 'fuelcard_monthly', 'Fuel-card monthly fee', 0, 'monthly', { on: false, s: 'truck' });
  E('E', 'fuel_discount', 'Fuel-card discount (negative = savings)', 0, 'engine', { param: 'discount ¢/gal', d: 'Discounts reduce the pump price. Set in Settings.' });
  E('E', 'ifta_recon', 'IFTA quarterly reconciliation', 0, 'engine', { src: 'gov', w: OWN, d: 'Net of tax owed for miles driven in each state minus tax already paid at the pump. Can be a payment or a refund. Not double-counted: the pump price already includes tax.' });
  E('E', 'fsc_received', 'Fuel surcharge received (revenue)', 0, 'engine', { k: 'info', d: 'Direct-shipper loads list linehaul + FSC separately. Broker rates are usually all-in.' });
  E('E', 'fsc_passthrough', 'Fuel surcharge passed through by carrier', 0, 'engine', { k: 'info', w: CARRIER, d: 'Under a lease, carriers typically pass 100% of FSC to the owner-operator, outside the carrier %.' });

  /* ---------- F. Insurance (annual premiums) ---------- */
  E('F', 'ins_liability', 'Primary auto liability ($1M)', 9600, 'insurance', { s: 'truck', w: OWN, d: 'Required ($750k federal minimum; brokers demand $1M). New authorities pay the most.' });
  E('F', 'ins_cargo', 'Motor truck cargo ($100k)', 1500, 'insurance', { s: 'truck', w: OWN });
  E('F', 'ins_physdmg', 'Physical damage (% of truck value)', 0.035, 'insurance', { s: 'truck', pct: true, unit: '% of value', w: { noCarrierIns: true }, d: 'Lenders require it. Premium ≈ a percentage of the stated value.' });
  E('F', 'ins_gl', 'General liability', 750, 'insurance', { w: OWN });
  E('F', 'ins_bobtail', 'Bobtail / non-trucking liability', 480, 'insurance', { s: 'truck', w: { authority: 'carrier', noCarrierIns: true }, d: 'Covers the truck when not under dispatch for the carrier.' });
  E('F', 'ins_occacc', 'Occupational accident (owner-driver)', 2000, 'insurance', { s: 'partnerDriver', w: { partnerDriver: true, noCarrierIns: true }, d: 'Owner-drivers are not covered by workers\' comp.' });
  E('F', 'ins_workcomp', 'Workers\' compensation (hired drivers)', 4000, 'insurance', { s: 'hired', w: { hired: true } });
  E('F', 'ins_interchange', 'Trailer interchange', 600, 'insurance', { s: 'truck', w: { authority: 'own', trailer: ['power_only'] }, d: 'Covers damage to customer trailers you pull under an interchange agreement.' });
  E('F', 'ins_reefer', 'Reefer breakdown coverage', 600, 'insurance', { s: 'truck', w: { authority: 'own', trailer: ['reefer'] } });
  E('F', 'ins_trailer_pd', 'Trailer physical damage', 700, 'insurance', { s: 'trailer', w: { trailerAcq: ['cash', 'loan'] } });
  E('F', 'ins_umbrella', 'Umbrella / excess liability', 3000, 'insurance', { on: false, w: OWN });
  E('F', 'carrier_ins_chargeback', 'Carrier insurance chargeback', 160, 'weekly', { s: 'truck', w: { carrierIns: true }, d: 'When the carrier deducts physical damage, bobtail and occ-acc from settlements, your own policies for those are turned off to avoid double-counting.' });
  E('F', 'accident_deductible', 'Insurance deductible per claim', 2500, 'event');
  E('F', 'cargo_deductible', 'Cargo claim deductible', 1000, 'event');

  /* ---------- G. Truck maintenance, tires & repairs ---------- */
  E('G', 'pm_service', 'Preventive maintenance (oil, filters, grease)', 450, 'interval', { s: 'truck', every: 15000, maint: true });
  E('G', 'tires_truck', 'Tractor tire replacement (steers + drives)', 4700, 'interval', { s: 'truck', every: 120000, maint: true, d: 'Lumpy cost — a full set comes due all at once.' });
  E('G', 'dpf_clean', 'DPF cleaning / aftertreatment service', 650, 'interval', { s: 'truck', every: 200000, maint: true });
  E('G', 'repairs_general', 'General repairs & parts (age-adjusted)', 0.08, 'per_mile', { s: 'truck', maint: true, d: 'Brakes, lights, belts, sensors. Multiplied by an age factor: older trucks cost more per mile.' });
  E('G', 'truck_wash', 'Truck washes', 60, 'monthly', { s: 'truck' });
  E('G', 'ev_tire', 'Tire failure (road service + tire)', 650, 'event', { maint: true });
  E('G', 'ev_minor', 'Minor breakdown repair', 900, 'event', { maint: true });
  E('G', 'ev_major', 'Major breakdown repair (engine/turbo/EGR)', 8000, 'event', { maint: true });
  E('G', 'ev_tow', 'Heavy tow', 1200, 'event');

  /* ---------- H. Drivers & payroll ---------- */
  E('H', 'driver_wages', 'Hired driver pay (per mile)', 0, 'engine', { param: 'driver ¢/mile', w: { hired: true } });
  E('H', 'payroll_fica', 'Employer Social Security & Medicare (7.65%)', 0.0765, 'engine', { src: 'gov', est: false, pct: true, unit: '%', w: { hired: true } });
  E('H', 'payroll_futa', 'FUTA (0.6% of first $7,000/driver/yr)', 0.006, 'engine', { src: 'gov', pct: true, unit: '%', w: { hired: true } });
  E('H', 'payroll_suta', 'State unemployment (SUTA, new-employer rate)', 0.027, 'engine', { src: 'gov', pct: true, unit: '%', w: { hired: true }, d: 'Rate and wage base vary by state.' });
  E('H', 'partner_gp', 'Partner guaranteed payments', 0, 'engine', { param: 'partner compensation', d: 'Fixed pay to a partner for services (e.g. driving), paid regardless of profit. Deductible by the partnership — unlike draws.' });
  E('H', 'partner_draw', 'Partner draws & distributions', 0, 'engine', { k: 'info', d: 'Withdrawals of profit. They reduce cash and equity but are NOT expenses — a big reason profit and cash differ.' });
  E('H', 'payroll_service', 'Payroll service', 45, 'monthly', { w: { hired: true } });
  E('H', 'hire_drugtest', 'Pre-employment drug test', 65, 'hire', { w: OWN });
  E('H', 'hire_mvr', 'Motor vehicle record (MVR) check', 15, 'hire');
  E('H', 'hire_clearinghouse', 'Clearinghouse full query', 1.25, 'hire', { src: 'gov' });
  E('H', 'hire_verification', 'Employment verification / background', 40, 'hire');
  E('H', 'hire_dq', 'Driver qualification file setup', 35, 'hire');
  E('H', 'hire_recruit', 'Recruiting / job ads', 300, 'hire');
  E('H', 'hire_bonus', 'Sign-on bonus', 1000, 'hire', { on: false });
  E('H', 'layover_pay', 'Breakdown / layover pay (per day)', 150, 'event', { w: { hired: true } });
  E('H', 'detention_pay', 'Detention pay to driver ($/hour)', 20, 'event', { w: { hired: true } });

  /* ---------- I. Trip & road ---------- */
  E('I', 'tolls', 'Tolls (averaged)', 0.02, 'per_mile', { s: 'truck', d: 'Very route-dependent: the Northeast and some turnpikes cost far more.' });
  E('I', 'scales', 'Scale tickets (CAT scale)', 13, 'per_load');
  E('I', 'parking', 'Paid overnight / secure parking', 15, 'per_load', { on: false });
  E('I', 'home_parking', 'Home-base truck parking', 250, 'monthly', { on: false, s: 'truck' });
  E('I', 'phone', 'Driver phone & data plan', 90, 'monthly', { s: 'truck' });
  E('I', 'lumper', 'Lumper fees (reimbursed pass-through)', 180, 'event', { k: 'passthrough', w: { trailer: ['dry_van', 'reefer'] }, d: 'Paid at the dock, reimbursed with the invoice — unless you lose the receipt.' });
  E('I', 'fines', 'Inspection violation / citation', 400, 'event');
  E('I', 'fuel_theft', 'Fuel theft / card fraud loss', 400, 'event');

  /* ---------- J. Freight acquisition & settlement ---------- */
  E('J', 'loadboard', 'Load-board subscription', 150, 'monthly', { w: OWN });
  E('J', 'credit_check', 'Broker credit-check service', 30, 'monthly', { on: false, w: OWN });
  E('J', 'dispatch_fee', 'Dispatcher fee (% of gross)', 0, 'engine', { param: 'dispatcher %', d: 'Turn on by hiring a dispatcher in Fleet.' });
  E('J', 'factoring_fee', 'Factoring fee (% of invoice)', 0, 'engine', { param: 'factoring %', w: OWN });
  E('J', 'quickpay_fee', 'Broker quick-pay fee', 0, 'engine', { w: OWN });
  E('J', 'carrier_pct', 'Carrier percentage (leased-on)', 0, 'engine', { param: 'carrier %', w: CARRIER });
  E('J', 'bad_debt', 'Bad debt (unpaid invoices written off)', 0, 'engine', { d: 'Brokers occasionally never pay. Non-recourse factoring shifts this risk to the factor.' });
  E('J', 'carrier_admin', 'Carrier chargebacks (plates, IFTA admin, ELD)', 45, 'weekly', { s: 'truck', w: CARRIER, d: 'Typical weekly settlement deductions. Your own IRP/IFTA items are off under a carrier, so nothing is counted twice.' });

  /* ---------- K. Office, admin & professional ---------- */
  E('K', 'bookkeeping_sw', 'Bookkeeping software', 40, 'monthly');
  E('K', 'bookkeeper', 'Bookkeeper / accountant', 150, 'monthly');
  E('K', 'tax_prep', 'Partnership tax return (Form 1065 + K-1s)', 1200, 'annual', { d: 'Paid each anniversary.' });
  E('K', 'reg_agent_renew', 'Registered agent renewal', 125, 'annual');
  E('K', 'llc_annual', 'LLC annual report fee', 50, 'annual', { src: 'gov' });
  E('K', 'bank_monthly', 'Business bank fees', 15, 'monthly');
  E('K', 'office_comm', 'Office phone & internet', 60, 'monthly');
  E('K', 'web_hosting', 'Website hosting & email', 20, 'monthly');
  E('K', 'tms', 'TMS / fleet software', 50, 'monthly', { on: false });
  E('K', 'office_rent', 'Office rent', 800, 'monthly', { on: false });
  E('K', 'cc_annual', 'Business credit card annual fee', 95, 'annual', { on: false });
  E('K', 'legal_misc', 'Legal & professional (ongoing)', 600, 'annual', { on: false });
  E('K', 'ev_unexpected', 'Unexpected admin bill', 500, 'event');

  /* ---------- L. Taxes ---------- */
  E('L', 'income_tax', 'Income-tax set-aside (pass-through)', 0, 'engine', { param: 'tax set-aside %', src: 'gov', d: 'A multi-member LLC is usually taxed as a partnership: the company pays no federal income tax; partners pay on their share of profit (plus self-employment tax). The sim pays quarterly tax distributions to partners.' });
  E('L', 'se_tax', 'Self-employment tax (partners, personal)', 0.153, 'engine', { k: 'info', pct: true, unit: '%', d: 'Paid personally by partners on their share of earnings. Included in the set-aside % guidance.' });
  E('L', 'franchise_tax', 'State franchise / LLC tax', 800, 'annual', { on: false, src: 'gov', d: 'e.g. California charges an $800 minimum annual LLC tax.' });
  E('L', 'property_tax', 'Personal property tax on equipment', 300, 'annual', { on: false, s: 'truck', src: 'gov' });

  /* ---------- R. Reserves ---------- */
  E('R', 'maint_reserve', 'Maintenance reserve (per mile)', 0.06, 'per_mile', { k: 'reserve', s: 'truck', d: 'Earmarks cash for repairs. Repairs draw the reserve down first. Not an expense.' });
  E('R', 'res_first_settlement', 'Cash for fuel before the first settlement', 0, 'engine', { k: 'reserve', d: 'Calculated in the Startup Planner from your payment terms.' });
  E('R', 'res_working', 'Working-capital reserve target', 5000, 'reserve', { k: 'reserve' });
  E('R', 'res_contingency', 'Contingency reserve target', 3000, 'reserve', { k: 'reserve' });

  /* ---------- X. Unexpected events ---------- */
  E('X', 'late_penalty', 'Late delivery penalty (% of rate)', 0.10, 'event', { pct: true, unit: '%' });
  E('X', 'cargo_claim', 'Cargo claim (average)', 2500, 'event');
  E('X', 'trailer_damage', 'Trailer damage / detention penalty', 800, 'event');
  E('X', 'reefer_repair', 'Reefer unit repair', 2500, 'event', { w: { trailer: ['reefer'] } });

  E('X', 'asset_sale', 'Gain / loss on equipment sale', 0, 'engine', { d: 'Sale price minus book value when you sell a truck or trailer.' });

  TM.REVENUE_LINES = {
    rev_linehaul: 'Linehaul revenue', rev_fsc: 'Fuel surcharge revenue', rev_detention: 'Detention revenue',
    rev_ifta_refund: 'IFTA refund', rev_other: 'Other income'
  };

  TM.EXPENSES = list;

  TM.FREQ_LABEL = {
    startup: 'One-time at start', acquisition: 'At truck purchase', hire: 'Per hire', weekly: 'Weekly', monthly: 'Monthly',
    quarterly: 'Quarterly', annual: 'Annual', insurance: 'Annual premium', per_mile: 'Per mile', per_load: 'Per load',
    interval: 'Every N miles', event: 'When an event occurs', engine: 'Calculated', reserve: 'Target'
  };
})(globalThis.TM = globalThis.TM || {});
