/* Self-contained silver particle surface. No external renderer or network assets. */
(() => {
  const canvas = document.getElementById('dots'), host = document.querySelector('.cover');
  if (!canvas || !host) return;
  canvas.setAttribute('aria-hidden', 'true');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 1, height = 1, dpr = 1, visible = true, frameId = 0, last = 0, time = 0;
  let active = false, strength = 0, mx = 0, my = 0, tx = 0, ty = 0;
  const gl = canvas.getContext('webgl', {alpha:true,antialias:false,powerPreference:'low-power'});
  let render, resizeRenderer;
  if (gl) {
    const vertex = `
      precision highp float;
      attribute vec4 seed;
      uniform vec2 viewport, mouse;
      uniform float clock, influence, pixelRatio;
      varying float light;
      void main(){
        float u=seed.x*6.2831853, v=seed.y*6.2831853;
        float t=clock*.13;
        float radius=1.02+.14*sin(3.*u+t)+.055*cos(5.*u-t*.7);
        float tube=.34+.10*sin(2.*u-t)+.035*sin(7.*u+v+t);
        float ripple=.028*sin(13.*u+5.*v-t*2.)+.018*cos(19.*v-3.*u+t);
        float shell=tube+ripple+(seed.z-.5)*.10;
        vec3 p=vec3((radius+shell*cos(v))*cos(u),(radius+shell*cos(v))*sin(u),shell*sin(v));
        p.z+=.26*sin(2.*u+t)+.12*cos(3.*u-t);
        float angle=.45+.10*sin(t*.5);
        p.yz=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p.yz;
        float tilt=-.50+.06*sin(t*.4);
        p.xy=mat2(cos(tilt),-sin(tilt),sin(tilt),cos(tilt))*p.xy;
        p.x+=.10*p.y*p.y;
        float perspective=2.8/(2.8-p.z);
        float scale=min(viewport.x*.43,viewport.y*.65);
        vec2 screen=p.xy*scale*perspective;
        vec2 delta=screen-mouse;
        float dist=length(delta), reach=min(viewport.x,viewport.y)*.24;
        float force=exp(-dist*dist/(reach*reach))*influence;
        vec2 direction=delta/max(dist,1.);
        screen+=(direction*46.+vec2(-direction.y,direction.x)*28.)*force;
        screen+=vec2(sin(v*4.+t*5.),cos(u*5.-t*4.))*force*8.;
        gl_Position=vec4(screen/viewport*2.,0.,1.);
        gl_PointSize=(.95+pow(seed.w,4.)*2.3+force*.6)*pixelRatio*perspective;
        float ridge=pow(abs(sin(v+u*.3)),9.);
        light=(.22+seed.w*.38+ridge*.65)*(.78+.6*smoothstep(-.5,.65,p.z))+force*.28;
      }`;
    const fragment = `
      precision mediump float;
      varying float light;
      void main(){
        float r=length(gl_PointCoord-.5)*2.;
        float alpha=(1.-smoothstep(.35,1.,r))*light;
        gl_FragColor=vec4(.87,.90,1.,alpha);
      }`;
    function shader(type, source) {
      const item=gl.createShader(type); gl.shaderSource(item,source); gl.compileShader(item);
      if (!gl.getShaderParameter(item,gl.COMPILE_STATUS)) throw new Error('Particle shader unavailable');
      return item;
    }
    try {
      const program=gl.createProgram();
      gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex)); gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment)); gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error('Particle program unavailable');
      gl.useProgram(program);
      const data=new Float32Array(88000*4); let state=918273;
      for(let i=0;i<data.length;i++){state=(1664525*state+1013904223)>>>0;data[i]=state/4294967296;}
      gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
      const attribute=gl.getAttribLocation(program,'seed');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,4,gl.FLOAT,false,0,0);
      const uniforms=Object.fromEntries(['viewport','mouse','clock','influence','pixelRatio'].map(name=>[name,gl.getUniformLocation(program,name)]));
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.clearColor(0,0,0,0);
      resizeRenderer=()=>gl.viewport(0,0,canvas.width,canvas.height);
      render=()=>{
        gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform2f(uniforms.viewport,width,height);gl.uniform2f(uniforms.mouse,mx,my);
        gl.uniform1f(uniforms.clock,time);gl.uniform1f(uniforms.influence,strength);gl.uniform1f(uniforms.pixelRatio,dpr);
        const count=width<680?36000:88000;gl.drawArrays(gl.POINTS,0,count);canvas.dataset.particles=String(count);
      };
      canvas.dataset.renderer='webgl';
    } catch (_) { render=null; }
  }
  if (!render) {
    // A separate canvas is required if a WebGL context was already allocated.
    const fallback=document.createElement('canvas');fallback.className='particle-fallback';fallback.setAttribute('aria-hidden','true');host.insertBefore(fallback,canvas);canvas.hidden=true;
    const ctx=fallback.getContext('2d'); if(!ctx)return;
    canvas.dataset.renderer='canvas2d';
    resizeRenderer=()=>{fallback.width=canvas.width;fallback.height=canvas.height;fallback.style.width=width+'px';fallback.style.height=height+'px';ctx.setTransform(dpr,0,0,dpr,0,0);};
    render=()=>{
      ctx.clearRect(0,0,width,height);const scale=Math.min(width*.43,height*.65);
      for(let i=0;i<4500;i++){
        const u=i*2.399963,v=i*.754878,t=time*.13;
        const radius=1.02+.14*Math.sin(3*u+t)+(.34+.1*Math.sin(2*u-t))*Math.cos(v);
        let x=Math.cos(u)*radius*scale,y=Math.sin(u)*radius*scale*.83;
        const dx=x-mx,dy=y-my,d=Math.hypot(dx,dy)||1,f=Math.exp(-(d*d)/(scale*scale*.16))*strength;
        x+=dx/d*45*f;y+=dy/d*45*f;
        ctx.fillStyle=`rgba(220,230,255,${.15+(Math.sin(v)*.5+.5)*.4})`;ctx.fillRect(width/2+x,height/2-y,1.2,1.2);
      }
      canvas.dataset.particles='4500';
    };
  }
  function resize(){width=host.clientWidth;height=host.clientHeight;dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=width+'px';canvas.style.height=height+'px';resizeRenderer();render();}
  function tick(now){
    frameId=0;if(!visible||document.hidden||reduce.matches)return;
    const dt=Math.min((now-last)/1000||.016,.04);last=now;time+=dt;
    mx+=(tx-mx)*.13;my+=(ty-my)*.13;strength+=((active?1:0)-strength)*.065;
    render();frameId=requestAnimationFrame(tick);
  }
  function sync(){if(frameId)cancelAnimationFrame(frameId);frameId=0;last=performance.now();if(reduce.matches){strength=0;render();}else if(visible&&!document.hidden)frameId=requestAnimationFrame(tick);}
  host.addEventListener('pointermove',e=>{const box=host.getBoundingClientRect();tx=e.clientX-box.left-width/2;ty=height/2-(e.clientY-box.top);active=true;canvas.dataset.interaction='active';},{passive:true});
  host.addEventListener('pointerleave',()=>{active=false;canvas.dataset.interaction='idle';});
  host.addEventListener('pointercancel',()=>{active=false;canvas.dataset.interaction='idle';});
  addEventListener('blur',()=>{active=false;});
  addEventListener('resize',resize,{passive:true});document.addEventListener('visibilitychange',sync);reduce.addEventListener('change',sync);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:0}).observe(host);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();if(frameId)cancelAnimationFrame(frameId);frameId=0;});
  canvas.addEventListener('webglcontextrestored',()=>location.reload());
  canvas.dataset.interaction='idle';resize();sync();
})();
