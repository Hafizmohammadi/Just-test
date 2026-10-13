// Loads the browser scripts into Node's global scope (they attach to globalThis.TM).
const path = require('path');
const files = ['data/geo.js', 'data/models.js', 'data/expenses.js', 'data/lessons.js',
  'engine/core.js', 'engine/finance.js', 'engine/sim.js', 'engine/loads.js', 'engine/events.js', 'engine/project.js'];
files.forEach(f => require(path.join(__dirname, '..', 'js', f)));
module.exports = globalThis.TM;
