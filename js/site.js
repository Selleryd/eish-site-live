const body = document.body;
const header = document.querySelector('[data-header]');
const menu = document.querySelector('[data-mobile-menu]');
const menuOpen = document.querySelector('[data-menu-open]');
const menuClose = document.querySelector('[data-menu-close]');
const menuBackdrop = document.querySelector('[data-menu-backdrop]');

function setMenu(open) {
  if (!menu) return;
  menu.classList.toggle('is-open', open);
  menu.setAttribute('aria-hidden', String(!open));
  menuOpen?.setAttribute('aria-expanded', String(open));
  body.classList.toggle('is-menu-open', open);
}

menuOpen?.addEventListener('click', () => setMenu(true));
menuClose?.addEventListener('click', () => setMenu(false));
menuBackdrop?.addEventListener('click', () => setMenu(false));
menu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMenu(false);
});

function updateHeaderScroll() {
  if (!header) return;
  header.classList.toggle('is-at-top', window.scrollY < 16);
}
updateHeaderScroll();
window.addEventListener('scroll', updateHeaderScroll, { passive: true });

const toneSections = [...document.querySelectorAll('[data-header-tone]')];
if (header && toneSections.length) {
  const toneObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) header.dataset.tone = visible.target.dataset.headerTone || 'dark';
  }, { rootMargin: '-38% 0px -54% 0px', threshold: [0, 0.2, 0.6, 1] });
  toneSections.forEach((section) => toneObserver.observe(section));
}

const revealItems = [...document.querySelectorAll('.reveal')];
if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

const mediaItems = [...document.querySelectorAll('video[data-observe-media]')];
if (mediaItems.length) {
  const mediaObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target;
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    });
  }, { threshold: 0.18, rootMargin: '120px' });
  mediaItems.forEach((video) => mediaObserver.observe(video));
}

const year = document.querySelector('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());

if (document.querySelector('[data-flame]')) import('./flame.js');
if (document.querySelector('[data-building]')) import('./hero-scene.js');
if (document.querySelector('[data-world-map]')) import('./map.js');
if (document.querySelector('[data-journal-list]')) import('./journal.js');
if (document.querySelector('[data-operations-command]')) import('./operations.js');
