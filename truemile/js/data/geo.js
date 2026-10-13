/* TrueMile — geography: freight markets, diesel price offsets and state fuel-tax estimates.
 * All figures are illustrative estimates for simulation only. */
(function (TM) {
  'use strict';

  // out: outbound freight strength (>1 = lots of outbound freight, good place to reload)
  TM.CITIES = [
    { id: 'ATL', name: 'Atlanta', state: 'GA', lat: 33.75, lon: -84.39, out: 1.10 },
    { id: 'CHI', name: 'Chicago', state: 'IL', lat: 41.88, lon: -87.63, out: 1.15 },
    { id: 'DAL', name: 'Dallas', state: 'TX', lat: 32.78, lon: -96.80, out: 1.12 },
    { id: 'HOU', name: 'Houston', state: 'TX', lat: 29.76, lon: -95.37, out: 1.05 },
    { id: 'LAX', name: 'Los Angeles', state: 'CA', lat: 34.05, lon: -118.24, out: 1.18 },
    { id: 'PHX', name: 'Phoenix', state: 'AZ', lat: 33.45, lon: -112.07, out: 0.90 },
    { id: 'DEN', name: 'Denver', state: 'CO', lat: 39.74, lon: -104.99, out: 0.82 },
    { id: 'SLC', name: 'Salt Lake City', state: 'UT', lat: 40.76, lon: -111.89, out: 0.92 },
    { id: 'SEA', name: 'Seattle', state: 'WA', lat: 47.61, lon: -122.33, out: 0.88 },
    { id: 'POR', name: 'Portland', state: 'OR', lat: 45.52, lon: -122.68, out: 0.90 },
    { id: 'SAC', name: 'Sacramento', state: 'CA', lat: 38.58, lon: -121.49, out: 0.95 },
    { id: 'MEM', name: 'Memphis', state: 'TN', lat: 35.15, lon: -90.05, out: 1.12 },
    { id: 'NAS', name: 'Nashville', state: 'TN', lat: 36.16, lon: -86.78, out: 1.03 },
    { id: 'IND', name: 'Indianapolis', state: 'IN', lat: 39.77, lon: -86.16, out: 1.08 },
    { id: 'COL', name: 'Columbus', state: 'OH', lat: 39.96, lon: -83.00, out: 1.07 },
    { id: 'DET', name: 'Detroit', state: 'MI', lat: 42.33, lon: -83.05, out: 1.00 },
    { id: 'STL', name: 'St. Louis', state: 'MO', lat: 38.63, lon: -90.20, out: 0.98 },
    { id: 'KC', name: 'Kansas City', state: 'MO', lat: 39.10, lon: -94.58, out: 0.97 },
    { id: 'OMA', name: 'Omaha', state: 'NE', lat: 41.26, lon: -95.93, out: 0.90 },
    { id: 'MIN', name: 'Minneapolis', state: 'MN', lat: 44.98, lon: -93.27, out: 0.93 },
    { id: 'CLT', name: 'Charlotte', state: 'NC', lat: 35.23, lon: -80.84, out: 1.02 },
    { id: 'JAX', name: 'Jacksonville', state: 'FL', lat: 30.33, lon: -81.66, out: 0.80 },
    { id: 'MIA', name: 'Miami', state: 'FL', lat: 25.76, lon: -80.19, out: 0.68 },
    { id: 'ORL', name: 'Orlando', state: 'FL', lat: 28.54, lon: -81.38, out: 0.72 },
    { id: 'NYC', name: 'Newark', state: 'NJ', lat: 40.74, lon: -74.17, out: 0.95 },
    { id: 'PHL', name: 'Philadelphia', state: 'PA', lat: 39.95, lon: -75.17, out: 1.00 },
    { id: 'BOS', name: 'Boston', state: 'MA', lat: 42.36, lon: -71.06, out: 0.78 },
    { id: 'ELP', name: 'El Paso', state: 'TX', lat: 31.76, lon: -106.49, out: 1.00 },
    { id: 'LRD', name: 'Laredo', state: 'TX', lat: 27.51, lon: -99.51, out: 1.20 },
    { id: 'OKC', name: 'Oklahoma City', state: 'OK', lat: 35.47, lon: -97.52, out: 0.92 },
    { id: 'ABQ', name: 'Albuquerque', state: 'NM', lat: 35.08, lon: -106.65, out: 0.78 },
    { id: 'LVS', name: 'Las Vegas', state: 'NV', lat: 36.17, lon: -115.14, out: 0.80 },
    { id: 'BHM', name: 'Birmingham', state: 'AL', lat: 33.52, lon: -86.80, out: 0.98 },
    { id: 'SAV', name: 'Savannah', state: 'GA', lat: 32.08, lon: -81.09, out: 1.10 },
    { id: 'RIC', name: 'Richmond', state: 'VA', lat: 37.54, lon: -77.44, out: 0.96 }
  ];

  // dieselOffset: $/gal vs national average (pump price). fuelTax: state diesel tax $/gal (rough estimate, changes yearly).
  TM.STATES = {
    GA: { dieselOffset: -0.12, fuelTax: 0.35 }, IL: { dieselOffset: 0.18, fuelTax: 0.64 }, TX: { dieselOffset: -0.22, fuelTax: 0.20 },
    CA: { dieselOffset: 1.35, fuelTax: 0.98 }, AZ: { dieselOffset: 0.10, fuelTax: 0.27 }, CO: { dieselOffset: 0.05, fuelTax: 0.33 },
    UT: { dieselOffset: 0.10, fuelTax: 0.38 }, WA: { dieselOffset: 0.75, fuelTax: 0.49 }, OR: { dieselOffset: 0.55, fuelTax: 0.40 },
    TN: { dieselOffset: -0.15, fuelTax: 0.27 }, IN: { dieselOffset: 0.12, fuelTax: 0.59 }, OH: { dieselOffset: 0.05, fuelTax: 0.47 },
    MI: { dieselOffset: 0.10, fuelTax: 0.48 }, MO: { dieselOffset: -0.20, fuelTax: 0.27 }, NE: { dieselOffset: -0.05, fuelTax: 0.30 },
    MN: { dieselOffset: 0.00, fuelTax: 0.31 }, NC: { dieselOffset: -0.02, fuelTax: 0.40 }, FL: { dieselOffset: 0.05, fuelTax: 0.39 },
    NJ: { dieselOffset: 0.20, fuelTax: 0.52 }, PA: { dieselOffset: 0.40, fuelTax: 0.74 }, MA: { dieselOffset: 0.30, fuelTax: 0.26 },
    OK: { dieselOffset: -0.25, fuelTax: 0.19 }, NM: { dieselOffset: -0.05, fuelTax: 0.23 }, NV: { dieselOffset: 0.45, fuelTax: 0.27 },
    AL: { dieselOffset: -0.15, fuelTax: 0.31 }, VA: { dieselOffset: 0.00, fuelTax: 0.42 }
  };

  TM.cityById = function (id) {
    for (var i = 0; i < TM.CITIES.length; i++) if (TM.CITIES[i].id === id) return TM.CITIES[i];
    return null;
  };

  // Road miles ≈ great-circle miles × 1.18 circuity factor.
  TM.distance = function (aId, bId) {
    var a = TM.cityById(aId), b = TM.cityById(bId);
    if (!a || !b || a === b) return 0;
    var R = 3958.8, toR = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.18);
  };
})(globalThis.TM = globalThis.TM || {});
