/* Rail proximity is a spatial description, never an observed transfer. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const RADII = ['300', '500', '800'];
  const ROLES = ['none', 'single', 'multiple'];
  const LABELS = {none: '未鄰近已收錄捷運站', single: '鄰近1站', multiple: '鄰近2站以上'};
  const COLORS = {none: '#9b7253', single: '#43818a', multiple: '#366a51', unknown: '#a0a7a0'};
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const svgEl = (tag, attributes, text) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attributes || {}).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const pct = value => Number.isFinite(value) && value >= 0 && value <= 1 ? `${(value * 100).toFixed(1)}%` : '未知';
  const district = (route, end) => route[`${end}_district_name`] || '行政區未知';
  const routeLabel = route => `${route.name || '未命名路線'} · ${district(route, 'start')} → ${district(route, 'end')}`;

  window.initDestinationRail = function initDestinationRail(data, onSelectRoute) {
    const root = document.getElementById('rail-roles');
    if (!root) throw new Error('Rail visualization requires #rail-roles');
    if (root._destroyDestinationRail) root._destroyDestinationRail();
    const controller = new AbortController();
    const routes = Array.isArray(data?.routes) ? data.routes : [];
    const byId = new Map(routes.map(route => [route.parent_id, route]));
    let radius = '500';
    let filter = 'all';
    let selectedId = null;
    let lastWidth = 0;
    root.innerHTML = `<header class="rail-heading"><p class="rail-eyebrow">公車與捷運的空間關係</p><h2>一條公車，連接多少個捷運節點？</h2><p>往右看，路線鄰近的捷運站更多；往上看，離已收錄捷運入口較遠的公車站牌占比較高。每一點是一條母路線的代表行駛方向。</p></header><div class="rail-controls"><label for="rail-threshold">捷運鄰近門檻<select id="rail-threshold"><option value="300">300公尺</option><option value="500" selected>500公尺（主比較）</option><option value="800">800公尺</option></select></label><label for="rail-role-filter">路線空間類別<select id="rail-role-filter"><option value="all">全部類別</option><option value="none">未鄰近已收錄捷運站</option><option value="single">鄰近1站</option><option value="multiple">鄰近2站以上</option></select></label></div><p class="rail-note">門檻是站牌到已收錄出入口的平面距離，未計入步行道路、過街或入口開放條件。這些類別不能直接判定實際接駁、轉乘或替代效果。</p><div class="rail-legend" data-rail-legend></div><div class="rail-threshold-bars" data-rail-bars></div><p class="rail-status" data-rail-status aria-live="polite"></p><div class="rail-plot"><svg data-rail-scatter role="img" aria-labelledby="rail-scatter-title rail-scatter-description"></svg><div class="rail-tooltip" data-rail-tooltip hidden></div></div><p class="rail-caption">橫軸：不同捷運站數。縱軸：超出門檻的實體站牌占比。同座標的路線可能疊在一起；可用下方選單逐條查閱。比例未知者保留於選單，未畫成0%。</p><div class="rail-selection"><label for="rail-route-select">選取公車路線<select id="rail-route-select"></select></label><p class="rail-caption">鍵盤可操作選單；選取後同步到本頁的路線比較。</p><div data-rail-detail class="rail-detail" aria-live="polite"></div></div>`;
    const thresholdInput = root.querySelector('#rail-threshold');
    const filterInput = root.querySelector('#rail-role-filter');
    const routeInput = root.querySelector('#rail-route-select');
    const plot = root.querySelector('[data-rail-scatter]');
    const tooltip = root.querySelector('[data-rail-tooltip]');
    const detail = root.querySelector('[data-rail-detail]');
    const info = route => route?.metro_proximity?.[radius] || null;
    const roleOf = record => ROLES.includes(record?.metro_role) ? record.metro_role : 'unknown';
    const records = () => routes.filter(route => filter === 'all' || roleOf(info(route)) === filter);
    const fractionKnown = record => record && Number.isFinite(record.outside_stop_fraction) && record.outside_stop_fraction >= 0 && record.outside_stop_fraction <= 1;

    function renderBars() {
      const target = root.querySelector('[data-rail-bars]');
      target.replaceChildren(el('h3', '改變距離門檻，三種類別如何移動？'));
      const caption = el('p', `各列以全部 ${routes.length.toLocaleString()} 條母路線為分母；分類篩選只作用於下方散點與選單。`, 'rail-caption');
      target.append(caption);
      RADII.forEach(threshold => {
        const counts = {none: 0, single: 0, multiple: 0, unknown: 0};
        routes.forEach(route => counts[roleOf(route.metro_proximity?.[threshold])]++);
        const row = el('div', undefined, 'rail-bar-row');
        row.dataset.threshold = threshold;
        if (threshold === radius) row.classList.add('rail-active');
        const button = el('button', `${threshold}公尺`);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(threshold === radius));
        button.setAttribute('aria-label', `查看${threshold}公尺門檻`);
        button.addEventListener('click', () => {radius = threshold; thresholdInput.value = radius; render();});
        const bar = el('div', undefined, 'rail-stacked');
        bar.setAttribute('role', 'img');
        bar.setAttribute('aria-label', [...ROLES, 'unknown'].map(role => `${LABELS[role] || '類別未知'} ${counts[role]}條`).join('，'));
        [...ROLES, 'unknown'].forEach(role => {
          if (!counts[role]) return;
          const segment = el('span', String(counts[role]));
          segment.style.flex = String(counts[role]);
          segment.style.backgroundColor = COLORS[role];
          segment.title = `${LABELS[role] || '類別未知'}：${counts[role]}條（${pct(counts[role] / routes.length)}）`;
          bar.append(segment);
        });
        if (!routes.length) bar.append(el('span', '尚無路線資料'));
        row.append(button, bar);
        target.append(row);
      });
    }

    function renderDetail() {
      detail.replaceChildren();
      const route = byId.get(selectedId);
      if (!route) {detail.append(el('p', '選取散點或使用選單，查看這條公車的站牌分布與捷運節點。')); return;}
      const record = info(route);
      detail.append(el('h3', routeLabel(route)));
      if (!record) {detail.append(el('p', `此路線在${radius}公尺門檻的資料尚未取得。`)); return;}
      const count = Array.isArray(record.metro_nodes) ? record.metro_nodes.length : 0;
      detail.append(el('p', `${radius}公尺內鄰近 ${count} 個不同捷運站；超出門檻的實體站牌占比 ${pct(record.outside_stop_fraction)}。`));
      if (Number.isInteger(record.stop_count)) {
        const outside = Number.isInteger(record.outside_stop_count) ? record.outside_stop_count : '未知';
        detail.append(el('p', `分母為 ${record.stop_count} 個不重複實體站牌，超出門檻者 ${outside} 個。`, 'rail-caption'));
      }
      if (count) {
        detail.append(el('p', '依公車行駛站序首次鄰近的捷運站', 'rail-sequence-title'));
        const list = el('ol', undefined, 'rail-sequence');
        record.metro_nodes.forEach(node => {
          const item = el('li');
          item.append(el('strong', node.name || '站名未知'));
          if (Number.isInteger(node.first_stop_sequence)) item.append(el('small', `公車站序 ${node.first_stop_sequence}`));
          list.append(item);
        });
        detail.append(list, el('p', '圖列表示鄰近節點的首次出現順序；不是乘客實際轉乘紀錄或捷運搭乘路徑。', 'rail-caption'));
      } else detail.append(el('p', '未鄰近已收錄捷運站，不代表沒有服務其他軌道系統。', 'rail-caption'));
    }

    function selectRoute(id, emit = false) {
      if (!byId.has(id)) return false;
      selectedId = id;
      if (filter !== 'all' && roleOf(info(byId.get(id))) !== filter) {filter = 'all'; filterInput.value = 'all'; render();}
      else {routeInput.value = id; renderDetail(); renderPlot();}
      if (emit && typeof onSelectRoute === 'function') onSelectRoute(id);
      return true;
    }

    function renderPlot() {
      const shown = records();
      const known = shown.filter(route => fractionKnown(info(route)));
      const width = Math.max(300, Math.min(1100, root.querySelector('.rail-plot').clientWidth || 700));
      const height = width < 500 ? 350 : 410;
      lastWidth = width;
      const left = 47, right = 24, top = 25, bottom = 50;
      const maxX = Math.max(1, ...routes.map(route => Array.isArray(info(route)?.metro_nodes) ? info(route).metro_nodes.length : 0));
      const x = value => left + value / maxX * (width - left - right);
      const y = value => height - bottom - value * (height - top - bottom);
      plot.replaceChildren();
      plot.setAttribute('viewBox', `0 0 ${width} ${height}`);
      plot.setAttribute('data-threshold', radius);
      plot.append(svgEl('title', {id: 'rail-scatter-title'}, `${radius}公尺門檻的公車與捷運空間關係`));
      plot.append(svgEl('desc', {id: 'rail-scatter-description'}, `橫軸為不同捷運站數，縱軸為超出門檻的實體站牌比例。${known.length}條比例已知路線。可使用下方選單操作所有路線。`));
      [0, .25, .5, .75, 1].forEach(value => {
        plot.append(svgEl('line', {x1:left,y1:y(value),x2:width-right,y2:y(value),stroke:'#d6dfd6'}));
        plot.append(svgEl('text', {x:left-9,y:y(value)+4,'text-anchor':'end',class:'rail-axis'}, `${value*100}%`));
      });
      const step = Math.max(1, Math.ceil(maxX / (width < 500 ? 5 : 10)));
      const ticks = new Set([0, maxX]);
      for (let value = step; value < maxX; value += step) ticks.add(value);
      [...ticks].sort((a,b)=>a-b).forEach(value => plot.append(svgEl('text', {x:x(value),y:height-bottom+21,'text-anchor':'middle',class:'rail-axis'}, value)));
      plot.append(svgEl('text', {x:(left+width-right)/2,y:height-7,'text-anchor':'middle',class:'rail-axis'}, '鄰近的不同捷運站數'));
      plot.append(svgEl('text', {x:left,y:14,class:'rail-axis'}, '超出門檻的實體站牌占比'));
      known.sort((a,b) => (a.parent_id===selectedId ? 1 : 0) - (b.parent_id===selectedId ? 1 : 0)).forEach(route => {
        const record = info(route);
        const selected = route.parent_id === selectedId;
        const circle = svgEl('circle', {cx:x(record.metro_nodes.length),cy:y(record.outside_stop_fraction),r:selected?6.5:4,
          fill:COLORS[roleOf(record)],opacity:selected?1:.56,stroke:selected?'#1e2f29':'none','stroke-width':2,'data-route':route.parent_id,'aria-hidden':'true'});
        const description = `${routeLabel(route)}；鄰近${record.metro_nodes.length}站；超出門檻${pct(record.outside_stop_fraction)}`;
        circle.append(svgEl('title', {}, description));
        circle.addEventListener('pointerenter', () => {tooltip.textContent=description; tooltip.hidden=false;});
        circle.addEventListener('pointerleave', () => {tooltip.hidden=true;});
        circle.addEventListener('click', () => {tooltip.hidden=true; selectRoute(route.parent_id,true);});
        plot.append(circle);
      });
      if (!known.length) plot.append(svgEl('text', {x:width/2,y:height/2,'text-anchor':'middle',class:'rail-empty'}, shown.length ? '此類路線的完整比例皆未知' : '此門檻下沒有符合類別的路線'));
      root.querySelector('[data-rail-status]').textContent = `${radius}公尺門檻 · 篩選 ${shown.length.toLocaleString()} 條路線 · 圖中 ${known.length.toLocaleString()} 條 · 完整比例未知 ${shown.length-known.length} 條。`;
    }

    function render() {
      tooltip.hidden = true;
      const shown = records();
      if (!shown.some(route => route.parent_id === selectedId)) selectedId = null;
      routeInput.replaceChildren();
      const placeholder = el('option', shown.length ? `從 ${shown.length.toLocaleString()} 條路線中選取` : '沒有符合條件的路線');
      placeholder.value = '';
      routeInput.append(placeholder);
      shown.forEach(route => {const option=el('option',routeLabel(route)); option.value=route.parent_id; routeInput.append(option);});
      routeInput.value = selectedId || '';
      routeInput.disabled = !shown.length;
      renderBars(); renderPlot(); renderDetail();
    }

    const legend = root.querySelector('[data-rail-legend]');
    ROLES.forEach(role => {const item=el('span'); const dot=el('i'); dot.style.backgroundColor=COLORS[role]; item.append(dot,document.createTextNode(LABELS[role])); legend.append(item);});
    thresholdInput.addEventListener('change', () => {radius=thresholdInput.value; render();}, {signal:controller.signal});
    filterInput.addEventListener('change', () => {filter=filterInput.value; render();}, {signal:controller.signal});
    routeInput.addEventListener('change', () => {if (routeInput.value) selectRoute(routeInput.value,true);}, {signal:controller.signal});
    window.addEventListener('resize', () => {
      const width=Math.max(300,Math.min(1100,root.querySelector('.rail-plot')?.clientWidth || 700));
      if (Math.abs(width-lastWidth)>1) renderPlot();
    }, {signal:controller.signal});
    render();
    function destroy() {controller.abort(); root.replaceChildren(); delete root._destroyDestinationRail;}
    root._destroyDestinationRail = destroy;
    return {selectRoute: id => selectRoute(id,false), destroy};
  };
})();
