/* Small fading pointer trail. The native cursor and page geometry stay unchanged. */
(() => {
  'use strict';
  if (document.getElementById('qjm-cursor-trail')) return;

  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const style = document.createElement('style');
  style.textContent = `
    #qjm-cursor-trail{position:fixed;inset:0;z-index:2147483647;display:none;
      overflow:hidden;pointer-events:none!important;user-select:none;
      margin:0;padding:0;border:0;background:transparent;contain:layout style paint}
    #qjm-cursor-trail>span{position:absolute;left:0;top:0;display:block;
      margin:0;padding:0;border:0;border-radius:50%;pointer-events:none!important;
      background:#e3f0ff;opacity:0;box-shadow:0 0 5px rgba(214,234,255,.18);
      will-change:transform,opacity}
    @media(prefers-reduced-motion:reduce),(hover:none),(pointer:coarse){
      #qjm-cursor-trail{display:none!important}
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  const layer = document.createElement('div');
  layer.id = 'qjm-cursor-trail';
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  const dots = Array.from({ length: 12 }, (_, i) => {
    const element = document.createElement('span');
    const size = 4.2 - i * .22;
    element.style.width = `${size}px`;
    element.style.height = `${size}px`;
    if (i < 3) element.style.background = '#f2f7ff';
    layer.appendChild(element);
    return { element, x: 0, y: 0, opacity: .5 * (1 - i / 14) };
  });
  document.body.appendChild(layer);

  let frameId = 0, lastFrame = 0, lastMove = 0;
  let pointerX = 0, pointerY = 0, initialized = false;
  const allowed = () => finePointer.matches && !reducedMotion.matches && !document.hidden;

  // A normal body child is below a modal dialog's top layer. Move this purely
  // decorative layer into the active dialog so the trail remains visible there.
  function syncHost(eventTarget) {
    const targetDialog = eventTarget instanceof Element ? eventTarget.closest('dialog[open]') : null;
    const openDialogs = document.querySelectorAll('dialog[open]');
    const host = targetDialog || openDialogs[openDialogs.length - 1] || document.body;
    if (layer.parentNode !== host) host.appendChild(layer);
  }

  function stopDrawing() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0; lastFrame = 0;
    layer.style.display = 'none';
    for (const dot of dots) dot.element.style.opacity = '0';
  }

  function clear() { stopDrawing(); initialized = false; }

  function draw(time) {
    frameId = 0;
    if (!allowed()) { clear(); return; }
    const elapsed = lastFrame ? Math.min(48, Math.max(1, time - lastFrame)) : 16;
    lastFrame = time;
    const fade = Math.max(0, 1 - Math.max(0, time - lastMove - 80) / 340);
    if (!fade) { stopDrawing(); return; }
    const follow = 1 - Math.exp(-elapsed / 35);
    let x = pointerX, y = pointerY, maxDistance = 0;
    for (const dot of dots) {
      const dx = x - dot.x, dy = y - dot.y;
      const distance = Math.hypot(dx, dy);
      maxDistance = Math.max(maxDistance, distance);
      dot.x += dx * follow;
      dot.y += dy * follow;
      // As each point settles, it fades rather than forming a stationary halo.
      dot.element.style.opacity = String(dot.opacity * fade * Math.min(1, distance / 1.4));
      dot.element.style.transform = `translate3d(${dot.x}px,${dot.y}px,0) translate(-50%,-50%)`;
      x = dot.x; y = dot.y;
    }
    if (maxDistance < .08) { stopDrawing(); return; }
    frameId = requestAnimationFrame(draw);
  }

  document.addEventListener('pointermove', event => {
    if (!allowed() || event.pointerType !== 'mouse') { clear(); return; }
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    syncHost(event.target);
    pointerX = Math.max(0, Math.min(innerWidth, event.clientX));
    pointerY = Math.max(0, Math.min(innerHeight, event.clientY));
    lastMove = performance.now();
    if (!initialized) {
      for (const dot of dots) { dot.x = pointerX; dot.y = pointerY; }
      initialized = true;
    }
    layer.style.display = 'block';
    if (!frameId) frameId = requestAnimationFrame(draw);
  }, { passive: true, capture: true });

  document.documentElement.addEventListener('pointerleave', clear);
  document.addEventListener('pointercancel', clear, { passive: true });
  addEventListener('pointerout', event => { if (!event.relatedTarget) clear(); }, { passive: true });
  addEventListener('blur', clear);
  addEventListener('resize', clear, { passive: true });
  document.addEventListener('visibilitychange', clear);
  finePointer.addEventListener('change', clear);
  reducedMotion.addEventListener('change', clear);

  const observer = new MutationObserver(records => {
    if (records.some(record => record.target.tagName === 'DIALOG')) {
      clear();
      syncHost();
    }
  });
  observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });
  syncHost();
})();
