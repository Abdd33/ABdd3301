/* Direct project reader with a bottom page drawer and wheel navigation. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const portfolio = Array.isArray(window.PORTFOLIO) ? window.PORTFOLIO : [];
  const projectIndex = portfolio.findIndex(p => p.id === document.body.dataset.project);
  const project = portfolio[projectIndex];
  if (!project?.pages?.length) { $('projectError').hidden = false; return; }
  const pages = project.pages, pad = n => String(n).padStart(2, '0');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const dialog = $('pageDialog'), canvas = $('pageCanvas'), image = $('pageImage');
  const scroll = $('readerScroll'), select = $('pageSelect');
  const cache = new Map(), dockCards = [];
  const dockTrack = $('dockTrack'), dockScroller = $('dockScroller');
  dockTrack.style.setProperty('--page-count', pages.length);
  let current = -1, requested = -1, revision = 0, draining = false;
  let interruptLoad = null, failedTarget = null, freshOpening = true;
  let animations = [], writeHash = true;

  $('readerProject').textContent = project.en;
  $('totalPages').textContent = pad(pages.length);

  pages.forEach((page, index) => {
    const option = document.createElement('option'); option.value = String(index);
    option.textContent = `${pad(index + 1)} · ${page.title}`; select.appendChild(option);

    const dockButton = document.createElement('button');
    dockButton.type = 'button'; dockButton.className = 'dock-item'; dockButton.id = `dock-page-${index + 1}`;
    dockButton.setAttribute('aria-label', `切换到第 ${pad(index + 1)} 页：${page.title}`);
    dockButton.tabIndex = index === 0 ? 0 : -1;
    const dockWindow = document.createElement('span'); dockWindow.className = 'dock-window';
    const dockPaper = document.createElement('span'); dockPaper.className = 'dock-paper';
    const dockImage = document.createElement('img');
    dockImage.src = page.thumb || page.img; dockImage.alt = ''; dockImage.draggable = false; dockImage.decoding = 'async';
    dockImage.addEventListener('error', () => { if (dockImage.getAttribute('src') !== page.img) dockImage.src = page.img; });
    dockPaper.appendChild(dockImage); dockWindow.appendChild(dockPaper);
    const dockNumber = document.createElement('span'); dockNumber.className = 'dock-number'; dockNumber.textContent = pad(index + 1);
    const dockTitle = document.createElement('span'); dockTitle.className = 'dock-title'; dockTitle.textContent = page.title;
    dockButton.append(dockWindow, dockNumber, dockTitle);
    dockButton.addEventListener('click', () => requestPage(index));
    dockButton.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') prepare(index).catch(() => {}); });
    dockButton.addEventListener('focus', () => prepare(index).catch(() => {}));
    dockButton.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight') target = Math.min(pages.length - 1, index + 1);
      else if (event.key === 'ArrowLeft') target = Math.max(0, index - 1);
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = pages.length - 1;
      else return;
      event.preventDefault(); event.stopPropagation();
      dockCards[target].focus({ preventScroll: true }); showDockPage(target); requestPage(target);
    });
    dockTrack.appendChild(dockButton); dockCards.push(dockButton);
  });

  function showDockPage(index) {
    const item = dockCards[index], left = item.offsetLeft, right = left + item.offsetWidth;
    const edge = 16, visibleLeft = dockScroller.scrollLeft, visibleRight = visibleLeft + dockScroller.clientWidth;
    if (left < visibleLeft + edge) dockScroller.scrollTo({left: Math.max(0, left - edge), behavior: reduce.matches ? 'instant' : 'smooth'});
    else if (right > visibleRight - edge) dockScroller.scrollTo({left: right - dockScroller.clientWidth + edge, behavior: reduce.matches ? 'instant' : 'smooth'});
  }

  function prepare(index) {
    if (cache.has(index)) return cache.get(index);
    const promise = new Promise((resolve, reject) => {
      const prepared = new Image(); prepared.decoding = 'async';
      const timer = setTimeout(() => reject(new Error('Image timeout')), 15000);
      prepared.onload = async () => {
        try { if (prepared.decode) await prepared.decode(); if (!prepared.naturalWidth) throw new Error('Empty image'); clearTimeout(timer); resolve(prepared); }
        catch (error) { clearTimeout(timer); reject(error); }
      };
      prepared.onerror = () => { clearTimeout(timer); reject(new Error('Image unavailable')); };
      prepared.src = pages[index].img;
    });
    cache.set(index, promise);
    promise.catch(() => { if (cache.get(index) === promise) cache.delete(index); });
    return promise;
  }
  function warmAdjacent() {
    for (const index of [current - 1, current + 1]) if (index >= 0 && index < pages.length) prepare(index).catch(() => {});
    // Keep full-size decoded images bounded while every thumbnail stays available.
    for (const index of cache.keys()) if (Math.abs(index - current) > 3 && index !== requested) cache.delete(index);
  }
  function details(index, updateHash) {
    const page = pages[index];
    $('pageTitle').textContent = page.title; $('pageNote').textContent = page.note || '';
    $('currentPage').textContent = pad(index + 1); select.value = String(index);
    $('previousPage').disabled = index === 0; $('nextPage').disabled = index === pages.length - 1;
    dockCards.forEach((card, i) => {
      card.classList.toggle('is-current', i === index); card.tabIndex = i === index ? 0 : -1;
      if (i === index) card.setAttribute('aria-current', 'page'); else card.removeAttribute('aria-current');
    });
    // Preserve a keyboard user's intended target while an earlier image finishes loading.
    const focusedDock = dockCards.indexOf(document.activeElement);
    showDockPage(focusedDock >= 0 ? focusedDock : index);
    if (updateHash) try { history.replaceState(null, '', `#page-${index + 1}`); } catch (_) {}
  }
  async function reveal(index, prepared, updateHash) {
    const direction = index > current ? 1 : -1;
    const animate = current >= 0 && !freshOpening && !reduce.matches && typeof image.animate === 'function';
    const oldTop = image.offsetTop, oldWidth = image.getBoundingClientRect().width, oldHeight = image.getBoundingClientRect().height;
    const outgoing = animate ? image.cloneNode(false) : null;
    if (outgoing) { outgoing.removeAttribute('id'); outgoing.alt = ''; outgoing.setAttribute('aria-hidden', 'true'); outgoing.className = 'outgoing-page'; outgoing.style.top = oldTop + 'px'; outgoing.style.width = oldWidth + 'px'; outgoing.style.height = oldHeight + 'px'; canvas.appendChild(outgoing); }
    canvas.classList.toggle('is-tall', pages[index].height > pages[index].width);
    image.src = prepared.src; image.width = pages[index].width; image.height = pages[index].height;
    image.alt = `${project.en} · ${pages[index].title}，第 ${index + 1} 页，共 ${pages.length} 页`;
    current = index; freshOpening = false; canvas.style.visibility = 'visible';
    scroll.scrollTo({ top: 0, left: 0, behavior: 'instant' }); details(index, updateHash);
    canvas.dataset.phase = 'transition';
    if (animate) {
      const timing = { duration: 620, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' };
      animations = [
        image.animate([{ opacity: 0, transform: `translateY(${direction * 30}px)` }, { opacity: 1, transform: 'translateY(0)' }], timing),
        outgoing.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: `translateY(${direction * -22}px)` }], timing)
      ];
      await Promise.all(animations.map(a => a.finished.catch(() => {})));
      outgoing.remove(); animations.forEach(a => a.cancel()); animations = [];
    }
    canvas.dataset.phase = 'idle'; warmAdjacent();
  }
  async function drain() {
    if (draining) return; draining = true;
    try {
      while (dialog.open && (requested !== current || freshOpening)) {
        const target = requested, ticket = revision, updateHash = writeHash;
        if (target < 0) break;
        failedTarget = null; $('imageError').hidden = true; canvas.dataset.phase = 'loading';
        const timer = setTimeout(() => { if (ticket === revision && dialog.open) $('loading').hidden = false; }, freshOpening ? 0 : 200);
        const superseded = new Promise(resolve => { interruptLoad = () => resolve(null); });
        let prepared;
        try { prepared = await Promise.race([prepare(target), superseded]); }
        catch (_) {
          if (ticket !== revision || !dialog.open) continue;
          failedTarget = target; requested = current; $('imageError').hidden = false;
          if (current >= 0) select.value = String(current);
          break;
        } finally { interruptLoad = null; clearTimeout(timer); $('loading').hidden = true; }
        if (!prepared || ticket !== revision || !dialog.open) continue;
        await reveal(target, prepared, updateHash);
      }
    } finally { draining = false; canvas.dataset.phase = 'idle'; }
  }
  function requestPage(index, updateHash = true) {
    requested = Math.max(0, Math.min(pages.length - 1, index));
    writeHash = updateHash; revision++; if (interruptLoad) interruptLoad();
    if (requested === current && !freshOpening) { failedTarget = null; $('imageError').hidden = true; $('loading').hidden = true; }
    if (current >= 0) select.value = String(current);
    drain();
  }
  function openFile(index, updateHash = true) {
    if (!dialog.open) {
      freshOpening = true; canvas.style.visibility = 'hidden';
      document.body.classList.add('reader-open'); dialog.showModal();
      $('closeReader').focus();
      if (!reduce.matches) dialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' });
    }
    requestPage(index, updateHash);
  }
  function go(delta) { if (dialog.open) requestPage(Math.max(0, requested) + delta); }
  // One page per wheel gesture. Long images scroll natively until their edge;
  // the next deliberate gesture changes pages rather than consuming inertia.
  let wheelTotal = 0, wheelLast = 0, wheelLocked = false, wheelCooldown = 0;
  scroll.addEventListener('wheel', event => {
    if (!dialog.open || event.ctrlKey || event.metaKey || event.altKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
    const now = performance.now();
    if (now - wheelLast > 180) { wheelTotal = 0; wheelLocked = false; }
    wheelLast = now;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientHeight : 1);
    const direction = Math.sign(delta);
    if (now < wheelCooldown || draining || current < 0) { event.preventDefault(); return; }
    const maxScroll = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    const canScroll = direction > 0 ? scroll.scrollTop < maxScroll - 2 : scroll.scrollTop > 2;
    if (maxScroll > 4 && canScroll) {
      wheelTotal = 0; wheelLocked = true;
      return; // Keep this gesture for reading the tall page, even when it reaches an edge.
    }
    event.preventDefault();
    if (wheelLocked) return;
    if (wheelTotal && Math.sign(wheelTotal) !== direction) wheelTotal = 0;
    wheelTotal += delta;
    if (Math.abs(wheelTotal) < 45) return;
    wheelLocked = true; wheelTotal = 0;
    const target = current + direction;
    if (target < 0 || target >= pages.length) return;
    wheelCooldown = now + 760;
    requestPage(target);
  }, { passive: false });
  $('previousPage').addEventListener('click', () => go(-1));
  $('nextPage').addEventListener('click', () => go(1));
  select.addEventListener('change', () => requestPage(Number(select.value)));
  $('retryImage').addEventListener('click', () => requestPage(failedTarget ?? Math.max(0, current)));
  $('closeReader').addEventListener('click', () => dialog.close());
  $('fileReturn').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.open) return; // An earlier close event must not reset a reopened reader.
    revision++; requested = current; if (interruptLoad) interruptLoad();
    animations.forEach(a => a.finish()); document.body.classList.remove('reader-open');
    $('loading').hidden = true; $('imageError').hidden = true;
    location.assign('index.html#work');
  });
  addEventListener('keydown', event => {
    if (!dialog.open || event.altKey || event.ctrlKey || event.metaKey || /^(SELECT|INPUT|TEXTAREA)$/.test(event.target.tagName)) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
    else if (event.key === 'Home') { event.preventDefault(); requestPage(0); }
    else if (event.key === 'End') { event.preventDefault(); requestPage(pages.length - 1); }
    // Up/down and PageUp/PageDown retain native scrolling for long pages.
  });
  reduce.addEventListener('change', () => { if (reduce.matches) animations.forEach(a => a.finish()); });
  function readHash() {
    const match = /^#page-(\d+)$/.exec(location.hash);
    if (match) { const index = Math.min(pages.length - 1, Math.max(0, Number(match[1]) - 1)); openFile(index, false); }
    else openFile(0);
  }
  addEventListener('hashchange', readHash);
  readHash();
})();
