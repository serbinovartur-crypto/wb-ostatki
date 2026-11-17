// Вкладка «Конкуренты»: переключатель «Карточки / Таблица».
// Таблица: слева конкуренты (фото, название, артикул), сверху свои карточки
// (фото, _01…_08, артикул), в ячейках — позиция в «Смотрите также»:
// зелёным близкие (до 10), жёлтым средние (11–35), красным далёкие (36+).
// Данные берутся из GET /api/competitors/table (уже сохранённые сканы).
// Кнопка «Обновить» ставит запрос на обновление и ждёт новый замер.
(function () {
  'use strict';

  var MODE_KEY = 'competitorsViewMode';
  var pollTimer = null;
  var lastData = null;

  function api() { return (typeof API_BASE !== 'undefined') ? API_BASE : ''; }
  function key() { return (typeof API_KEY !== 'undefined') ? API_KEY : ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtTime(iso) {
    if (!iso) return 'нет данных';
    try {
      return new Date(iso).toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      }) + ' МСК';
    } catch (e) { return iso; }
  }

  function addStyle() {
    var css =
      '.ct-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0 14px;}' +
      '.ct-seg{display:inline-flex;border:1px solid #d8d5cd;border-radius:20px;overflow:hidden;background:#fff;}' +
      '.ct-seg button{border:0;background:#fff;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}' +
      '.ct-seg button.on{background:#1b1b1b;color:#fff;}' +
      '.ct-refresh{border:1px solid #d8d5cd;background:#f6f5f3;border-radius:20px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}' +
      '.ct-refresh:hover{background:#eceae3;}.ct-refresh[disabled]{opacity:.6;cursor:default;}' +
      '.ct-status{font-size:12px;color:#777;}' +
      '.ct-cat{font-weight:700;font-size:14px;margin:18px 0 8px;color:#333;}' +
      '.ct-wrap{overflow-x:clip;max-width:100%;border:1px solid #e2e0da;border-radius:10px;background:#fff;}' +
      'table.ct-table{border-collapse:separate;border-spacing:0;font-size:13px;width:100%;table-layout:auto;}' +
      'table.ct-table th,table.ct-table td{border:0;border-right:1px solid #eceae5;border-bottom:1px solid #eceae5;padding:6px 8px;text-align:center;vertical-align:middle;}' +
      'table.ct-table thead th{background:#faf9f7;position:sticky;top:var(--ct-top,56px);z-index:5;font-weight:600;box-shadow:0 1px 0 #d8d5cd;}' +
      'table.ct-table .ct-name{background:#fff;text-align:left;min-width:200px;}' +
      'table.ct-table thead th.ct-name{background:#faf9f7;z-index:3;}' +
      '.ct-ph{width:46px;height:46px;object-fit:cover;border-radius:6px;background:#eee;display:block;margin:0 auto 3px;}' +
      '.ct-comp{display:flex;gap:9px;align-items:center;}' +
      '.ct-comp .ct-ph{margin:0;flex-shrink:0;}' +
      '.ct-cname{font-weight:600;font-size:12px;line-height:1.25;max-height:30px;overflow:hidden;max-width:210px;}' +
      '.ct-art{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#666;}' +
      '.ct-cp{border:1px solid #d8d5cd;background:#fff;border-radius:4px;cursor:pointer;font-size:10px;padding:0 4px;margin-left:3px;line-height:15px;}' +
      '.ct-cp.ok{background:#d9f5dd;border-color:#8c8;}' +
      '.ct-lbl{font-weight:700;font-size:13px;}' +
      '.ct-g{background:#c9efd2;font-weight:700;}.ct-y{background:#fff0b8;font-weight:700;}.ct-r{background:#fbd3d3;font-weight:700;}' +
      '.ct-n{color:#bbb;}' +
      '.ct-d{display:block;font-size:10px;font-weight:700;}.ct-d.up{color:#2e7d32;}.ct-d.down{color:#c0392b;}' +
      '.ct-time{font-size:10px;color:#999;}' +
      '.ct-ad{display:inline-block;margin-top:3px;font-size:10px;font-weight:700;border-radius:8px;padding:1px 6px;white-space:nowrap;}' +
      '.ct-ad.on{background:#e3ecff;color:#1d4ed8;}.ct-ad.off{background:#f0efec;color:#999;font-weight:600;}' +
      '.ct-inactive{opacity:.45;}';
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
    // шапка таблицы прилипает прямо под закреплённой полосой вкладок сайта
    function setTop() {
      var tabs = document.querySelector('.tabs');
      var h = tabs ? Math.round(tabs.getBoundingClientRect().height) : 0;
      document.documentElement.style.setProperty('--ct-top', h + 'px');
    }
    setTop();
    window.addEventListener('resize', setTop);
  }

  function copyText(text, btn) {
    function done() {
      btn.classList.add('ok'); var t = btn.textContent; btn.textContent = '✓';
      setTimeout(function () { btn.classList.remove('ok'); btn.textContent = t; }, 1000);
    }
    function fb() {
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      ta.remove();
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fb); else fb();
  }

  function cp(v) { return '<button type="button" class="ct-cp" data-cp="' + esc(v) + '" title="Копировать">⧉</button>'; }

  function cellHtml(pos, prev) {
    if (pos == null) return '<td class="ct-n">—</td>';
    var cls = pos <= 10 ? 'ct-g' : (pos <= 35 ? 'ct-y' : 'ct-r');
    var d = '';
    if (prev != null && prev !== pos) {
      var diff = prev - pos; // >0 — стала выше
      d = '<span class="ct-d ' + (diff > 0 ? 'up' : 'down') + '">' + (diff > 0 ? '▲' : '▼') + Math.abs(diff) + '</span>';
    }
    return '<td class="' + cls + '">' + pos + d + '</td>';
  }

  // реклама на полках (рекомендации) в момент замера: CPM/CPC + ставка; поиск не показываем
  function adChip(ad, nm) {
    if (!ad || !ad.byNm) return '';
    var list = ad.byNm[String(nm)];
    if (!list || !list.length) return '<div class="ct-ad off">реклама выкл</div>';
    return list.map(function (a) {
      return '<div class="ct-ad on">' + esc(a.t) + ' ' + String(a.bid).replace('.', ',') + '</div>';
    }).join('');
  }

  function renderCategory(cat) {
    if (!cat.cards.length) {
      return '<div class="ct-cat">' + esc(cat.label) + '</div><div class="ct-status">Для этой категории пока нет данных о своих карточках в сканах.</div>';
    }
    var h = '<div class="ct-cat">' + esc(cat.label) + '</div><div class="ct-wrap"><table class="ct-table"><thead><tr><th class="ct-name">Конкурент</th>';
    cat.cards.forEach(function (c) {
      var ph = c.photo ? '<img class="ct-ph" src="' + esc(c.photo) + '" alt="">' : '<div class="ct-ph"></div>';
      h += '<th>' + ph + '<div class="ct-lbl">' + esc(c.label) + '</div><div class="ct-art">' + c.nmID + cp(c.nmID) + '</div>' + adChip(cat.ad, c.nmID) + '</th>';
    });
    h += '</tr></thead><tbody>';
    cat.rows.forEach(function (r) {
      var ph = r.photo ? '<img class="ct-ph" src="' + esc(r.photo) + '" alt="">' : '<div class="ct-ph"></div>';
      h += '<tr class="' + (r.active ? '' : 'ct-inactive') + '"><td class="ct-name"><div class="ct-comp">' + ph + '<div>' +
        '<div class="ct-cname">' + esc(r.name) + '</div><div class="ct-art">' + r.nmID + cp(r.nmID) + '</div>' +
        '<div class="ct-time">' + esc(fmtTime(r.scannedAt)) + (r.refreshRequestedAt ? ' · ждёт обновления' : '') + '</div></div></div></td>';
      cat.cards.forEach(function (c) {
        h += cellHtml(r.pos[String(c.nmID)], r.prev[String(c.nmID)]);
      });
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  function maxScan(data) {
    var m = '';
    (data.categories || []).forEach(function (c) { c.rows.forEach(function (r) { if (r.scannedAt && r.scannedAt > m) m = r.scannedAt; }); });
    return m;
  }

  function render(data) {
    lastData = data;
    var box = document.getElementById('ct-table-view');
    if (!box) return;
    var html = '';
    (data.categories || []).forEach(function (cat) { html += renderCategory(cat); });
    if (!html) html = '<div class="ct-status">Пока нет конкурентов.</div>';
    box.innerHTML = html;
    var st = document.getElementById('ct-status');
    if (st && !pollTimer) st.textContent = 'Последний замер: ' + fmtTime(maxScan(data)) + '. ▲/▼ — изменение к предыдущему замеру.';
  }

  function load() {
    return fetch(api() + '/api/competitors/table').then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.categories) render(d);
      return d;
    }).catch(function () {
      var box = document.getElementById('ct-table-view');
      if (box) box.innerHTML = '<div class="ct-status" style="color:#b00020;">Не удалось загрузить таблицу</div>';
    });
  }

  function requestRefresh() {
    var btn = document.getElementById('ct-refresh');
    var st = document.getElementById('ct-status');
    if (!lastData) return;
    var before = maxScan(lastData);
    var ids = [];
    lastData.categories.forEach(function (c) { c.rows.forEach(function (r) { if (r.active) ids.push(r.id); }); });
    btn.disabled = true;
    Promise.all(ids.map(function (id) {
      return fetch(api() + '/api/competitors/' + id + '/request-refresh', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': key() } });
    })).then(function () {
      st.textContent = 'Запрос на обновление отправлен. Позиции обновятся автоматически, когда придёт новый замер…';
      var tries = 0;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(function () {
        tries++;
        load().then(function (d) {
          if (d && maxScan(d) > before) {
            clearInterval(pollTimer); pollTimer = null; btn.disabled = false;
            st.textContent = 'Обновлено: ' + fmtTime(maxScan(d)) + '.';
          } else if (tries > 60) { // ~10 минут
            clearInterval(pollTimer); pollTimer = null; btn.disabled = false;
            st.textContent = 'Новый замер пока не пришёл. Запрос сохранён, он выполнится при следующем замере.';
          }
        });
      }, 10000);
    }).catch(function () {
      btn.disabled = false; st.textContent = 'Не удалось отправить запрос.';
    });
  }

  function setMode(mode) {
    var tiles = [document.getElementById('competitors-list'), document.getElementById('competitors-refresh-all-btn')];
    var form = document.querySelector('#tab-competitors .add-competitor-form');
    if (form) tiles.push(form);
    var view = document.getElementById('ct-table-view');
    var ref = document.getElementById('ct-refresh');
    var st = document.getElementById('ct-status');
    var tbl = mode === 'table';
    tiles.forEach(function (el) { if (el) el.style.display = tbl ? 'none' : ''; });
    view.style.display = tbl ? '' : 'none';
    ref.style.display = tbl ? '' : 'none';
    st.style.display = tbl ? '' : 'none';
    document.querySelectorAll('#ct-seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === mode); });
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
    if (tbl) load();
  }

  function init() {
    var panel = document.getElementById('tab-competitors');
    if (!panel || document.getElementById('ct-seg')) return;
    addStyle();
    var bar = document.createElement('div');
    bar.className = 'ct-toolbar';
    bar.innerHTML =
      '<span class="ct-seg" id="ct-seg"><button type="button" data-mode="tiles">Карточки</button><button type="button" data-mode="table">Таблица</button></span>' +
      '<button type="button" class="ct-refresh" id="ct-refresh" style="display:none">&#8635; Обновить</button>' +
      '<span class="ct-status" id="ct-status" style="display:none"></span>';
    var view = document.createElement('div');
    view.id = 'ct-table-view';
    view.style.display = 'none';
    var hint = panel.querySelector('.hint');
    if (hint && hint.nextSibling) { panel.insertBefore(bar, hint.nextSibling); } else { panel.insertBefore(bar, panel.firstChild); }
    bar.parentNode.insertBefore(view, bar.nextSibling);
    bar.querySelector('#ct-seg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (b) setMode(b.dataset.mode);
    });
    document.getElementById('ct-refresh').addEventListener('click', requestRefresh);
    view.addEventListener('click', function (e) {
      var b = e.target.closest('.ct-cp'); if (b) copyText(b.dataset.cp, b);
    });
    var mode = 'tiles';
    try { mode = localStorage.getItem(MODE_KEY) || 'tiles'; } catch (e) {}
    setMode(mode === 'table' ? 'table' : 'tiles');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
