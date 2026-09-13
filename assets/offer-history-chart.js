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
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function svg(tag, attrs, text) {
    const n = document.createElementNS(NS, tag);
    for (const [key, val] of Object.entries(attrs || {})) n.setAttribute(key, val);
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function label(current) {
    const raw = current.offer_label || '';
    return current.offer_mechanism === 'AS_HIGH_AS'
      ? '最高可达 ' + raw.replace(/^(?:up to|as high as|最高可达)\s*/i, '')
      : raw;
  }

  function inferProgram(currentLabel) {
    const s = String(currentLabel || '');
    const known = ['UR', 'MR', 'TYP', 'AA', 'Bilt', 'Delta', 'Hilton', 'Marriott', 'Hyatt'];
    return known.find(k => new RegExp(`\\b${k}\\b`, 'i').test(s)) || (/(?:mile|miles)\b/i.test(s) ? 'miles' : '');
  }

  function compactNumber(n) {
    if (!Number.isFinite(n)) return '';
    if (Math.abs(n) >= 1000 && n % 1000 === 0) return `${Math.round(n / 1000)}k`;
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
  }

  function compactOffer(raw, program) {
    let s = String(raw || '').trim();
    s = s.replace(/^(?:up to|as high as|最高可达)\s*/i, '');
    s = s.replace(/([0-9][0-9,]*)\s*(?:points?|pts?)\b/ig, (_, num) => {
      const n = Number(num.replace(/,/g, ''));
      return compactNumber(n) + (program ? ` ${program}` : ' points');
    });
    s = s.replace(/\b([0-9]+)000\s+([A-Za-z]+)\b/g, (_, a, b) => `${a}k ${b}`);
    return s;
  }

  function monthStart(ms, deltaMonths) {
    const d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + deltaMonths, 1);
  }

  function monthLabel(ms) {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  function positionText(current, low, high) {
    if (!(Number.isFinite(current) && Number.isFinite(low) && Number.isFinite(high))) return '无法判断';
    if (high <= low) return '历史高位';
    const p = (current - low) / (high - low);
    if (p >= 0.85) return '接近高位';
    if (p <= 0.2) return '接近低位';
    return '中间水平';
  }

  function render(host, product, assessmentDate) {
    host.replaceChildren();
    const c = product && product.current;
    const currentTime = Date.parse(assessmentDate || (c && c.evaluation_date));
    if (!c || !c.display_eligible || !Number.isFinite(c.comparable_value) || !Number.isFinite(currentTime)) return;

    const allHistory = Array.isArray(product.history) ? product.history.filter(e => e.display_eligible === true
      && e.timing_eligible === 'YES' && e.confidence === 'HIGH'
      && e.comparison_unit === c.comparison_unit && Number.isFinite(e.comparable_value)
      && e.bonus_label && e.date_label && Number.isFinite(Date.parse(e.date)) && Date.parse(e.date) <= currentTime) : [];

    if (!allHistory.length) {
      host.append(el('p', 'oh-empty', '目前可比较的历史奖励数据还比较少。'));
      return;
    }

    const groups = new Map();
    for (const e of allHistory) {
      const key = `${e.date}:${e.comparable_value}`;
      if (!groups.has(key)) groups.set(key, { ...e, records: [] });
      groups.get(key).records.push(e);
    }
    const grouped = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
    const conflictDates = new Set(grouped.filter((e, i) => grouped.some((f, j) => i !== j && e.date === f.date)).map(e => e.date));
    const cleanHistory = grouped.filter(e => !conflictDates.has(e.date));
    if (!cleanHistory.length) {
      host.append(el('p', 'oh-empty', '目前可比较的历史奖励数据还比较少。'));
      return;
    }

    const current = {
      date: new Date(currentTime).toISOString().slice(0, 10),
      date_label: monthLabel(currentTime),
      bonus_label: label(c),
      comparable_value: c.comparable_value,
      current: true
    };
    const program = inferProgram(current.bonus_label);
    const statPoints = [...cleanHistory, current];
    const highPoint = statPoints.reduce((a, b) => b.comparable_value > a.comparable_value ? b : a);
    const lowPoint = statPoints.reduce((a, b) => b.comparable_value < a.comparable_value ? b : a);
    const posText = positionText(current.comparable_value, lowPoint.comparable_value, highPoint.comparable_value);

    const stats = el('div', 'oh-stats');
    [
      ['当前奖励', compactOffer(current.bonus_label, program), 'oh-stat-current'],
      ['历史高位', compactOffer(highPoint.bonus_label, program), 'oh-stat-high'],
      ['历史低位', compactOffer(lowPoint.bonus_label, program), 'oh-stat-low'],
      ['所处位置', posText, 'oh-stat-position']
    ].forEach(([name, value, cls]) => {
      const card = el('div', `oh-stat ${cls}`);
      card.append(el('div', 'oh-stat-name', name), el('div', 'oh-stat-value', value));
      stats.append(card);
    });

    const toolbar = el('div', 'oh-toolbar');
    toolbar.append(el('div', 'oh-title', '历史奖励走势'));
    const rangeSwitch = el('div', 'oh-range');
    const btn24 = el('button', 'oh-range-btn active', '最近 24 个月');
    const btnAll = el('button', 'oh-range-btn', '全部历史');
    btn24.type = btnAll.type = 'button';
    btn24.setAttribute('aria-pressed', 'true');
    btnAll.setAttribute('aria-pressed', 'false');
    rangeSwitch.append(btn24, btnAll);
    toolbar.append(rangeSwitch);

    const stage = el('div', 'oh-stage');
    const details = el('div', 'oh-details');
    details.setAttribute('aria-live', 'polite');
    const note = el('p', 'oh-note', '默认展示最近 24 个月；窗口起点会继承更早最近一条已收录奖励，使走势保持连续。奖励相对位置按可比口径计算；点击或聚焦节点查看详情。');
    host.append(stats, toolbar, stage, details, note);

    function show(p) {
      const date = el('span', 'oh-date', p.current ? '当前' : p.date_label);
      const rows = p.records || [p];
      const offer = el('span', 'oh-offer', rows.map(r => compactOffer(r.bonus_label, program)).join(' / '));
      details.replaceChildren(date, el('span', 'oh-sep', '•'), offer);
      const spend = rows.map(r => r.spend_requirement).filter(Boolean).join(' / ');
      if (spend) details.append(el('span', 'oh-sep', '•'), el('span', 'oh-spend', `消费 ${spend}`));
    }
    show(current);

    let rangeMode = '24m';
    function setRange(mode) {
      rangeMode = mode;
      btn24.classList.toggle('active', mode === '24m');
      btnAll.classList.toggle('active', mode === 'all');
      btn24.setAttribute('aria-pressed', String(mode === '24m'));
      btnAll.setAttribute('aria-pressed', String(mode === 'all'));
      draw();
    }
    btn24.addEventListener('click', () => setRange('24m'));
    btnAll.addEventListener('click', () => setRange('all'));

    function draw() {
      const cutoff = monthStart(currentTime, -24);
      const points = rangeMode === '24m' ? cleanHistory.filter(p => Date.parse(p.date) >= cutoff) : cleanHistory.slice();
      const carrySource = rangeMode === '24m'
        ? cleanHistory.filter(p => Date.parse(p.date) < cutoff).slice(-1)[0]
        : null;
      const carry = carrySource ? {
        ...carrySource,
        date: new Date(cutoff).toISOString().slice(0, 10),
        date_label: monthLabel(cutoff),
        carry: true
      } : null;
      if (!points.length && !carry) {
        stage.replaceChildren(el('p', 'oh-empty', '这个时间范围内可比较的历史奖励数据还比较少。'));
        return;
      }

      const width = Math.max(300, host.clientWidth);
      const mobile = width < 560;
      const height = mobile ? 260 : 300;
      const left = mobile ? 46 : 62;
      const right = width - (mobile ? 14 : 26);
      const top = 48;
      const bottom = height - 48;
      const all = carry ? [carry, ...points, current] : [...points, current];
      const startTime = rangeMode === '24m' ? cutoff : Math.min(...points.map(p => Date.parse(p.date)));
      const scaleLow = lowPoint.comparable_value;
      const scaleHigh = highPoint.comparable_value;
      const span = scaleHigh - scaleLow || Math.abs(scaleHigh) * .2 || 1;
      const x = p => p.current ? right : left + (Date.parse(p.date) - startTime) / (currentTime - startTime || 1) * (right - left);
      const yValue = v => bottom - 12 - (v - scaleLow) / span * (bottom - top - 24);
      const y = p => yValue(p.comparable_value);
      const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'group', 'aria-label': '历史开卡奖励走势图，当前 ' + current.bonus_label });

      const refs = [
        { v: highPoint.comparable_value, label: compactOffer(highPoint.bonus_label, program), cls: 'high' },
        { v: current.comparable_value, label: compactOffer(current.bonus_label, program), cls: 'current' },
        { v: lowPoint.comparable_value, label: compactOffer(lowPoint.bonus_label, program), cls: 'low' }
      ];
      const seenValues = new Set();
      for (const ref of refs) {
        if (seenValues.has(ref.v)) continue;
        seenValues.add(ref.v);
        const yy = yValue(ref.v);
        root.append(svg('line', { x1: left, x2: right, y1: yy, y2: yy, class: `oh-grid oh-grid-${ref.cls}` }));
        root.append(svg('text', { x: left - 10, y: yy + 4, 'text-anchor': 'end', class: 'oh-y-label' }, ref.label));
      }

      const ticks = [];
      if (rangeMode === '24m') {
        for (let m = 0; m <= 18; m += 6) ticks.push(monthStart(startTime, m));
      } else {
        const interval = (currentTime - startTime) / 4;
        for (let i = 0; i < 4; i++) ticks.push(startTime + interval * i);
      }
      for (const t of ticks) {
        const xx = left + (t - startTime) / (currentTime - startTime || 1) * (right - left);
        root.append(svg('line', { x1: xx, x2: xx, y1: bottom + 1, y2: bottom + 7, class: 'oh-x-tick' }));
        root.append(svg('text', { x: xx, y: height - 16, 'text-anchor': 'middle', class: 'oh-x-label' }, monthLabel(t)));
      }
      root.append(svg('line', { x1: right, x2: right, y1: bottom + 1, y2: bottom + 7, class: 'oh-x-tick' }));
      root.append(svg('text', { x: right, y: height - 16, 'text-anchor': 'end', class: 'oh-x-label' }, '当前'));

      let d = `M ${x(all[0])} ${y(all[0])}`;
      for (const p of all.slice(1)) d += ` H ${x(p)} V ${y(p)}`;
      root.append(svg('path', { d, class: 'oh-line' }));

      const highs = points.filter(p => p.comparable_value === highPoint.comparable_value);
      const labeledHighs = [];
      for (const p of highs) {
        if (!labeledHighs.some(q => Math.abs(x(q) - x(p)) < (mobile ? 95 : 135))) labeledHighs.push(p);
        if (labeledHighs.length >= 2) break;
      }
      for (const p of labeledHighs) {
        root.append(svg('text', { x: x(p), y: Math.max(22, y(p) - 18), 'text-anchor': 'middle', class: 'oh-peak-label' }, `${p.date_label}  ${compactOffer(p.bonus_label, program)}`));
      }

      for (const p of all) {
        if (p.carry) continue;
        const rows = p.records || [p];
        const aria = `${p.current ? '当前，' : ''}${p.date_label}，${rows.map(r => r.bonus_label + (r.spend_requirement ? '，' + r.spend_requirement : '')).join('；')}`;
        const g = svg('g', { tabindex: 0, role: 'button', class: 'oh-node' + (p.current ? ' oh-now' : ''), 'aria-label': aria,
          'data-date': p.date, 'data-current': String(!!p.current), transform: `translate(${x(p)} ${y(p)})` });
        g.append(svg('circle', { r: 12, fill: 'transparent' }), svg('circle', { r: p.current ? 7 : 4.5, class: 'oh-dot' }));
        g.addEventListener('mouseenter', () => show(p));
        g.addEventListener('focus', () => show(p));
        g.addEventListener('click', () => show(p));
        g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(p); } });
        root.append(g);
      }

      const bubbleText = `当前 ${compactOffer(current.bonus_label, program)}`;
      const bubbleWidth = Math.min(mobile ? 126 : 158, Math.max(94, bubbleText.length * (mobile ? 7 : 7.8) + 24));
      const bx = Math.max(left, right - bubbleWidth);
      const by = Math.max(8, y(current) - 54);
      root.append(svg('rect', { x: bx, y: by, width: bubbleWidth, height: 34, rx: 9, class: 'oh-current-bubble' }));
      root.append(svg('path', { d: `M ${right - 14} ${by + 34} L ${right - 4} ${by + 34} L ${right - 9} ${by + 42} Z`, class: 'oh-current-bubble-tip' }));
      root.append(svg('text', { x: bx + bubbleWidth / 2, y: by + 22, 'text-anchor': 'middle', class: 'oh-current-bubble-text' }, bubbleText));

      stage.replaceChildren(root);
    }

    draw();
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => {
        if (!host.isConnected) observer.disconnect();
        else draw();
      });
      observer.observe(host);
      host._historyObserver = observer;
    }
  }

  async function mount(host, timingId, assessmentDate) {
    try {
      const data = await load();
      if (host.isConnected && data) render(host, data[timingId], assessmentDate);
    } catch (_) {
      host.replaceChildren();
    }
  }

  window.OfferHistoryChart = { mount, render };
})();