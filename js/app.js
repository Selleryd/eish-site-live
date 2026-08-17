import { operationsFeed, regions } from '../content/operations.js';
import { BuildingViewer } from './building-viewer.js';

const qs = (s, p = document) => p.querySelector(s);
const qsa = (s, p = document) => [...p.querySelectorAll(s)];

const storageKey = 'eish-theme';

function setupThemeToggle() {
  const saved = localStorage.getItem(storageKey);
  if (saved === 'day' || saved === 'night') document.body.dataset.theme = saved;

  const applyLabel = () => {
    qsa('[data-theme-label]').forEach((el) => {
      el.textContent = document.body.dataset.theme === 'day' ? 'Dawn' : 'Night';
    });
  };

  const toggle = () => {
    document.body.dataset.theme = document.body.dataset.theme === 'day' ? 'night' : 'day';
    localStorage.setItem(storageKey, document.body.dataset.theme);
    applyLabel();
  };

  qsa('[data-theme-toggle]').forEach((btn) => btn.addEventListener('click', toggle));
  applyLabel();
}

function setupDialogs() {
  const mobileMenu = qs('[data-mobile-menu]');
  const portalDialog = qs('[data-portal-dialog]');

  const closeMenu = () => mobileMenu?.close();
  const closePortal = () => portalDialog?.close();

  qs('[data-menu-open]')?.addEventListener('click', () => mobileMenu?.showModal());
  qs('[data-menu-close]')?.addEventListener('click', closeMenu);
  qsa('.mobile-menu nav a').forEach((a) => a.addEventListener('click', closeMenu));

  qsa('.portal-trigger').forEach((btn) => btn.addEventListener('click', () => portalDialog?.showModal()));
  qsa('[data-portal-close]').forEach((btn) => btn.addEventListener('click', closePortal));

  [mobileMenu, portalDialog].forEach((dialog) => {
    dialog?.addEventListener('click', (event) => {
      const rect = dialog.getBoundingClientRect();
      const inDialog = rect.top <= event.clientY && event.clientY <= rect.top + rect.height
        && rect.left <= event.clientX && event.clientX <= rect.left + rect.width;
      if (!inDialog) dialog.close();
    });
  });
}

function setupRevealObserver() {
  const items = qsa('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  items.forEach((item) => observer.observe(item));
}

function renderOperations() {
  const container = qs('[data-operations-list]');
  if (!container) return;
  container.innerHTML = operationsFeed.map((item) => `
    <article class="timeline-card reveal is-visible">
      <div class="timeline-meta">
        <b>${item.year}</b>
        <strong>${item.title}</strong>
        <span>${item.region}</span>
      </div>
      <p>${item.detail}</p>
    </article>
  `).join('');
}

function setupMap() {
  const info = qs('[data-map-info]');
  const regionMap = new Map(regions.map((region) => [region.id, region]));
  const updateInfo = (id) => {
    const region = regionMap.get(id);
    if (!region || !info) return;
    info.innerHTML = `
      <p class="micro">REGION</p>
      <h3>${region.label}</h3>
      <p>${region.note}</p>
    `;
  };

  qsa('[data-region]').forEach((button) => {
    const handler = () => updateInfo(button.dataset.region);
    button.addEventListener('mouseenter', handler);
    button.addEventListener('focus', handler);
    button.addEventListener('click', handler);
  });
}

async function initBuilding() {
  const canvas = qs('#building-canvas');
  if (!canvas) return;
  try {
    const viewer = new BuildingViewer(canvas, new URL('../assets/eish-tower.glb', import.meta.url).href);
    await viewer.init();
  } catch (error) {
    console.error('Building viewer failed to initialize:', error);
    const parent = canvas.parentElement;
    if (parent) {
      const fallback = document.createElement('div');
      fallback.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;color:var(--text-soft);font-size:1rem;z-index:4';
      fallback.textContent = '3D model unavailable on this device.';
      parent.appendChild(fallback);
    }
  }
}

function setupHeaderState() {
  const header = qs('[data-header]');
  const update = () => header?.classList.toggle('is-scrolled', window.scrollY > 10);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

setupThemeToggle();
setupDialogs();
setupRevealObserver();
renderOperations();
setupMap();
setupHeaderState();
initBuilding();
