/* The front door's character-select device (home/index.html at `/`). The generator writes every tool as a real card in four
   class lists; this classic script runs synchronously at the end of <main>, before first paint, and turns the lists into the
   device: a tablist of classes, one card at a time (a scroll-snap carousel on a phone), a roster or scrubber, a counter. If it
   cannot run, the lists stay readable (front-door.css reveals them). Stored values are only compared, never written as markup. */
(function () {
  var rooms = document.querySelector('[data-door-rooms]');
  if (!rooms) return;
  var KEY = 'tools:door:v1', ORDER = ['instruments', 'models', 'workbenches', 'energy'], FIRST = {c: 'instruments', t: 'product:fermi'};
  var compactQuery = matchMedia('(max-width:719.98px), (max-height:500px) and (max-width:1000px) and (pointer:coarse)');
  var reduced = matchMedia('(prefers-reduced-motion:reduce)');
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  function stored() { try { var v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v.c === 'string' && typeof v.t === 'string' ? v : null; } catch (e) { return null; } }
  function save(c, t) { try { localStorage.setItem(KEY, JSON.stringify({c: c, t: t})); } catch (e) {} }

  try { build(); } catch (e) { rooms.classList.add('door-plain'); return; }

  function build() {
    var data = {}, cur = null, idx = 0, lockUntil = 0, drawTimer = 0, first = true;
    var device = el('div', 'door-device');
    var tabs = el('div', 'door-classes'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Choose a class');
    var stage = el('div', 'door-stage');
    var prev = el('button', 'door-arrow door-prev', '‹'), next = el('button', 'door-arrow door-next', '›');
    prev.type = next.type = 'button'; prev.setAttribute('aria-label', 'Previous tool'); next.setAttribute('aria-label', 'Next tool');
    var panels = el('div', 'door-panels'); panels.setAttribute('role', 'region'); panels.setAttribute('aria-label', 'Selected tool');
    var nav = el('div', 'door-nav'), rosters = el('div', 'door-rosters'), counter = el('div', 'door-counter');
    var live = el('div', 'door-live'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
    stage.append(prev, panels, next);
    nav.append(rosters, counter);
    device.append(tabs, stage, nav, live);

    ORDER.forEach(function (id, n) {
      var sec = rooms.querySelector('[data-class="' + id + '"]');
      var cards = Array.prototype.slice.call(sec.querySelectorAll('.door-card'));
      var c = data[id] = {id: id, sec: sec, list: sec.querySelector('.door-list'), cards: cards, label: sec.dataset.label, line: sec.dataset.line};
      var tab = el('button', 'door-tab'); tab.type = 'button'; tab.id = 'door-tab-' + id; tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', 'door-panel-' + id); tab.setAttribute('aria-selected', 'false'); tab.tabIndex = -1;
      tab.append(el('b', 'door-tab-name', sec.dataset.label), el('b', 'door-tab-short', sec.dataset.short), el('span', 'door-tab-line', sec.dataset.line));
      tab.addEventListener('click', function () { choose(id, 0, {}); });
      tabs.append(tab); c.tab = tab;
      sec.id = 'door-panel-' + id; sec.setAttribute('role', 'tabpanel'); sec.setAttribute('aria-labelledby', tab.id); sec.hidden = true;
      panels.append(sec);
      c.roster = roster(c); rosters.append(c.roster.el);
      c.io = new IntersectionObserver(function (entries) { onIntersect(c, entries); }, {root: c.list, threshold: [0.5]});
      cards.forEach(function (card) { c.io.observe(card); });
    });

    function roster(c) {
      var el0 = el('div', 'door-roster'); el0.setAttribute('role', 'group'); el0.setAttribute('aria-label', 'Tools in ' + c.label);
      el0.hidden = true;
      var buttons = [], group = null, lastJob = null;
      c.cards.forEach(function (card, i) {
        var job = card.dataset.job || '';
        if (!group || job !== lastJob) {
          group = el('div', 'door-roster-group'); if (job) group.append(el('span', 'door-roster-job', job));
          var row = el('div', 'door-roster-row'); group.append(row); group.row = row; el0.append(group); lastJob = job;
        }
        var b = el('button', 'door-thumb'); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-label', card.querySelector('.door-name').textContent);
        var art = card.querySelector('svg'); if (art) { var copy = art.cloneNode(true); copy.removeAttribute('class'); copy.setAttribute('class', 'sketch'); b.append(copy); }
        b.append(el('i', 'door-tick'));
        b.addEventListener('click', function () { if (scrub.moved) return; choose(c.id, i, {}); });
        group.row.append(b); group.style.flexGrow = group.row.children.length; buttons.push(b);
      });
      el0.classList.toggle('door-thumbs', c.cards.length <= 7);
      return {el: el0, buttons: buttons};
    }

    // ---- selection ----
    function compact() { return compactQuery.matches; }
    function choose(id, i, opts) {
      var c = data[id], changed = c !== cur;
      i = Math.max(0, Math.min(c.cards.length - 1, i));
      var card = c.cards[i];
      if (!changed && i === idx && !first && !opts.force) return;
      if (changed) {
        if (cur) { cur.sec.hidden = true; cur.roster.el.hidden = true; cur.tab.setAttribute('aria-selected', 'false'); cur.tab.tabIndex = -1; }
        c.sec.hidden = false; c.roster.el.hidden = false; c.tab.setAttribute('aria-selected', 'true'); c.tab.tabIndex = 0;
        if (!first) { c.sec.classList.remove('door-fade'); void c.sec.offsetWidth; c.sec.classList.add('door-fade'); }
        cur = c;
      }
      idx = i;
      c.cards.forEach(function (x, n) { x.classList.toggle('is-current', n === i); });
      c.roster.buttons.forEach(function (b, n) { b.setAttribute('aria-pressed', String(n === i)); });
      counter.textContent = (i + 1) + ' / ' + c.cards.length;
      counter.setAttribute('aria-hidden', 'true');
      if (!opts.init) live.textContent = card.querySelector('.door-name').textContent + '. ' + card.querySelector('.door-line').textContent + ' ' + (i + 1) + ' of ' + c.cards.length + '.';
      keepInView(c, i);
      if (compact() && opts.from !== 'scroll') toCard(c, i, opts.smooth && !reduced.matches);
      if (!first && !opts.from) arrive(card);
      else if (!first && opts.from === 'scroll') arrive(card);
      if (!opts.init) save(c.id, card.dataset.id);
      first = false;
    }
    function toCard(c, i, smooth) {
      var card = c.cards[i], left = card.offsetLeft - (c.list.clientWidth - card.offsetWidth) / 2;
      lockUntil = Date.now() + (smooth ? 700 : 120);
      if (smooth) c.list.scrollTo({left: left, behavior: 'smooth'}); else c.list.scrollLeft = left;
    }
    function keepInView(c, i) {   // keep the roster's own sideways scroll on the selection, never the page
      var r = c.roster.el, b = c.roster.buttons[i];
      if (r.scrollWidth <= r.clientWidth + 1) return;
      var rr = r.getBoundingClientRect(), br = b.getBoundingClientRect();
      if (br.left < rr.left + 8) r.scrollLeft += br.left - rr.left - 8;
      else if (br.right > rr.right - 8) r.scrollLeft += br.right - rr.right + 8;
    }
    function arrive(card) {
      if (reduced.matches) return;
      clearTimeout(drawTimer);
      Array.prototype.forEach.call(rooms.querySelectorAll('.door-arrive'), function (n) { n.classList.remove('door-arrive'); });
      void card.offsetWidth; card.classList.add('door-arrive');
      drawTimer = setTimeout(function () { card.classList.remove('door-arrive'); }, 760);
    }
    function step(d) {
      var n = cur.cards.length, i = idx + d;
      if (compact()) { if (i < 0 || i >= n) return; choose(cur.id, i, {smooth: true, from: 'step'}); return; }
      choose(cur.id, (i + n) % n, {});
    }
    function onIntersect(c, entries) {
      if (c !== cur || !compact() || Date.now() < lockUntil || scrub.active) return;
      entries.forEach(function (e) {
        if (!e.isIntersecting || e.intersectionRatio < 0.5) return;
        var i = c.cards.indexOf(e.target);
        if (i !== idx) choose(c.id, i, {from: 'scroll'});
      });
    }

    // ---- the scrubber (phone): drag along the strip and the cards follow ----
    var scrub = {active: false, moved: false, x0: 0, rects: null};
    function indexAt(x) {
      var best = 0, dist = 1e9;
      scrub.rects.forEach(function (r, i) { var d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0; var m = Math.abs((r.left + r.right) / 2 - x); if (d < dist || (d === dist && m < Math.abs((scrub.rects[best].left + scrub.rects[best].right) / 2 - x))) { dist = d; best = i; } });
      return best;
    }
    rosters.addEventListener('pointerdown', function (e) {
      if (!compact() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      scrub.active = true; scrub.moved = false; scrub.x0 = e.clientX;
      scrub.rects = cur.roster.buttons.map(function (b) { return b.getBoundingClientRect(); });
      try { rosters.setPointerCapture(e.pointerId); } catch (x) {}
      choose(cur.id, indexAt(e.clientX), {from: 'scrub'});
      toCard(cur, idx, false);
    });
    rosters.addEventListener('pointermove', function (e) {
      if (!scrub.active) return;
      if (Math.abs(e.clientX - scrub.x0) > 4) scrub.moved = true;
      var i = indexAt(e.clientX);
      if (i !== idx) { choose(cur.id, i, {from: 'scrub'}); toCard(cur, i, false); }
    });
    function endScrub(e) { if (!scrub.active) return; scrub.active = false; try { rosters.releasePointerCapture(e.pointerId); } catch (x) {} setTimeout(function () { scrub.moved = false; }, 0); lockUntil = Date.now() + 150; }
    rosters.addEventListener('pointerup', endScrub); rosters.addEventListener('pointercancel', endScrub);

    // ---- a horizontal drag never opens a tool ----
    var down = null;
    panels.addEventListener('pointerdown', function (e) { down = {x: e.clientX, y: e.clientY}; }, true);
    panels.addEventListener('click', function (e) {
      if (down && (Math.abs(e.clientX - down.x) > 8 || Math.abs(e.clientY - down.y) > 8)) { e.preventDefault(); e.stopPropagation(); }
      down = null;
    }, true);

    // ---- wide: arrows, keys, swipe ----
    prev.addEventListener('click', function () { step(-1); });
    next.addEventListener('click', function () { step(1); });
    device.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      var t = e.target, tab = t.closest && t.closest('[role=tab]');
      if (tab) {
        var n = ORDER.indexOf(tab.id.slice(9)), m = e.key === 'ArrowRight' ? n + 1 : e.key === 'ArrowLeft' ? n - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? ORDER.length - 1 : -1;
        if (m < 0) return;
        e.preventDefault(); m = (m + ORDER.length) % ORDER.length; choose(ORDER[m], 0, {}); data[ORDER[m]].tab.focus(); return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      if (document.activeElement && document.activeElement !== document.body) return;
      e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1);
    });
    var sw = null;
    stage.addEventListener('pointerdown', function (e) { sw = e.pointerType === 'touch' || e.pointerType === 'pen' ? {x: e.clientX, y: e.clientY} : null; });
    stage.addEventListener('pointerup', function (e) {
      if (!sw || compact()) { sw = null; return; }
      var dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    });
    stage.addEventListener('pointercancel', function () { sw = null; });
    compactQuery.addEventListener('change', function () { if (compact()) toCard(cur, idx, false); });

    // ---- start: a class in the hash wins, then the remembered tool, then Instruments / Fermi ----
    function hashClass() { var h = location.hash.slice(1); return ORDER.indexOf(h) >= 0 ? h : null; }
    var mem = stored() || FIRST, hc = hashClass(), cid = hc || (ORDER.indexOf(mem.c) >= 0 ? mem.c : FIRST.c), want = 0;
    if (!hc || mem.c === hc) {
      var k = data[cid].cards.map(function (x) { return x.dataset.id; }).indexOf(mem.t);
      want = k >= 0 ? k : cid === FIRST.c ? data[cid].cards.map(function (x) { return x.dataset.id; }).indexOf(FIRST.t) : 0;
    }
    rooms.append(device);
    rooms.classList.add('is-device');
    choose(cid, Math.max(0, want), {init: true});
    if (compact()) toCard(cur, idx, false);
    addEventListener('hashchange', function () { var h = hashClass(); if (h) choose(h, 0, {}); });
    addEventListener('pageshow', function () { if (compact()) toCard(cur, idx, false); });
    requestAnimationFrame(function () { if (compact()) toCard(cur, idx, false); });
    rooms.classList.add('door-ready');
  }
})();
