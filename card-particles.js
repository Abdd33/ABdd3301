/* Only the hovered cover animates; the cover remains a normal navigable link. */
(() => {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  document.querySelectorAll('.project-cover').forEach((card, cardIndex) => {
    const frame = card.querySelector('.project-cover-image');
    const canvas = document.createElement('canvas'); canvas.className = 'card-particles';
    canvas.setAttribute('aria-hidden', 'true'); frame.appendChild(canvas);
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let width = 1, height = 1, mx = 0, my = 0, tx = 0, ty = 0, raf = 0, active = false, time = 0;
    let seed = 37913 + cardIndex * 197;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const points = Array.from({length:240}, () => ({x:random(),y:random(),size:.5+random()*1.25,phase:random()*Math.PI*2}));
    function size() {
      width = frame.clientWidth; height = frame.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio,0,0,ratio,0,0);
    }
    function draw() {
      raf = 0; if (!active || motion.matches || !fine.matches || document.hidden) return;
      mx += (tx-mx)*.16; my += (ty-my)*.16; time += .016;
      ctx.clearRect(0,0,width,height);
      const radius = Math.min(width*.36,160);
      const glow = ctx.createRadialGradient(mx,my,0,mx,my,radius);
      glow.addColorStop(0,'rgba(235,235,235,.12)'); glow.addColorStop(.45,'rgba(190,190,190,.05)'); glow.addColorStop(1,'rgba(190,190,190,0)');
      ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
      points.forEach(p => {
        const x=p.x*width,y=p.y*height,dx=x-mx,dy=y-my,d=Math.hypot(dx,dy)||1;
        const falloff=Math.max(0,1-d/radius), a=falloff*falloff;
        if(a<.006)return;
        const wave=Math.sin(time*2.2+p.phase), push=a*(12+wave*4);
        const px=x+dx/d*push-dy/d*a*6,py=y+dy/d*push+dx/d*a*6;
        ctx.fillStyle=`rgba(240,240,240,${a*(.5+wave*.12)})`;
        ctx.beginPath();ctx.arc(px,py,p.size*(.65+a*.65),0,Math.PI*2);ctx.fill();
        if(a>.55&&p.size>1.4){ctx.strokeStyle=`rgba(230,230,230,${a*.28})`;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(px-3,py);ctx.lineTo(px+3,py);ctx.moveTo(px,py-3);ctx.lineTo(px,py+3);ctx.stroke();}
      });
      raf = requestAnimationFrame(draw);
    }
    function move(event) {
      const box=frame.getBoundingClientRect();tx=Math.max(0,Math.min(width,event.clientX-box.left));ty=Math.max(0,Math.min(height,event.clientY-box.top));
      card.style.setProperty('--rx',((.5-ty/height)*2.4)+'deg');
      card.style.setProperty('--ry',((tx/width-.5)*3)+'deg');
    }
    function stop() {
      active=false;card.dataset.particles='idle';card.style.setProperty('--rx','0deg');card.style.setProperty('--ry','0deg');
      if(raf)cancelAnimationFrame(raf);raf=0;
    }
    card.addEventListener('pointerenter',event=>{
      if(!fine.matches||motion.matches||event.pointerType==='touch')return;
      size();move(event);mx=tx;my=ty;active=true;card.dataset.particles='active';if(!raf)raf=requestAnimationFrame(draw);
    });
    card.addEventListener('pointermove',event=>{if(active)move(event);},{passive:true});
    card.addEventListener('pointerleave',stop);card.addEventListener('pointercancel',stop);
    addEventListener('blur',stop);addEventListener('resize',()=>{if(active)size();},{passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
    motion.addEventListener('change',stop);fine.addEventListener('change',stop);
    new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)stop();}).observe(card);
  });
})();
