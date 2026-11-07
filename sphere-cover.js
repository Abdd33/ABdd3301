import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const SEED = 20261107;
const TAU = Math.PI * 2;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = matchMedia('(pointer: coarse)').matches;

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createOutlineMaterial() {
  const outlineWidth = 0.022;
  const material = new THREE.MeshBasicMaterial({
    color: 0x3d3d3d,
    side: THREE.BackSide,
    depthTest: true,
    depthWrite: true,
    toneMapped: false,
    fog: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\ntransformed += normal * ${outlineWidth.toFixed(4)};`,
    );
  };
  material.customProgramCacheKey = () => 'matte-sphere-outline-v1';
  return { material, outlineWidth };
}

function createParticleField(count, motionAmount) {
  const random = mulberry32(SEED ^ 0xd057);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const opacity = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    seeds[i * 3] = random() - 0.5;
    seeds[i * 3 + 1] = random() - 0.5;
    seeds[i * 3 + 2] = -10 + random() * 20;
    phases[i] = random() * TAU;
    sizes[i] = 1.1 + random() * 2.8;
    opacity[i] = 0.25 + random() * 0.65;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacity, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
    },
    vertexShader: /* glsl */`
      attribute float aSize;
      attribute float aOpacity;
      uniform float uPixelRatio;
      varying float vOpacity;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(aSize * uPixelRatio * (30.0 / -viewPosition.z), 1.0, 12.0);
        vOpacity = aOpacity;
      }
    `,
    fragmentShader: /* glsl */`
      varying float vOpacity;
      void main() {
        float distanceToCenter = length(gl_PointCoord - 0.5);
        float alpha = smoothstep(0.5, 0.08, distanceToCenter) * vOpacity;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vec3(0.82), alpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  function update(time, pixelRatio, aspect) {
    const viewHeight = 18.4;
    const viewWidth = viewHeight * aspect;
    for (let i = 0; i < count; i += 1) {
      const phase = phases[i];
      positions[i * 3] = seeds[i * 3] * viewWidth * 1.18
        + Math.sin(time * 0.19 + phase) * 0.42 * motionAmount;
      positions[i * 3 + 1] = seeds[i * 3 + 1] * viewHeight * 1.16
        + Math.cos(time * 0.15 + phase * 1.3) * 0.5 * motionAmount;
      positions[i * 3 + 2] = seeds[i * 3 + 2]
        + Math.sin(time * 0.11 + phase * 0.7) * 0.35 * motionAmount;
    }
    geometry.attributes.position.needsUpdate = true;
    material.uniforms.uPixelRatio.value = pixelRatio;
  }

  return { points, update };
}

const EdgeChromaticShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.0032 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec2 centered = vUv - 0.5;
      float edge = smoothstep(0.2, 0.7, length(centered));
      vec2 offset = centered * amount * edge;
      float red = texture2D(tDiffuse, clamp(vUv + offset, 0.001, 0.999)).r;
      float green = texture2D(tDiffuse, vUv).g;
      float blue = texture2D(tDiffuse, clamp(vUv - offset, 0.001, 0.999)).b;
      gl_FragColor = vec4(red, green, blue, 1.0);
    }
  `,
};

function createExperience() {
  const canvas = document.getElementById('sphere-cover');
  const host = canvas?.closest('.cover');
  if (!canvas || !host) return;
  const initialWidth = host.clientWidth || innerWidth;
  const initialHeight = host.clientHeight || innerHeight;
  const rand = mulberry32(SEED);
  const mobile = initialWidth < 700;
  const sphereCount = mobile ? 24 : 38;
  const motionAmount = reducedMotion ? 0 : 1;
  const background = new THREE.Color(0x090909);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  renderer.setSize(initialWidth, initialHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.info.autoReset = false;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    '三维交互球体场景。移动鼠标推动球体，点击产生脉冲；聚焦后可使用方向键和空格。',
  );

  const scene = new THREE.Scene();
  scene.background = background;
  scene.fog = new THREE.FogExp2(background, 0.03);

  const camera = new THREE.PerspectiveCamera(42, initialWidth / initialHeight, 0.1, 80);
  camera.position.set(0, 0, 24);
  camera.lookAt(0, 0, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.72;
  room.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xd8d8d8, 0x080808, 1.15));

  const keyLight = new THREE.DirectionalLight(0xf2f2f2, 3.2);
  keyLight.position.set(-7, 9, 12);
  scene.add(keyLight);

  const centerLight = new THREE.PointLight(0xf0f0f0, 68, 28, 2);
  centerLight.position.set(0, 0, 4);
  scene.add(centerLight);

  const rimLight = new THREE.PointLight(0x929292, 42, 32, 2);
  rimLight.position.set(9, -6, 5);
  scene.add(rimLight);

  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = false;
  world.solver.iterations = 8;
  world.defaultContactMaterial.friction = 0.04;
  world.defaultContactMaterial.restitution = 0.38;

  const sphereGeometry = new THREE.SphereGeometry(1, mobile ? 24 : 32, mobile ? 18 : 22);
  const sphereMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    toneMapped: false,
    fog: false,
  });
  const { material: outlineMaterial, outlineWidth } = createOutlineMaterial();
  const sphereOutlines = new THREE.InstancedMesh(sphereGeometry, outlineMaterial, sphereCount);
  sphereOutlines.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sphereOutlines.frustumCulled = false;
  sphereOutlines.renderOrder = 0;
  scene.add(sphereOutlines);

  const spheres = new THREE.InstancedMesh(sphereGeometry, sphereMaterial, sphereCount);
  spheres.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  spheres.frustumCulled = false;
  spheres.renderOrder = 1;
  scene.add(spheres);

  const palette = [0x0c0c0c, 0x111111, 0x171717, 0x1d1d1d, 0x232323, 0x141414];
  const dummy = new THREE.Object3D();
  const bodies = [];

  for (let i = 0; i < sphereCount; i += 1) {
    const angle = i * 2.399963229728653 + (rand() - 0.5) * 0.38;
    const radial = 0.25 + Math.pow(rand(), 0.72) * 0.82;
    const radius = (mobile ? 1.05 : 1.5) + Math.pow(rand(), 1.15) * (mobile ? 2.05 : 2.8);
    const depth = -6.5 + rand() * 11.5;
    const position = new THREE.Vector3();
    const base = new THREE.Vector3();
    const color = new THREE.Color(palette[Math.floor(rand() * palette.length)]);
    rand();
    color.offsetHSL(0, 0, (rand() - 0.5) * 0.022);
    spheres.setColorAt(i, color);

    const physicsBody = new CANNON.Body({
      mass: Math.max(0.5, radius ** 3),
      shape: new CANNON.Sphere(radius),
      linearDamping: 0.08,
      angularDamping: 1,
      fixedRotation: true,
    });
    physicsBody.updateMassProperties();
    world.addBody(physicsBody);

    bodies.push({
      angle,
      radial,
      radius,
      depth,
      phase: rand() * TAU,
      speed: 0.18 + rand() * 0.24,
      position,
      base,
      physicsBody,
    });
  }
  spheres.instanceColor.needsUpdate = true;

  const heroRadius = 3.7;
  const heroHome = new THREE.Vector3(0, 0, -0.25);
  const heroMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
    fog: false,
  });
  const heroGeometry = new THREE.SphereGeometry(heroRadius, 64, 48);
  const heroOutline = new THREE.Mesh(heroGeometry, outlineMaterial);
  heroOutline.position.copy(heroHome);
  heroOutline.renderOrder = 0;
  scene.add(heroOutline);

  const hero = new THREE.Mesh(heroGeometry, heroMaterial);
  hero.position.copy(heroHome);
  hero.renderOrder = 1;
  scene.add(hero);

  const heroCollider = new CANNON.Body({
    mass: heroRadius ** 3 * 0.7,
    shape: new CANNON.Sphere(heroRadius),
    linearDamping: 0.1,
    angularDamping: 1,
    fixedRotation: true,
  });
  heroCollider.position.copy(heroHome);
  heroCollider.updateMassProperties();
  world.addBody(heroCollider);

  const particleCount = mobile ? 110 : 200;
  const particleField = createParticleField(particleCount, motionAmount);
  particleField.update(0, renderer.getPixelRatio(), camera.aspect);
  scene.add(particleField.points);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const depthOfField = new BokehPass(scene, camera, {
    focus: camera.position.distanceTo(heroHome),
    aperture: mobile ? 0.00042 : 0.00052,
    maxblur: mobile ? 0.02 : 0.024,
  });
  const edgeBlurStrength = 0.62;
  depthOfField.materialBokeh.fragmentShader = depthOfField.materialBokeh.fragmentShader.replace(
    'vec2 dofblur = vec2 ( clamp( factor * aperture, -maxblur, maxblur ) );',
    `float radialEdge = smoothstep(0.18, 0.68, length((vUv - 0.5) * vec2(1.0, 0.86)));
     float blurDirection = factor < 0.0 ? -1.0 : 1.0;
     vec2 dofblur = vec2(clamp(factor * aperture + blurDirection * radialEdge * maxblur * ${edgeBlurStrength}, -maxblur, maxblur));`,
  );
  composer.addPass(depthOfField);
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight),
    mobile ? 0.13 : 0.16,
    0.28,
    0.82,
  );
  composer.addPass(bloom);
  const edgeChromatic = new ShaderPass(EdgeChromaticShader);
  edgeChromatic.uniforms.amount.value = mobile ? 0.0026 : 0.0032;
  composer.addPass(edgeChromatic);
  composer.addPass(new OutputPass());

  const pointer = new THREE.Vector2(0, 0);
  const pointerTarget = new THREE.Vector2(0, 0);
  const pointerWorld = new THREE.Vector3();
  const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const raycaster = new THREE.Raycaster();
  const drift = new THREE.Vector3();
  const target = new THREE.Vector3();
  const clock = new THREE.Clock();
  const fixedStep = 1 / 60;

  let pointerActive = false;
  let pulse = 0;
  let simulationTime = 0;
  let accumulator = 0;
  let paused = false;
  let fps = 60;
  let fpsFrames = 0;
  let fpsElapsed = 0;
  let heroBaseScale = 1;

  const collisionNormal = new THREE.Vector3();

  function relaxBasePositions() {
    for (let iteration = 0; iteration < 16; iteration += 1) {
      for (let i = 0; i < bodies.length; i += 1) {
        const body = bodies[i];

        collisionNormal.copy(body.base).sub(heroHome);
        const heroDistance = collisionNormal.length() || 0.001;
        const heroClearance = body.radius + heroRadius * heroBaseScale + 0.08;
        if (heroDistance < heroClearance) {
          body.base.addScaledVector(collisionNormal.divideScalar(heroDistance), heroClearance - heroDistance);
        }

        for (let j = i + 1; j < bodies.length; j += 1) {
          const other = bodies[j];
          collisionNormal.copy(other.base).sub(body.base);
          const distance = collisionNormal.length() || 0.001;
          const clearance = body.radius + other.radius + 0.04;
          if (distance >= clearance) continue;
          const correction = (clearance - distance) * 0.52;
          collisionNormal.divideScalar(distance);
          body.base.addScaledVector(collisionNormal, -correction);
          other.base.addScaledVector(collisionNormal, correction);
        }
      }
    }
  }

  function layout() {
    const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * camera.position.z;
    const viewWidth = viewHeight * camera.aspect;
    heroBaseScale = THREE.MathUtils.clamp(camera.aspect * 1.15, 0.7, 1);

    for (const body of bodies) {
      body.base.set(
        Math.cos(body.angle) * body.radial * viewWidth * 0.56,
        Math.sin(body.angle) * body.radial * viewHeight * 0.57,
        body.depth,
      );
    }
    relaxBasePositions();

    const heroShape = heroCollider.shapes[0];
    heroShape.radius = heroRadius * heroBaseScale;
    heroShape.updateBoundingSphereRadius();
    heroCollider.updateBoundingRadius();
    heroCollider.aabbNeedsUpdate = true;
    world.broadphase.dirty = true;
  }

  function setDrift(body, time, output) {
    const phase = time * body.speed + body.phase;
    return output.set(
      Math.sin(phase) * 0.24,
      Math.cos(phase * 0.83) * 0.2,
      Math.sin(phase * 0.61) * 0.16,
    ).multiplyScalar(motionAmount);
  }

  function resetField(time) {
    for (let i = 0; i < bodies.length; i += 1) {
      const body = bodies[i];
      setDrift(body, time, drift);
      body.position.copy(body.base).add(drift);
      body.physicsBody.position.copy(body.position);
      body.physicsBody.velocity.setZero();
      body.physicsBody.force.setZero();
      body.physicsBody.aabbNeedsUpdate = true;
      dummy.position.copy(body.position);
      dummy.scale.setScalar(body.radius);
      dummy.updateMatrix();
      sphereOutlines.setMatrixAt(i, dummy.matrix);
      spheres.setMatrixAt(i, dummy.matrix);
    }
    sphereOutlines.instanceMatrix.needsUpdate = true;
    spheres.instanceMatrix.needsUpdate = true;
    heroCollider.position.copy(heroHome);
    heroCollider.velocity.setZero();
    heroCollider.force.setZero();
    heroCollider.aabbNeedsUpdate = true;
    hero.position.copy(heroHome);
    hero.scale.setScalar(heroBaseScale);
    heroOutline.position.copy(heroHome);
    heroOutline.scale.setScalar(heroBaseScale);
    centerLight.position.set(heroHome.x, heroHome.y, heroHome.z + 4);
    particleField.update(time, renderer.getPixelRatio(), camera.aspect);
    world.broadphase.dirty = true;
  }

  function step(dt) {
    simulationTime += dt;
    pulse *= Math.exp(-2.7 * dt);
    pointer.lerp(pointerTarget, 1 - Math.exp(-12 * dt));

    const cameraX = pointer.x * 0.55 * motionAmount;
    const cameraY = pointer.y * 0.35 * motionAmount;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, cameraX, 4.5, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, cameraY, 4.5, dt);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    raycaster.setFromCamera(pointer, camera);
    raycaster.ray.intersectPlane(interactionPlane, pointerWorld);

    const damping = Math.exp(-1.9 * dt);
    for (const body of bodies) {
      const physicsBody = body.physicsBody;
      setDrift(body, simulationTime, drift);
      target.copy(body.base).add(drift);

      physicsBody.force.x += (target.x - physicsBody.position.x) * physicsBody.mass * 3.4;
      physicsBody.force.y += (target.y - physicsBody.position.y) * physicsBody.mass * 3.4;
      physicsBody.force.z += (target.z - physicsBody.position.z) * physicsBody.mass * 3.4;

      if (pointerActive) {
        const dx = physicsBody.position.x - pointerWorld.x;
        const dy = physicsBody.position.y - pointerWorld.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const reach = 4.2 + body.radius + pulse * 2.8;

        if (distance < reach) {
          const falloff = 1 - distance / reach;
          const force = falloff * falloff * (18 + pulse * 38) * physicsBody.mass;
          physicsBody.force.x += (dx / distance) * force;
          physicsBody.force.y += (dy / distance) * force;
          physicsBody.force.z += falloff * force * 0.13;
        }
      }

      physicsBody.velocity.x *= damping;
      physicsBody.velocity.y *= damping;
      physicsBody.velocity.z *= damping;
    }

    heroCollider.force.x += (heroHome.x - heroCollider.position.x) * heroCollider.mass * 2.6;
    heroCollider.force.y += (heroHome.y - heroCollider.position.y) * heroCollider.mass * 2.6;
    heroCollider.force.z += (heroHome.z - heroCollider.position.z) * heroCollider.mass * 2.6;

    if (pointerActive) {
      const dx = heroCollider.position.x - pointerWorld.x;
      const dy = heroCollider.position.y - pointerWorld.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const reach = 4.2 + heroRadius * heroBaseScale + pulse * 2.8;
      if (distance < reach) {
        const falloff = 1 - distance / reach;
        const force = falloff * falloff * (22 + pulse * 42) * heroCollider.mass;
        heroCollider.force.x += (dx / distance) * force;
        heroCollider.force.y += (dy / distance) * force;
        heroCollider.force.z += falloff * force * 0.1;
      }
    }
    heroCollider.velocity.x *= damping;
    heroCollider.velocity.y *= damping;
    heroCollider.velocity.z *= damping;

    world.step(dt);
    hero.position.copy(heroCollider.position);
    heroOutline.position.copy(heroCollider.position);

    for (let i = 0; i < bodies.length; i += 1) {
      const body = bodies[i];
      body.position.copy(body.physicsBody.position);
      dummy.position.copy(body.position);
      dummy.scale.setScalar(body.radius);
      dummy.updateMatrix();
      sphereOutlines.setMatrixAt(i, dummy.matrix);
      spheres.setMatrixAt(i, dummy.matrix);
    }
    sphereOutlines.instanceMatrix.needsUpdate = true;
    spheres.instanceMatrix.needsUpdate = true;
    particleField.update(simulationTime, renderer.getPixelRatio(), camera.aspect);

    const heroPulse = 1 + pulse * 0.075;
    const currentHeroScale = heroBaseScale * heroPulse;
    hero.scale.setScalar(currentHeroScale);
    heroOutline.scale.setScalar(currentHeroScale);
    centerLight.intensity = 0;
    centerLight.position.set(hero.position.x, hero.position.y, hero.position.z + 4);
    heroCollider.shapes[0].radius = heroRadius * currentHeroScale;
    heroCollider.shapes[0].updateBoundingSphereRadius();
    heroCollider.updateBoundingRadius();
    heroCollider.aabbNeedsUpdate = true;
  }

  function draw() {
    depthOfField.uniforms.focus.value = camera.position.distanceTo(hero.position);
    renderer.info.reset();
    composer.render();
  }

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointerTarget.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    pointerActive = true;
  }

  function sendPulse() {
    pulse = 1;
    pointerActive = true;
  }

  canvas.addEventListener('pointermove', updatePointer);
  canvas.addEventListener('pointerdown', (event) => {
    updatePointer(event);
    sendPulse();
    canvas.focus({ preventScroll: true });
  });
  canvas.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'touch') pointerActive = false;
  });
  canvas.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'touch') pointerActive = false;
  });

  let coverVisible = true;
  const visibilityObserver = new IntersectionObserver((entries) => {
    coverVisible = entries[0]?.isIntersecting ?? true;
  });
  visibilityObserver.observe(host);

  window.addEventListener('keydown', (event) => {
    if (document.activeElement !== canvas) return;
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const increment = event.shiftKey ? 0.2 : 0.1;
    if (event.key === 'ArrowLeft') pointerTarget.x -= increment;
    if (event.key === 'ArrowRight') pointerTarget.x += increment;
    if (event.key === 'ArrowUp') pointerTarget.y += increment;
    if (event.key === 'ArrowDown') pointerTarget.y -= increment;
    pointerTarget.clampScalar(-0.9, 0.9);
    pointerActive = true;
    if (event.key === ' ') sendPulse();
  });

  function resize() {
    const width = host.clientWidth || innerWidth;
    const height = host.clientHeight || innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, width < 700 ? 1.25 : 1.5));
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    layout();
    resetField(simulationTime);
    if (paused) draw();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.08);
    if (!coverVisible || document.hidden) {
      accumulator = 0;
      return;
    }
    fpsFrames += 1;
    fpsElapsed += dt;
    if (fpsElapsed >= 0.75) {
      fps = Math.round(fpsFrames / fpsElapsed);
      fpsFrames = 0;
      fpsElapsed = 0;
    }

    if (!paused) {
      accumulator += dt;
      while (accumulator >= fixedStep) {
        step(fixedStep);
        accumulator -= fixedStep;
      }
    }
    draw();
  });

  window.__seek = (time) => {
    const value = Number(time);
    paused = true;
    accumulator = 0;
    simulationTime = Number.isFinite(value) && value > 0 ? value : 0;
    pointerActive = false;
    pulse = 0;
    pointer.set(0, 0);
    pointerTarget.set(0, 0);
    camera.position.set(0, 0, 24);
    camera.lookAt(0, 0, 0);
    resetField(simulationTime);
    draw();
  };

  window.__play = () => {
    paused = false;
    clock.getDelta();
  };

  window.__getSceneState = () => {
    let probeIndex = -1;
    let maxOverlap = 0;
    for (let i = 0; i < bodies.length; i += 1) {
      const projected = bodies[i].position.clone().project(camera);
      const x = (projected.x * 0.5 + 0.5) * innerWidth;
      const y = (-projected.y * 0.5 + 0.5) * innerHeight;
      if (x >= 80 && x <= innerWidth - 80 && y >= 80 && y <= innerHeight - 80 && probeIndex === -1) {
        probeIndex = i;
      }

      const heroOverlap = bodies[i].radius + heroCollider.shapes[0].radius - bodies[i].position.distanceTo(hero.position);
      maxOverlap = Math.max(maxOverlap, heroOverlap);
      for (let j = i + 1; j < bodies.length; j += 1) {
        const overlap = bodies[i].radius + bodies[j].radius - bodies[i].position.distanceTo(bodies[j].position);
        maxOverlap = Math.max(maxOverlap, overlap);
      }
    }
    probeIndex = Math.max(0, probeIndex);
    const firstScreen = bodies[probeIndex].position.clone().project(camera);
    return {
      ready: true,
      sphereCount,
      probeIndex,
      pointerActive,
      pulse: Number(pulse.toFixed(3)),
      fps,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      contactCount: world.contacts.length,
      physicsBodies: world.bodies.length,
      maxOverlap: Number(maxOverlap.toFixed(4)),
      matteBlack: sphereMaterial.isMeshBasicMaterial && sphereMaterial.color.getHex() === 0
        && !sphereMaterial.toneMapped,
      centerPureWhite: heroMaterial.isMeshBasicMaterial && heroMaterial.color.getHex() === 0xffffff
        && !heroMaterial.toneMapped,
      centerGlowEnabled: bloom.enabled,
      centerGlow: {
        strength: bloom.strength,
        threshold: bloom.threshold,
      },
      outlines: {
        color: `#${outlineMaterial.color.getHexString()}`,
        width: outlineWidth,
        instanceCount: sphereOutlines.count,
        depthTest: outlineMaterial.depthTest,
        depthWrite: outlineMaterial.depthWrite,
        backSide: outlineMaterial.side === THREE.BackSide,
        heroSynchronized: heroOutline.position.distanceTo(hero.position) < 0.0001
          && Math.abs(heroOutline.scale.x - hero.scale.x) < 0.0001,
      },
      particles: {
        count: particleCount,
        depthTest: particleField.points.material.depthTest,
        shaderDriven: particleField.points.material.isShaderMaterial,
        samplePosition: Array.from(particleField.points.geometry.attributes.position.array.slice(0, 3))
          .map((value) => Number(value.toFixed(4))),
      },
      monochromeMaterials: palette.every((value) => {
        const color = new THREE.Color(value);
        return color.r === color.g && color.g === color.b;
      }),
      depthOfField: {
        enabled: depthOfField.enabled,
        focus: Number(depthOfField.uniforms.focus.value.toFixed(4)),
        aperture: depthOfField.uniforms.aperture.value,
        maxblur: depthOfField.uniforms.maxblur.value,
        edgeBlurStrength,
      },
      edgeChromatic: {
        enabled: edgeChromatic.enabled,
        amount: edgeChromatic.uniforms.amount.value,
      },
      firstSphere: bodies[probeIndex].position.toArray().map((value) => Number(value.toFixed(4))),
      firstSphereScreen: {
        x: (firstScreen.x * 0.5 + 0.5) * innerWidth,
        y: (-firstScreen.y * 0.5 + 0.5) * innerHeight,
      },
      heroScale: Number(hero.scale.x.toFixed(4)),
      heroPosition: hero.position.toArray().map((value) => Number(value.toFixed(4))),
      heroMass: heroCollider.mass,
      heroIsDynamic: heroCollider.mass > 0,
      reducedMotion,
      coarsePointer,
    };
  };

  layout();
  resetField(0);
  draw();
  host.classList.add('scene-ready');
  window.__SCENE_READY__ = true;

  const timeParameter = new URLSearchParams(location.search).get('t');
  if (timeParameter !== null) window.__seek(timeParameter);
}

try {
  createExperience();
} catch (error) {
  document.querySelector('.cover')?.classList.add('scene-error');
  window.__SCENE_READY__ = true;
  window.__SCENE_ERROR__ = error instanceof Error ? error.stack : String(error);
  window.__getSceneState = () => ({ ready: false, fallback: true });
  console.warn('The 3D scene could not start; showing the static composition instead.', error);
}
