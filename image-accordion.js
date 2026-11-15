/* Image Accordion — 个人项目封面交互展示
 * 数据来源：window.PORTFOLIO（portfolio-data.js）
 * 桌面端：横向手风琴，hover/focus 展开；移动端：纵向手风琴，第一次点展开、第二次点进入。
 */
(() => {
  const host = document.getElementById('pacc');
  if (!host || !Array.isArray(window.PORTFOLIO)) return;

  const mobile = matchMedia('(max-width: 880px)');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  window.PORTFOLIO.forEach((p, i) => {
    const a = document.createElement('a');
    a.className = 'pacc-item';
    a.href = p.href + '#page-1';
    a.style.setProperty('--i', i);
    a.setAttribute('aria-label', `查看项目：${p.en} · ${p.zh}`);
    a.innerHTML =
      `<img src="${esc(p.img)}" alt="" width="1440" height="810" loading="lazy" decoding="async">` +
      `<div class="pacc-shade" aria-hidden="true"></div>` +
      `<div class="pacc-collapsed" aria-hidden="true">` +
        `<span class="pacc-num">${esc(p.n)}</span>` +
        `<span class="pacc-vt">${esc(p.en)}</span>` +
      `</div>` +
      `<div class="pacc-info">` +
        `<span class="pacc-inum">${esc(p.n)} / ${String(window.PORTFOLIO.length).padStart(2, '0')}</span>` +
        `<h3>${esc(p.en)}</h3>` +
        `<p class="pacc-zh">${esc(p.zh)}</p>` +
        `<p class="pacc-tag">${esc(p.tag)}</p>` +
        `<span class="pacc-go">查看项目 <span class="ar" aria-hidden="true">→</span></span>` +
      `</div>`;
    // 移动端：未展开时拦截第一次点击，用于展开
    a.addEventListener('click', e => {
      if (!mobile.matches) return;
      if (!a.classList.contains('on')) {
        e.preventDefault();
        host.querySelectorAll('.pacc-item.on').forEach(x => x.classList.remove('on'));
        a.classList.add('on');
      }
    });
    host.appendChild(a);
  });

  // 离开手风琴区域时收起移动端展开项
  document.addEventListener('click', e => {
    if (!mobile.matches || host.contains(e.target)) return;
    host.querySelectorAll('.pacc-item.on').forEach(x => x.classList.remove('on'));
  });

  // 入场动画
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { host.classList.add('in'); io.disconnect(); }
    });
  }, { threshold: 0.12 });
  io.observe(host);
})();

/* 原卡片网格：默认折叠，点击展开（无 JS 时保持展开可见） */
(() => {
  const btn = document.getElementById('gridToggle');
  const fold = document.getElementById('gridFold');
  if (!btn || !fold) return;
  let open = true;
  // 初始直接折叠，不播动画
  fold.style.transition = 'none';
  fold.style.height = '0px';
  fold.style.opacity = '0';
  fold.offsetHeight; // 强制 reflow
  fold.style.transition = '';
  open = false;
  btn.setAttribute('aria-expanded', 'false');

  btn.addEventListener('click', () => {
    open = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      fold.style.opacity = '1';
      fold.style.height = fold.scrollHeight + 'px';
      fold.addEventListener('transitionend', function te(e) {
        if (e.propertyName === 'height') { fold.style.height = 'auto'; fold.removeEventListener('transitionend', te); }
      });
    } else {
      fold.style.height = fold.scrollHeight + 'px';
      requestAnimationFrame(() => { fold.style.height = '0px'; fold.style.opacity = '0'; });
      fold.addEventListener('transitionend', function te(e) {
        if (e.propertyName === 'height') fold.removeEventListener('transitionend', te);
      });
    }
  });
  addEventListener('resize', () => { if (open && fold.style.height !== 'auto') fold.style.height = 'auto'; }, { passive: true });
})();
