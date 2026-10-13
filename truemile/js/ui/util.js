/* TrueMile UI helpers: escaping, formatting, small SVG charts with hover tooltips. */
(function (TM) {
  'use strict';
  var UI = TM.UI = TM.UI || {};

  UI.esc = function (s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.m = function (x, dp) { return TM.money(x, dp); };
  UI.signed = function (x, dp) {
    var cls = x > 0.004 ? 'pos' : x < -0.004 ? 'neg' : '';
    return '<span class="' + cls + '">' + TM.money(x, dp) + '</span>';
  };
  UI.short = function (x) {
    var a = Math.abs(x), s = x < 0 ? '−' : '';
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
    return s + '$' + Math.round(a);
  };
  UI.city = function (id) { var c = TM.cityById(id); return c ? c.name + ', ' + c.state : id; };
  UI.badge = function (text, kind) { return '<span class="badge ' + (kind || '') + '">' + UI.esc(text) + '</span>'; };
  UI.stat = function (label, value, sub, cls) {
    return '<div class="card stat"><span class="label">' + UI.esc(label) + '</span><span class="value ' + (cls || '') + '">' + value + '</span>' +
      (sub ? '<span class="sub">' + sub + '</span>' : '') + '</div>';
  };

  function niceScale(min, max) {
    if (min === max) { min -= 1; max += 1; }
    var span = max - min, step = Math.pow(10, Math.floor(Math.log10(span / 4)));
    var err = span / 4 / step;
    if (err >= 5) step *= 5; else if (err >= 2) step *= 2;
    var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
    for (var v = lo; v <= hi + step / 2; v += step) ticks.push(v);
    return { lo: lo, hi: hi, ticks: ticks };
  }

  // Single-series line chart. points: [{label, value, tip}]
  UI.lineChart = function (points, opts) {
    var o = opts || {}, W = 640, H = o.height || 200, L = 52, R = 10, T = 10, B = 26;
    if (points.length < 2) return '<p class="muted small">Not enough data yet — advance a few days.</p>';
    var vals = points.map(function (p) { return p.value; });
    var sc = niceScale(Math.min(0, Math.min.apply(null, vals)), Math.max(0, Math.max.apply(null, vals)));
    var x = function (i) { return L + (W - L - R) * i / (points.length - 1); };
    var y = function (v) { return T + (H - T - B) * (1 - (v - sc.lo) / (sc.hi - sc.lo)); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + UI.esc(o.label || 'chart') + '">';
    sc.ticks.forEach(function (t) {
      svg += '<line class="grid-line" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '"/>' +
        '<text class="axis-label" x="' + (L - 6) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + UI.short(t) + '</text>';
    });
    if (sc.lo < 0) svg += '<line class="zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
    var step = Math.max(1, Math.ceil(points.length / 6));
    points.forEach(function (p, i) {
      if (i % step === 0) svg += '<text class="axis-label" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + UI.esc(p.label) + '</text>';
    });
    svg += '<path class="series-line" d="' + points.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1); }).join(' ') + '"/>';
    var bw = (W - L - R) / (points.length - 1);
    points.forEach(function (p, i) {
      svg += '<rect class="hit" x="' + (x(i) - bw / 2) + '" y="' + T + '" width="' + bw + '" height="' + (H - T - B) + '" data-tip="' + UI.esc(p.tip || (p.label + ': ' + TM.money(p.value))) + '" data-cx="' + x(i) + '" data-cy="' + y(p.value) + '"/>';
    });
    svg += '<line class="cross hidden" y1="' + T + '" y2="' + (H - B) + '"/><circle class="dot hidden" r="4"/></svg>';
    return '<div class="chart" data-w="' + W + '" data-h="' + H + '">' + svg + '</div>';
  };

  // Single-measure bar chart, positive vs negative bars. points: [{label, value, tip}]
  UI.barChart = function (points, opts) {
    var o = opts || {}, W = 640, H = o.height || 200, L = 52, R = 10, T = 10, B = 26;
    if (!points.length) return '<p class="muted small">No months completed yet.</p>';
    var vals = points.map(function (p) { return p.value; });
    var sc = niceScale(Math.min(0, Math.min.apply(null, vals)), Math.max(0, Math.max.apply(null, vals)));
    var y = function (v) { return T + (H - T - B) * (1 - (v - sc.lo) / (sc.hi - sc.lo)); };
    var slot = (W - L - R) / points.length, bw = Math.min(42, slot - 4);
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + UI.esc(o.label || 'chart') + '">';
    sc.ticks.forEach(function (t) {
      svg += '<line class="grid-line" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '"/>' +
        '<text class="axis-label" x="' + (L - 6) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + UI.short(t) + '</text>';
    });
    points.forEach(function (p, i) {
      var cx = L + slot * i + slot / 2, y0 = y(0), y1 = y(p.value), top = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0));
      var r = Math.min(4, h / 2, bw / 2);
      // rounded data-end, square at the baseline
      var d = p.value >= 0
        ? 'M' + (cx - bw / 2) + ' ' + (top + h) + 'V' + (top + r) + 'Q' + (cx - bw / 2) + ' ' + top + ' ' + (cx - bw / 2 + r) + ' ' + top + 'H' + (cx + bw / 2 - r) + 'Q' + (cx + bw / 2) + ' ' + top + ' ' + (cx + bw / 2) + ' ' + (top + r) + 'V' + (top + h) + 'Z'
        : 'M' + (cx - bw / 2) + ' ' + top + 'V' + (top + h - r) + 'Q' + (cx - bw / 2) + ' ' + (top + h) + ' ' + (cx - bw / 2 + r) + ' ' + (top + h) + 'H' + (cx + bw / 2 - r) + 'Q' + (cx + bw / 2) + ' ' + (top + h) + ' ' + (cx + bw / 2) + ' ' + (top + h - r) + 'V' + top + 'Z';
      svg += '<path class="' + (p.value >= 0 ? 'bar-pos' : 'bar-neg') + '" d="' + d + '"/>';
      svg += '<rect class="hit" x="' + (L + slot * i) + '" y="' + T + '" width="' + slot + '" height="' + (H - T - B) + '" data-tip="' + UI.esc(p.tip || (p.label + ': ' + TM.money(p.value))) + '" data-cx="' + cx + '" data-cy="' + y1 + '"/>';
      svg += '<text class="axis-label" x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle">' + UI.esc(p.label) + '</text>';
    });
    if (sc.lo < 0) svg += '<line class="zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
    svg += '</svg>';
    return '<div class="chart" data-w="' + W + '" data-h="' + H + '">' + svg + '</div>' +
      (o.legend !== false ? '<div class="legend"><span><i style="background:var(--series-1)"></i>' + UI.esc(o.posLabel || 'Profit') + '</span><span><i style="background:var(--series-2)"></i>' + UI.esc(o.negLabel || 'Loss') + '</span></div>' : '');
  };

  // Delegated hover for every chart on the page.
  UI.bindChartHover = function (root) {
    var tip = null;
    root.addEventListener('mouseover', function (ev) {
      var hit = ev.target.closest && ev.target.closest('.chart [data-tip]');
      if (!hit) return;
      var chart = hit.closest('.chart'), svg = chart.querySelector('svg');
      var W = +chart.dataset.w, scale = svg.getBoundingClientRect().width / W;
      var cx = +hit.dataset.cx, cy = +hit.dataset.cy;
      if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; }
      chart.appendChild(tip);
      tip.textContent = hit.dataset.tip;
      tip.style.left = (cx * scale) + 'px';
      tip.style.top = (cy * scale) + 'px';
      tip.classList.remove('hidden');
      var cross = svg.querySelector('.cross'), dot = svg.querySelector('.dot');
      if (cross) { cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.classList.remove('hidden'); }
      if (dot) { dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.classList.remove('hidden'); }
    });
    root.addEventListener('mouseout', function (ev) {
      if (!ev.target.closest || !ev.target.closest('.chart [data-tip]')) return;
      if (tip) tip.classList.add('hidden');
      var chart = ev.target.closest('.chart');
      chart.querySelectorAll('.cross,.dot').forEach(function (n) { n.classList.add('hidden'); });
    });
  };

  UI.toast = function (msg) {
    var old = document.querySelector('.toast'); if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  };
})(globalThis.TM = globalThis.TM || {});
