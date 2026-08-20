import { BlueFlame } from './flame.js';
import { BuildingViewer } from './building-viewer.js';
import { operationPanels, ongoingOperations, regions } from '../content/site-data.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function setupTheme() {
  let saved = null;
  try { saved = localStorage.getItem('eish-theme'); } catch (_) { saved = null; }
  if (saved === 'night' || saved === 'day') document.body.dataset.theme = saved;
  const apply = () => {
    const label = document.body.dataset.theme === 'day' ? 'Dawn' : 'Night';
    $$('[data-theme-label]').forEach((node) => { node.textContent = label; });
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', document.body.dataset.theme === 'day' ? '#273c58' : '#050a12');
  };
  const toggle = () => {
    document.body.dataset.theme = document.body.dataset.theme === 'day' ? 'night' : 'day';
    try { localStorage.setItem('eish-theme', document.body.dataset.theme); } catch (_) { /* storage can be unavailable in restricted contexts */ }
    apply();
  };
  $$('[data-theme-toggle]').forEach((button) => button.addEventListener('click', toggle));
  apply();
}

function setupHeader() {
  const header = $('[data-header]');
  const progress = $('[data-scroll-progress]');
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const pct = max > 0 ? Math.min(100, Math.max(0, scrollY / max * 100)) : 0;
    if (progress) progress.style.width = `${pct}%`;
    header?.classList.toggle('is-scrolled', scrollY > 16);
  };
  update();
  addEventListener('scroll', update, { passive: true });

  const sections = ['about', 'platform', 'operations', 'global', 'journal', 'standard']
    .map((id) => document.getElementById(id)).filter(Boolean);
  const navLinks = $$('.desktop-nav a');
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    navLinks.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === `#${visible.target.id}`));
  }, { rootMargin: '-30% 0px -58% 0px', threshold: [0, .1, .35] });
  sections.forEach((section) => observer.observe(section));
}

function setupDialogs() {
  const menu = $('[data-mobile-menu]');
  const portal = $('[data-portal-dialog]');
  const menuButton = $('[data-menu-open]');
  let portalFlame;

  menuButton?.addEventListener('click', () => {
    menu.showModal();
    menuButton.setAttribute('aria-expanded', 'true');
  });
  $('[data-menu-close]')?.addEventListener('click', () => menu.close());
  menu?.addEventListener('close', () => menuButton?.setAttribute('aria-expanded', 'false'));
  $$('.mobile-menu nav a').forEach((link) => link.addEventListener('click', () => menu?.close()));

  $$('.portal-trigger').forEach((button) => button.addEventListener('click', () => {
    menu?.open && menu.close();
    portal.showModal();
    if (!portalFlame) {
      const canvas = $('[data-portal-flame]');
      if (canvas) portalFlame = new BlueFlame(canvas, { mode: 'portal', maxParticles: 70, intensity: .9 });
    }
  }));
  $$('[data-portal-close]').forEach((button) => button.addEventListener('click', () => portal?.close()));

  [menu, portal].forEach((dialog) => dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  }));
}

function setupReveal() {
  const items = $$('.reveal');
  if (reducedMotion) {
    items.forEach((item) => item.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: .11, rootMargin: '0px 0px -55px 0px' });
  items.forEach((item) => observer.observe(item));
}

function setupCounters() {
  const counters = $$('[data-counter]');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const node = entry.target;
      const target = Number(node.dataset.counter || 0);
      const prefix = node.dataset.prefix || (node.dataset.suffix?.includes('B') ? '$' : '');
      const suffix = node.dataset.suffix || '';
      const start = performance.now();
      const duration = 1100;
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const value = Math.round(target * eased);
        node.textContent = `${prefix}${value}${suffix}`;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      observer.unobserve(node);
    });
  }, { threshold: .6 });
  counters.forEach((counter) => observer.observe(counter));
}

class CanvasChart {
  constructor(canvas, mode = 'spark') {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = mode;
    this.visible = true;
    this.start = performance.now();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver((entries) => { this.visible = entries[0]?.isIntersecting ?? true; }, { rootMargin: '100px' });
    this.intersectionObserver.observe(canvas);
    this.resize();
    this.frame = requestAnimationFrame((time) => this.draw(time));
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.8);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.width = width;
      this.height = height;
      this.dpr = dpr;
    }
  }
  draw(time) {
    this.frame = requestAnimationFrame((t) => this.draw(t));
    if (!this.visible) return;
    this.resize();
    const ctx = this.ctx;
    const w = this.width, h = this.height;
    ctx.clearRect(0, 0, w, h);
    if (this.mode === 'network') this.drawNetwork(time, ctx, w, h);
    else this.drawSpark(time, ctx, w, h);
  }
  drawSpark(time, ctx, w, h) {
    const day = document.body.dataset.theme === 'day';
    const pad = 4 * this.dpr;
    const points = 46;
    const phase = (time - this.start) * .0014;
    const values = Array.from({ length: points }, (_, index) => {
      const x = index / (points - 1);
      return .53 + .16 * Math.sin(x * 7.5 + phase) + .08 * Math.sin(x * 18.5 - phase * .7) + x * .11;
    });
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, day ? '#6bc5ff' : '#2e70ff');
    gradient.addColorStop(.55, '#58b8ff');
    gradient.addColorStop(1, '#8deaff');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2.2 * this.dpr;
    ctx.shadowColor = 'rgba(64,155,255,.65)';
    ctx.shadowBlur = 10 * this.dpr;
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = pad + (w - pad * 2) * index / (points - 1);
      const y = h - pad - value * (h - pad * 2);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
    const fill = ctx.createLinearGradient(0, 0, 0, h);
    fill.addColorStop(0, 'rgba(66,160,255,.18)');
    fill.addColorStop(1, 'rgba(66,160,255,0)');
    ctx.lineTo(w - pad, h - pad);
    ctx.lineTo(pad, h - pad);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  drawNetwork(time, ctx, w, h) {
    const dpr = this.dpr;
    const phase = (time - this.start) * .001;
    ctx.strokeStyle = 'rgba(120,176,239,.08)';
    ctx.lineWidth = dpr;
    for (let i = 1; i < 5; i += 1) {
      const y = h * i / 5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    for (let i = 1; i < 8; i += 1) {
      const x = w * i / 8;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    const drawLine = (offset, color, amplitude) => {
      ctx.beginPath();
      for (let i = 0; i <= 90; i += 1) {
        const x = w * i / 90;
        const t = i / 90;
        const y = h * (.60 - t * .18 + Math.sin(t * 12 + phase + offset) * amplitude + Math.sin(t * 28 - phase * .65) * .035);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * dpr;
      ctx.shadowColor = color;
      ctx.shadowBlur = 9 * dpr;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    drawLine(0, 'rgba(69,145,255,.95)', .10);
    drawLine(1.6, 'rgba(107,221,255,.72)', .075);
    const scanX = (phase * .12 % 1) * w;
    const scan = ctx.createLinearGradient(scanX - 36 * dpr, 0, scanX + 36 * dpr, 0);
    scan.addColorStop(0, 'rgba(85,178,255,0)'); scan.addColorStop(.5, 'rgba(85,178,255,.16)'); scan.addColorStop(1, 'rgba(85,178,255,0)');
    ctx.fillStyle = scan; ctx.fillRect(scanX - 36 * dpr, 0, 72 * dpr, h);
  }
}

function setupCharts() {
  $$('[data-sparkline]').forEach((canvas) => new CanvasChart(canvas, 'spark'));
  $$('[data-network-chart]').forEach((canvas) => new CanvasChart(canvas, 'network'));
}

function setupFlames() {
  const hero = $('#hero-flame');
  if (hero) new BlueFlame(hero, { mode: 'hero', maxParticles: innerWidth < 760 ? 90 : 220, intensity: 1 });
  const orbit = $('[data-orbit-flame]');
  if (orbit) new BlueFlame(orbit, { mode: 'center', maxParticles: 115, intensity: .78 });
  const privateFlame = $('[data-private-flame]');
  if (privateFlame) new BlueFlame(privateFlame, { mode: 'center', maxParticles: 140, intensity: .86 });
}

async function setupBuilding() {
  const canvas = $('#building-canvas');
  if (!canvas) return;
  try {
    const modelUrl = new URL('../assets/models/eish-architectural-core.glb', import.meta.url).href;
    const viewer = new BuildingViewer(canvas, modelUrl);
    await viewer.init();
  } catch (error) {
    console.error('3D architectural core failed to load', error);
    canvas.classList.add('is-unavailable');
    const fallback = document.createElement('div');
    fallback.className = 'model-fallback';
    fallback.setAttribute('aria-hidden', 'true');
    fallback.innerHTML = '<img src="./assets/images/building-fallback.webp" alt=""><span class="model-fallback-glow"></span>';
    canvas.parentElement?.appendChild(fallback);
  }
}

function setupPlatformNodes() {
  const info = $('[data-platform-info]');
  const buttons = $$('[data-platform-node]');
  const activate = (button) => {
    buttons.forEach((node) => node.classList.toggle('is-active', node === button));
    if (info) info.querySelector('strong').textContent = button.dataset.platformNode;
  };
  buttons.forEach((button) => {
    button.addEventListener('mouseenter', () => activate(button));
    button.addEventListener('focus', () => activate(button));
    button.addEventListener('click', () => activate(button));
  });
  if (buttons[0]) activate(buttons[0]);
}

function setupOperations() {
  const tabsRoot = $('[data-operation-tabs]');
  const mediaRoot = $('[data-operation-media]');
  const copyRoot = $('[data-operation-copy]');
  const signal = $('[data-operation-signal]');
  const stage = $('[data-operation-stage]');
  if (!tabsRoot || !mediaRoot || !copyRoot || !stage) return;

  tabsRoot.innerHTML = operationPanels.map((panel, index) => `
    <button class="operation-tab${index === 0 ? ' is-active' : ''}" type="button" role="tab" aria-selected="${index === 0}" data-operation-tab="${panel.id}">
      <small>${panel.index}</small><strong>${panel.eyebrow}</strong>
    </button>
  `).join('');

  mediaRoot.innerHTML = operationPanels.map((panel, index) => `
    <video class="${index === 0 ? 'is-active' : ''}" data-operation-video="${panel.id}" muted loop playsinline preload="metadata" poster="${panel.poster}">
      <source src="${panel.video}" type="video/mp4">
    </video>
  `).join('');

  let active = 0;
  let touchStartX = null;
  const setActive = (index, userInitiated = false) => {
    active = (index + operationPanels.length) % operationPanels.length;
    const panel = operationPanels[active];
    $$('[data-operation-tab]', tabsRoot).forEach((tab, tabIndex) => {
      tab.classList.toggle('is-active', tabIndex === active);
      tab.setAttribute('aria-selected', String(tabIndex === active));
    });
    $$('[data-operation-video]', mediaRoot).forEach((video, videoIndex) => {
      const isActive = videoIndex === active;
      video.classList.toggle('is-active', isActive);
      if (isActive && !reducedMotion) video.play().catch(() => {}); else video.pause();
    });
    copyRoot.innerHTML = `
      <span class="operation-index">${panel.index} / ${String(operationPanels.length).padStart(2, '0')}</span>
      <p class="kicker">${panel.eyebrow}</p>
      <h3>${panel.title}</h3>
      <p>${panel.body}</p>
    `;
    if (signal) signal.textContent = panel.signal;
    if (userInitiated) $$('[data-operation-tab]', tabsRoot)[active]?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  };

  $$('[data-operation-tab]', tabsRoot).forEach((tab, index) => tab.addEventListener('click', () => setActive(index, true)));
  $('[data-operation-prev]')?.addEventListener('click', () => setActive(active - 1, true));
  $('[data-operation-next]')?.addEventListener('click', () => setActive(active + 1, true));
  stage.addEventListener('touchstart', (event) => { touchStartX = event.changedTouches[0]?.clientX ?? null; }, { passive: true });
  stage.addEventListener('touchend', (event) => {
    if (touchStartX == null) return;
    const dx = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
    if (Math.abs(dx) > 55) setActive(active + (dx < 0 ? 1 : -1), true);
    touchStartX = null;
  }, { passive: true });

  const stageObserver = new IntersectionObserver((entries) => {
    const visible = entries[0]?.isIntersecting ?? false;
    const video = $$('[data-operation-video]', mediaRoot)[active];
    if (visible && !reducedMotion) video?.play().catch(() => {}); else video?.pause();
  }, { threshold: .2 });
  stageObserver.observe(stage);
  setActive(0);
}

function setupMap() {
  const root = $('[data-map-markers]');
  const card = $('[data-map-card]');
  if (!root || !card) return;
  root.innerHTML = regions.map((region) => `<button class="map-marker" type="button" style="--left:${region.left}%;--top:${region.top}%;" data-region="${region.id}" aria-label="${region.name}"></button>`).join('');
  const activate = (region) => {
    card.querySelector('strong').textContent = region.name;
    card.querySelector('p').textContent = region.note;
    const safeLeft = Math.min(72, Math.max(18, region.left + (region.left > 60 ? -20 : 5)));
    const safeTop = Math.min(65, Math.max(18, region.top - 10));
    card.style.left = `${safeLeft}%`;
    card.style.top = `${safeTop}%`;
  };
  $$('[data-region]', root).forEach((button) => {
    const region = regions.find((item) => item.id === button.dataset.region);
    if (!region) return;
    button.addEventListener('mouseenter', () => activate(region));
    button.addEventListener('focus', () => activate(region));
    button.addEventListener('click', () => activate(region));
  });
  activate(regions[0]);
}

function renderOngoingOperations() {
  const root = $('[data-ongoing-grid]');
  if (!root) return;
  root.innerHTML = ongoingOperations.map((item, index) => `
    <article class="ongoing-card reveal">
      <div class="ongoing-card-head"><span class="category">${item.category}</span><span class="region">${item.region}</span></div>
      <h3>${item.title}</h3>
      <div class="ongoing-card-foot"><span><i></i>${item.status}</span><span>${String(index + 1).padStart(2, '0')} / ${String(ongoingOperations.length).padStart(2, '0')}</span></div>
    </article>
  `).join('');
}

function setupCommandTilt() {
  const stage = $('[data-command-stage]');
  if (!stage || reducedMotion || matchMedia('(pointer: coarse)').matches) return;
  const frame = $('.command-frame', stage);
  stage.addEventListener('pointermove', (event) => {
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    frame.style.transform = `perspective(1200px) rotateY(${x * 2.6}deg) rotateX(${-y * 2.2}deg)`;
  });
  stage.addEventListener('pointerleave', () => { frame.style.transform = ''; });
}

function setupVideoVisibility() {
  const videos = $$('video');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target;
      if (entry.isIntersecting && video.classList.contains('is-active') && !reducedMotion) video.play().catch(() => {});
      else video.pause();
    });
  }, { threshold: .15, rootMargin: '100px' });
  videos.forEach((video) => observer.observe(video));
}

renderOngoingOperations();
setupTheme();
setupHeader();
setupDialogs();
setupReveal();
setupCounters();
setupCharts();
setupFlames();
setupBuilding();
setupPlatformNodes();
setupOperations();
setupMap();
setupCommandTilt();
setupVideoVisibility();
