(() => {
  const host = document.querySelector('#about');
  const field = host.querySelector('.about-orbs');
  const canvas = field.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const wide = matchMedia('(min-width:1050px)');
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  // Coordinates are fractions of the square field. Positive depth is closer to the viewer.
  const spheres = [
    { x: .58, y: .44, z: 0, radius: .285 },
    { x: .22, y: .74, z: -.42, radius: .16 },
    { x: .22, y: .21, z: .35, radius: .055 },
  ].map(s => ({ ...s, dx: 0, dy: 0, vx: 0, vy: 0 }));
  const dust = [
    [.13,.43,-.5], [.42,.13,.25], [.76,.20,-.3], [.88,.55,.18],
    [.71,.81,-.38], [.47,.88,.12], [.36,.59,-.12], [.10,.82,.28],
  ].map(([x,y,z]) => ({ x, y, z }));
  const layers = [...spheres, ...dust].sort((a,b) => a.z-b.z);
  const pointer = { x: .5, y: .5, active: false };
  let pulse = 0, time = 0, last = 0, frame = 0, visible = false;

  function render(now) {
    const dt = Math.min((now-last)/1000, .032);
    last = now;
    if (!reduced.matches) time += dt;
    pulse *= Math.exp(-5 * dt);
    const size = canvas.clientWidth;
    if (!size) { frame = 0; return; }
    const pixels = Math.max(1, Math.round(size * Math.min(devicePixelRatio, 2)));
    if (canvas.width !== pixels || canvas.height !== pixels) canvas.width = canvas.height = pixels;
    ctx.setTransform(pixels, 0, 0, pixels, 0, 0);
    ctx.clearRect(0, 0, 1, 1);
    for (const [i, layer] of layers.entries()) {
      const scale = 1 / (1 - layer.z * .4);
      let x = .5 + (layer.x-.5) * scale;
      let y = .5 + (layer.y-.5) * scale;
      const isSphere = !!layer.radius;
      if (isSphere) {
        const rx = x + layer.dx - pointer.x, ry = y + layer.dy - pointer.y;
        const distance = Math.hypot(rx,ry);
        const reach = layer.radius * scale + .16 + pulse * .25;
        const falloff = Math.max(0, 1 - distance/reach);
        const force = (pointer.active || pulse > .01) ? falloff**2 * (2 + pulse*15) : 0;
        const damping = Math.exp(-6 * dt);
        layer.vx = (layer.vx + (force * (distance ? rx/distance : 1) - 14*layer.dx)*dt)*damping;
        layer.vy = (layer.vy + (force * (distance ? ry/distance : 0) - 14*layer.dy)*dt)*damping;
        layer.dx += layer.vx * dt; layer.dy += layer.vy * dt;
        x += layer.dx; y += layer.dy;
      }
      const drift = reduced.matches ? 0 : (isSphere ? .006 : .012);
      x += Math.sin(time*.38+i)*drift;
      y += Math.cos(time*.29+i)*drift;
      // Focus on the large middle sphere. Near and distant silhouettes soften with depth.
      ctx.filter = layer.z === 0 ? 'none' : 'blur(' + (Math.abs(layer.z)*pixels*.012) + 'px)';
      ctx.beginPath();
      ctx.arc(x, y, isSphere ? layer.radius*scale : 1.3*scale/size, 0, Math.PI*2);
      ctx.fillStyle = isSphere ? '#000' : 'rgba(190,190,190,.55)';
      ctx.fill();
      if (isSphere) {
        ctx.strokeStyle = '#3d3d3d';
        ctx.lineWidth = 1.4*scale/size;
        ctx.stroke();
      }
    }
    ctx.filter = 'none';
    frame = requestAnimationFrame(render);
  }

  function sync() {
    const active = host.classList.contains('is-open') && wide.matches && visible && !document.hidden;
    if (active && !frame) {
      last = performance.now();
      frame = requestAnimationFrame(render);
    } else if (!active) {
      cancelAnimationFrame(frame); frame = 0; pointer.active = false; pulse = 0;
    }
  }
  function locate(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX-rect.left)/rect.width;
    pointer.y = (event.clientY-rect.top)/rect.height;
    pointer.active = true;
  }
  canvas.addEventListener('pointermove', locate);
  canvas.addEventListener('pointerdown', event => { locate(event); pulse = 1; });
  for (const event of ['pointerleave','pointercancel','blur']) {
    canvas.addEventListener(event, () => { pointer.active = false; });
  }
  canvas.addEventListener('keydown', event => {
    const offsets = { ArrowLeft: [-.1,0], ArrowRight: [.1,0], ArrowUp: [0,-.1], ArrowDown: [0,.1] };
    if (event.key === ' ') pulse = 1;
    else if (Object.hasOwn(offsets,event.key)) {
      const [x,y] = offsets[event.key];
      pointer.x = Math.max(0,Math.min(1,pointer.x+x));
      pointer.y = Math.max(0,Math.min(1,pointer.y+y));
    } else return;
    pointer.active = true; event.preventDefault();
  });
  field.classList.add('ready');
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(field);
  new MutationObserver(sync).observe(host, {attributes:true, attributeFilter:['class']});
  wide.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
})();
