/* Display-only. No access to or mutation of NBEngine, ratings, recommendations or URLs. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const dataUrl = new URL('../data/offer-history.json', document.currentScript.src);
  let request;
  function load() {
    if (!request) request = fetch(dataUrl).then(r => {
      if (!r.ok) throw new Error('History unavailable');
      return r.json();
    }).catch(() => null);
    return request;
  }
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function svg(tag, attrs, text) {
    const n = document.createElementNS(NS, tag);
    for (const [key, val] of Object.entries(attrs)) n.setAttribute(key, val);
    if (text) n.textContent = text;
    return n;
  }
  function label(current) {
    const raw = current.offer_label;
    return current.offer_mechanism === 'AS_HIGH_AS'
      ? '最高可达 ' + raw.replace(/^(?:up to|as high as|最高可达)\s*/i, '') : raw;
  }
  function render(host, product, assessmentDate) {
    host.replaceChildren();
    const c = product && product.current;
    const currentTime = Date.parse(assessmentDate || (c && c.evaluation_date));
    if (!c || !c.display_eligible || !Number.isFinite(c.comparable_value) || !Number.isFinite(currentTime)) return;
    const history = Array.isArray(product.history) ? product.history.filter(e => e.display_eligible === true
      && e.timing_eligible === 'YES' && e.confidence === 'HIGH'
      && e.comparison_unit === c.comparison_unit && Number.isFinite(e.comparable_value)
      && e.bonus_label && e.date_label && Number.isFinite(Date.parse(e.date)) && Date.parse(e.date) <= currentTime) : [];
    if (!history.length) {
      host.append(el('p', 'oh-empty', '目前可比较的历史奖励数据还比较少。'));
      return;
    }
    const groups = new Map();
    for (const e of history) {
      const key = e.date + ':' + e.comparable_value;
      if (!groups.has(key)) groups.set(key, { ...e, records: [] });
      groups.get(key).records.push(e);
    }
    const events = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
    // A corrupt/conflicting JSON must not invent an ordering of same-date offers.
    const conflictDates = new Set(events.filter((e, i) => events.some((f, j) => i !== j && e.date === f.date)).map(e => e.date));
    const points = events.filter(e => !conflictDates.has(e.date));
    if (!points.length) { host.append(el('p', 'oh-empty', '目前可比较的历史奖励数据还比较少。')); return; }
    const current = {date: new Date(currentTime).toISOString().slice(0,10), date_label: new Date(currentTime).toISOString().slice(0,10),
      bonus_label: label(c), comparable_value: c.comparable_value, current: true};
    const all = [...points, current];
    const heading = el('div', 'oh-heading');
    heading.append(el('span', 'oh-title', '历史奖励'), el('span', 'oh-current-label', '当前 · ' + current.bonus_label));
    const stage = el('div', 'oh-stage');
    const details = el('div', 'oh-details');
    details.setAttribute('aria-live', 'polite');
    function show(p) {
      details.replaceChildren(el('span', 'oh-date', (p.current ? '当前 · ' : '') + p.date_label));
      for (const row of p.records || [p]) {
        const line = el('span', 'oh-offer', row.bonus_label);
        if (row.spend_requirement) line.append(el('span', 'oh-spend', row.spend_requirement));
        details.append(line);
      }
    }
    show(current);
    const note = el('p', 'oh-note', '奖励相对价值 · 点击或聚焦节点查看详情。阶梯线连接已收录记录，不代表期间没有其他 Offer。');
    host.append(heading, stage, details, note);
    function draw() {
      const width = Math.max(240, host.clientWidth), height = 230;
      const left = 18, right = width - 24, top = 44, bottom = 190;
      const minTime = Math.min(...points.map(p => Date.parse(p.date)));
      const values = all.map(p => p.comparable_value);
      const low = Math.min(...values), high = Math.max(...values), span = high - low || Math.abs(high) * .2 || 1;
      const x = p => p.current ? right : left + (Date.parse(p.date) - minTime) / (currentTime - minTime || 1) * (right - left - 12);
      const y = p => bottom - 12 - (p.comparable_value - low) / span * (bottom - top - 24);
      const root = svg('svg', {viewBox: `0 0 ${width} ${height}`, width:'100%', height, role:'group', 'aria-label':'历史开卡奖励走势图，当前 ' + current.bonus_label});
      const histHigh = points.reduce((a,b) => b.comparable_value >= a.comparable_value ? b : a);
      root.append(svg('line', {x1:left, x2:right, y1:y(histHigh), y2:y(histHigh), class:'oh-high-line'}));
      root.append(svg('text', {x:left, y:20, class:'oh-axis'}, '历史高位 · ' + histHigh.bonus_label));
      let d = `M ${x(all[0])} ${y(all[0])}`;
      for (const p of all.slice(1)) d += ` H ${x(p)} V ${y(p)}`;
      root.append(svg('path', {d, class:'oh-line'}));
      for (const p of all) {
        const g = svg('g', {tabindex:0, role:'button', class:'oh-node' + (p.current ? ' oh-now' : ''),
          'aria-label':`${p.current ? '当前，' : ''}${p.date_label}，${(p.records || [p]).map(r=>r.bonus_label+(r.spend_requirement?'，'+r.spend_requirement:'')).join('；')}`,
          'data-date':p.date, 'data-current':String(!!p.current), transform:`translate(${x(p)} ${y(p)})`});
        g.append(svg('circle', {r:12, fill:'transparent'}), svg('circle', {r:p.current?6:4, class:'oh-dot'}));
        g.addEventListener('mouseenter',()=>show(p));
        g.addEventListener('focus',()=>show(p));
        g.addEventListener('click',()=>show(p));
        g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show(p)}});
        root.append(g);
      }
      root.append(svg('text', {x:right, y:Math.max(36,y(current)-16), 'text-anchor':'end', class:'oh-current-text'}, '当前'));
      root.append(svg('text', {x:left, y:218, class:'oh-axis'}, points[0].date_label));
      root.append(svg('text', {x:right, y:218, 'text-anchor':'end', class:'oh-axis'}, current.date_label));
      stage.replaceChildren(root);
    }
    draw();
    // The report is rebuilt during navigation; disconnect observers from removed charts.
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => { if (!host.isConnected) observer.disconnect(); else draw(); });
      observer.observe(host);
      host._historyObserver = observer;
    }
  }
  async function mount(host, timingId, assessmentDate) {
    try {
      const data = await load();
      if (host.isConnected && data) render(host, data[timingId], assessmentDate);
    } catch (_) { host.replaceChildren(); }
  }
  window.OfferHistoryChart = { mount, render };
})();
