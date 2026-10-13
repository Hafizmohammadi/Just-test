/* TrueMile — business models. Each model sets defaults; every flag stays editable in Setup. */
(function (TM) {
  'use strict';

  TM.BUSINESS_MODELS = {
    oo_personal: {
      name: 'Owner-operator — personal truck, leased onto a carrier',
      short: 'O/O personal truck on carrier',
      authority: 'carrier', truckAcq: 'personal', driver: 'partner', trucks: 1,
      summary: 'A partner owns the truck personally and leases it (with themselves as driver) to an established motor carrier. The carrier supplies the authority, primary liability and cargo insurance, and usually IRP plates and IFTA filing, and keeps a percentage of each load.',
      revenue: 'Revenue = load rate × (1 − carrier %), plus fuel surcharge pass-through. Settlements usually arrive weekly, so cash comes in much faster than with 30-day broker terms.',
      costs: [
        'No MC authority, BOC-3, UCR or primary liability/cargo premiums — the carrier holds those.',
        'You still pay: truck note, fuel, maintenance, tires, bobtail/non-trucking liability, physical damage, occupational accident.',
        'Carriers often charge back plates, IFTA admin, ELD, insurance and escrow — model these as chargebacks, not as separate premiums.',
        'The truck is a personal asset rented to the LLC; the sim treats the rent as the loan payment the LLC covers.'
      ]
    },
    oo_lease: {
      name: 'Owner-operator — leased truck',
      short: 'O/O leasing a truck',
      authority: 'carrier', truckAcq: 'lease', driver: 'partner', trucks: 1,
      summary: 'The company leases a tractor (from a leasing company or a carrier lease-purchase program) instead of buying it. Lower cash at startup, but a fixed weekly or monthly lease payment that is due whether or not the truck is earning.',
      revenue: 'Same as the leased-on model if you run under a carrier; switch authority to "own" in Setup to run a leased truck on your own MC.',
      costs: [
        'No down payment or depreciation — the lease payment is an operating expense.',
        'Some full-service leases include maintenance; turn on "lease includes maintenance" and the sim stops charging routine maintenance separately.',
        'Watch for excess-mileage charges, lease-end charges and early termination fees.'
      ]
    },
    own_authority: {
      name: 'Company-owned truck, own authority',
      short: 'Own truck, own MC',
      authority: 'own', truckAcq: 'loan', driver: 'partner', trucks: 1,
      summary: 'TrueMile buys (or finances) its own truck and runs under its own USDOT/MC authority, booking freight through brokers and direct shippers. Highest revenue per mile — and every cost, filing and risk is yours.',
      revenue: 'Revenue = full broker or shipper rate. Brokers typically pay 15–45 days after delivery — the main cash-flow trap for new carriers.',
      costs: [
        'Authority, BOC-3, UCR, IRP, IFTA, HVUT, drug & alcohol consortium and New Entrant compliance all apply.',
        'Primary auto liability, cargo, physical damage and general liability insurance — new authorities pay the highest premiums.',
        'Truck loan: interest is an expense, principal is not; depreciation is a non-cash expense.'
      ]
    },
    company_leased_on: {
      name: 'Company-owned truck leased onto another carrier',
      short: 'Own truck, leased on',
      authority: 'carrier', truckAcq: 'loan', driver: 'partner', trucks: 1,
      summary: 'TrueMile owns the truck but leases it onto an established carrier instead of getting its own authority. A common way to start: you learn the business with lower insurance costs and faster settlements, at the price of a percentage of revenue.',
      revenue: 'Revenue = load rate × (1 − carrier %). Weekly settlements; the carrier may deduct fuel advances and chargebacks.',
      costs: [
        'No authority filings or primary liability/cargo premiums.',
        'You pay: truck financing, fuel, maintenance, tires, bobtail, physical damage, occupational accident, chargebacks.'
      ]
    },
    hired_driver: {
      name: 'Company-owned truck, hired driver',
      short: 'Own truck, hired driver',
      authority: 'own', truckAcq: 'loan', driver: 'hired', trucks: 1,
      summary: 'Both partners manage while a hired W-2 driver runs the truck. Frees the partners, but adds wages, payroll taxes, workers\' comp, and onboarding/compliance costs.',
      revenue: 'Same as own authority. Driver pay is usually per mile (often 50–70¢) or a percentage of revenue.',
      costs: [
        'Driver wages + employer payroll taxes (Social Security, Medicare, FUTA, SUTA) + workers\' compensation.',
        'Pre-employment drug test, MVR, Clearinghouse queries, DQ file, background checks.',
        'Driver turnover: every replacement costs onboarding fees and idle days.'
      ]
    },
    fleet: {
      name: 'Fleet operator — multiple trucks and drivers',
      short: 'Fleet',
      authority: 'own', truckAcq: 'loan', driver: 'hired', trucks: 2,
      summary: 'Several trucks and hired drivers under TrueMile\'s authority, often with a dispatcher. Fixed overhead (office, compliance, software, insurance minimums) is spread over more trucks, but one bad month can hit several notes at once.',
      revenue: 'Revenue scales with trucks; profit depends on keeping every truck loaded and every driver seated.',
      costs: [
        'Per-truck costs multiply; company overhead does not — that is the economy of scale.',
        'Dispatcher, safety/compliance staff and fleet insurance start to matter.',
        'Insurance is per power unit and rises with claims across the whole fleet.'
      ]
    }
  };

  TM.TRAILER_TYPES = {
    dry_van: { name: '53\' dry van', rateAdj: 0, price: 32000, rent: 900 },
    reefer: { name: '53\' refrigerated (reefer)', rateAdj: 0.30, price: 55000, rent: 1600 },
    flatbed: { name: '48\' flatbed', rateAdj: 0.45, price: 30000, rent: 850 },
    power_only: { name: 'Power only (no trailer — haul customer trailers)', rateAdj: -0.15, price: 0, rent: 0 }
  };

  TM.TRUCK_MARKET = [
    { id: 'new', name: 'New tractor (current model year)', price: 165000, odometer: 500, mpg: 7.8, condition: 98, ageYears: 0, life: 7 },
    { id: 'used3', name: '3-year-old tractor', price: 92000, odometer: 330000, mpg: 7.2, condition: 85, ageYears: 3, life: 6 },
    { id: 'used7', name: '7-year-old tractor', price: 45000, odometer: 640000, mpg: 6.5, condition: 70, ageYears: 7, life: 4 },
    { id: 'old', name: '10-year-old tractor (budget)', price: 25000, odometer: 820000, mpg: 6.1, condition: 58, ageYears: 10, life: 3 }
  ];

  TM.BROKERS = [
    { id: 'b1', name: 'Summit Freight Brokerage', credit: 95, days: 30, spread: 4, quickPay: 0.02, rateMult: 1.00 },
    { id: 'b2', name: 'Lone Star Logistics', credit: 88, days: 30, spread: 7, quickPay: 0.03, rateMult: 1.02 },
    { id: 'b3', name: 'BlueLine Brokers', credit: 92, days: 21, spread: 5, quickPay: 0.025, rateMult: 0.97 },
    { id: 'b4', name: 'Rapid Rate Freight', credit: 64, days: 45, spread: 20, quickPay: 0.05, rateMult: 1.10 },
    { id: 'b5', name: 'Heartland Transport Solutions', credit: 90, days: 30, spread: 6, quickPay: 0.03, rateMult: 1.00 },
    { id: 'b6', name: 'Coastal Cargo Connect', credit: 72, days: 40, spread: 14, quickPay: 0.04, rateMult: 1.06 },
    { id: 'b7', name: 'PrimeRoute Logistics', credit: 97, days: 15, spread: 3, quickPay: 0.015, rateMult: 0.95 },
    { id: 'b8', name: 'FlyByNight Freight LLC', credit: 41, days: 60, spread: 30, quickPay: 0.06, rateMult: 1.18 }
  ];

  TM.DIRECT_SHIPPERS = [
    { id: 'd1', name: 'Midwest Paper Mills (direct)', credit: 93, days: 45, spread: 6, rateMult: 1.15 },
    { id: 'd2', name: 'SunBelt Foods (direct)', credit: 90, days: 40, spread: 8, rateMult: 1.12 }
  ];

  TM.COMMODITIES = {
    dry_van: ['Paper products', 'Packaged beverages', 'Retail goods', 'Auto parts', 'Household appliances', 'Canned food'],
    reefer: ['Fresh produce', 'Frozen poultry', 'Dairy', 'Ice cream', 'Pharmaceuticals'],
    flatbed: ['Steel coils', 'Lumber', 'Construction equipment', 'Pipe', 'Roofing shingles'],
    power_only: ['Preloaded trailer — retail', 'Preloaded trailer — parcels', 'Empty trailer reposition']
  };
})(globalThis.TM = globalThis.TM || {});
