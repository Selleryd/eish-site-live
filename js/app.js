import { BuildingViewer } from "./building-viewer.js";
import { ongoingOperations } from "../content/operations.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function initAmbientCanvas() {
  const canvas = document.querySelector("#ambient-canvas");
  if (!canvas) return;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let particles = [];
  let frame = 0;
  let active = true;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  const buildParticles = () => {
    const count = reducedMotion ? 45 : Math.round(clamp(width / 12, 55, 145));
    particles = Array.from({ length: count }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.1 + 0.15,
      alpha: Math.random() * 0.45 + 0.08,
      speed: Math.random() * 0.045 + 0.008,
      drift: (Math.random() - 0.5) * 0.015,
      phase: Math.random() * Math.PI * 2,
      blue: index % 11 === 0
    }));
  };

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildParticles();
  };

  const draw = (time = 0) => {
    frame = requestAnimationFrame(draw);
    if (!active) return;
    context.clearRect(0, 0, width, height);
    pointer.x += (pointer.tx - pointer.x) * 0.025;
    pointer.y += (pointer.ty - pointer.y) * 0.025;

    for (const particle of particles) {
      if (!reducedMotion) {
        particle.y += particle.speed;
        particle.x += particle.drift;
        if (particle.y > height + 4) particle.y = -4;
        if (particle.x > width + 4) particle.x = -4;
        if (particle.x < -4) particle.x = width + 4;
      }
      const twinkle = reducedMotion ? 1 : 0.72 + Math.sin(time * 0.0007 + particle.phase) * 0.28;
      const px = particle.x + pointer.x * particle.radius * 2.2;
      const py = particle.y + pointer.y * particle.radius * 1.5;
      context.beginPath();
      context.arc(px, py, particle.radius, 0, Math.PI * 2);
      context.fillStyle = particle.blue
        ? `rgba(84, 169, 255, ${particle.alpha * twinkle})`
        : `rgba(214, 230, 246, ${particle.alpha * twinkle})`;
      context.fill();
    }
  };

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pointermove", (event) => {
    pointer.tx = (event.clientX / Math.max(1, width) - 0.5) * 8;
    pointer.ty = (event.clientY / Math.max(1, height) - 0.5) * 8;
  }, { passive: true });
  document.addEventListener("visibilitychange", () => { active = !document.hidden; });
  resize();
  frame = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(frame);
}

function initHeaderAndProgress() {
  const header = document.querySelector("[data-header]");
  const progress = document.querySelector(".scroll-progress span");
  let lastY = window.scrollY;
  let ticking = false;

  const update = () => {
    const y = window.scrollY;
    header?.classList.toggle("is-scrolled", y > 20);
    if (header && y > 180 && y > lastY + 8 && !document.body.classList.contains("dialog-open") && !document.body.classList.contains("menu-open")) {
      header.classList.add("is-hidden");
    } else if (header && y < lastY - 5) {
      header.classList.remove("is-hidden");
    }
    if (progress) {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      progress.style.width = `${clamp(y / max, 0, 1) * 100}%`;
    }
    lastY = y;
    ticking = false;
  };

  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
  update();
}

function initSectionTracking() {
  const sections = [...document.querySelectorAll(".section-observed[data-section]")];
  const navLinks = [...document.querySelectorAll(".desktop-nav a[href^='#']")];
  const railLinks = [...document.querySelectorAll("[data-section-link]")];
  if (!sections.length) return;

  let current = "home";
  const setActive = (id) => {
    if (!id || id === current) return;
    current = id;
    navLinks.forEach((link) => link.classList.toggle("is-active", link.getAttribute("href") === `#${id}`));
    railLinks.forEach((link) => link.classList.toggle("is-active", link.dataset.sectionLink === id));
  };

  railLinks.find((link) => link.dataset.sectionLink === "home")?.classList.add("is-active");
  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    if (visible[0]) setActive(visible[0].target.dataset.section);
  }, { rootMargin: "-28% 0px -52%", threshold: [0.01, 0.2, 0.5] });
  sections.forEach((section) => observer.observe(section));
}

function initRevealObservers() {
  const elements = document.querySelectorAll(".reveal-on-scroll");
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      obs.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -10%", threshold: 0.08 });
  elements.forEach((element) => observer.observe(element));
}

function setDialogBodyState() {
  const anyDialogOpen = [...document.querySelectorAll("dialog")].some((dialog) => dialog.open);
  document.body.classList.toggle("dialog-open", anyDialogOpen);
}

function initDialogs() {
  const menu = document.querySelector("[data-mobile-menu]");
  const menuOpen = document.querySelector("[data-menu-open]");
  const menuClose = document.querySelector("[data-menu-close]");
  const portal = document.querySelector("[data-portal-dialog]");

  const openMenu = () => {
    if (!menu) return;
    menu.showModal?.();
    document.body.classList.add("menu-open");
    menuOpen?.setAttribute("aria-expanded", "true");
    setDialogBodyState();
  };
  const closeMenu = () => {
    menu?.close();
    document.body.classList.remove("menu-open");
    menuOpen?.setAttribute("aria-expanded", "false");
    setDialogBodyState();
  };
  const openPortal = () => {
    closeMenu();
    portal?.showModal?.();
    setDialogBodyState();
  };
  const closePortal = () => {
    portal?.close();
    setDialogBodyState();
  };

  menuOpen?.addEventListener("click", openMenu);
  menuClose?.addEventListener("click", closeMenu);
  menu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  menu?.addEventListener("close", () => {
    document.body.classList.remove("menu-open");
    menuOpen?.setAttribute("aria-expanded", "false");
    setDialogBodyState();
  });
  portal?.addEventListener("close", setDialogBodyState);
  document.querySelectorAll(".portal-trigger").forEach((trigger) => trigger.addEventListener("click", openPortal));
  document.querySelectorAll("[data-portal-close]").forEach((button) => button.addEventListener("click", closePortal));

  [menu, portal].forEach((dialog) => {
    dialog?.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      dialog.close();
    });
  });
}

function initPlatformNodes() {
  const nodes = [...document.querySelectorAll("[data-platform-node]")];
  const centerText = document.querySelector(".platform-center span");
  let resetTimer = 0;
  nodes.forEach((node) => {
    const activate = () => {
      nodes.forEach((item) => item.classList.toggle("is-active", item === node));
      if (centerText) centerText.textContent = node.dataset.platformNode.toUpperCase();
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        nodes.forEach((item) => item.classList.remove("is-active"));
        if (centerText) centerText.innerHTML = "ONE OPERATING<br>PLATFORM";
      }, 2200);
    };
    node.addEventListener("mouseenter", activate);
    node.addEventListener("focus", activate);
    node.addEventListener("click", activate);
  });
}

function initOperationsDeck() {
  const deck = document.querySelector("[data-operations-deck]");
  if (!deck) return;
  const cards = [...deck.querySelectorAll("[data-operation-card]")];
  const prev = document.querySelector("[data-deck-prev]");
  const next = document.querySelector("[data-deck-next]");
  const count = document.querySelector("[data-deck-count]");
  let currentIndex = 0;
  let pointerDown = false;
  let startX = 0;
  let startScroll = 0;
  let moved = false;
  let raf = 0;

  const updateCurrent = () => {
    const center = deck.scrollLeft + deck.clientWidth / 2;
    let nearest = 0;
    let distance = Infinity;
    cards.forEach((card, index) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const nextDistance = Math.abs(center - cardCenter);
      if (nextDistance < distance) {
        distance = nextDistance;
        nearest = index;
      }
    });
    currentIndex = nearest;
    cards.forEach((card, index) => card.classList.toggle("is-current", index === nearest));
    if (count) count.textContent = `${String(nearest + 1).padStart(2, "0")} / ${String(cards.length).padStart(2, "0")}`;
  };

  const goTo = (index) => {
    currentIndex = (index + cards.length) % cards.length;
    cards[currentIndex]?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest", inline: "center" });
  };

  prev?.addEventListener("click", () => goTo(currentIndex - 1));
  next?.addEventListener("click", () => goTo(currentIndex + 1));
  deck.addEventListener("scroll", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(updateCurrent);
  }, { passive: true });
  deck.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") { event.preventDefault(); goTo(currentIndex + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); goTo(currentIndex - 1); }
    if (event.key === "Home") { event.preventDefault(); goTo(0); }
    if (event.key === "End") { event.preventDefault(); goTo(cards.length - 1); }
  });
  deck.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerDown = true;
    moved = false;
    startX = event.clientX;
    startScroll = deck.scrollLeft;
    deck.classList.add("is-dragging");
    deck.setPointerCapture?.(event.pointerId);
  });
  deck.addEventListener("pointermove", (event) => {
    if (!pointerDown) return;
    const distance = event.clientX - startX;
    if (Math.abs(distance) > 5) moved = true;
    deck.scrollLeft = startScroll - distance * 1.15;
  });
  const release = (event) => {
    if (!pointerDown) return;
    pointerDown = false;
    deck.classList.remove("is-dragging");
    try { deck.releasePointerCapture?.(event.pointerId); } catch (_) { /* no-op */ }
    if (moved) requestAnimationFrame(() => goTo(currentIndex));
  };
  deck.addEventListener("pointerup", release);
  deck.addEventListener("pointercancel", release);
  updateCurrent();
}

function initWorldMap() {
  const shell = document.querySelector("[data-world-map]");
  if (!shell) return;
  const points = [...shell.querySelectorAll(".map-point")];
  const buttons = [...shell.querySelectorAll("[data-map-region]")];
  const tooltip = shell.querySelector("[data-map-tooltip]");

  const activate = (region) => {
    const point = points.find((item) => item.dataset.region === region);
    points.forEach((item) => item.classList.toggle("is-active", item === point));
    buttons.forEach((item) => item.classList.toggle("is-active", item.dataset.mapRegion === region));
    if (!point || !tooltip) return;
    const shellRect = shell.getBoundingClientRect();
    const pointRect = point.getBoundingClientRect();
    const x = pointRect.left - shellRect.left + pointRect.width / 2;
    const y = pointRect.top - shellRect.top + pointRect.height / 2;
    const tooltipWidth = tooltip.offsetWidth || 210;
    const tooltipHeight = tooltip.offsetHeight || 82;
    tooltip.style.left = `${clamp(x + 18, 10, shell.clientWidth - tooltipWidth - 10)}px`;
    tooltip.style.top = `${clamp(y - tooltipHeight - 12, 10, shell.clientHeight - tooltipHeight - 10)}px`;
    tooltip.querySelector("strong").textContent = region;
  };

  points.forEach((point) => {
    const region = point.dataset.region;
    point.addEventListener("mouseenter", () => activate(region));
    point.addEventListener("focus", () => activate(region));
    point.addEventListener("click", () => activate(region));
  });
  buttons.forEach((button) => button.addEventListener("click", () => activate(button.dataset.mapRegion)));
  window.addEventListener("resize", () => {
    const active = points.find((point) => point.classList.contains("is-active"));
    if (active) activate(active.dataset.region);
  }, { passive: true });
  activate("New York");
}

function renderJournal() {
  const grid = document.querySelector("[data-journal-grid]");
  const filters = document.querySelector("[data-journal-filters]");
  if (!grid || !filters) return;

  const escape = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  grid.innerHTML = ongoingOperations.map((item) => `
    <article class="journal-card" data-category="${escape(item.category)}">
      <div class="journal-meta">
        <span class="journal-category">${escape(item.label)}</span>
        <span class="journal-region">${escape(item.region)}</span>
      </div>
      <h3>${escape(item.title)}</h3>
      <p>${escape(item.body)}</p>
      <div class="journal-footer"><span><i></i>${escape(item.period)}</span><span>Non-identifying</span></div>
    </article>
  `).join("");

  const cards = [...grid.querySelectorAll(".journal-card")];
  filters.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) return;
    const filter = button.dataset.filter;
    filters.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
    cards.forEach((card) => {
      const show = filter === "all" || card.dataset.category === filter;
      card.classList.toggle("is-hidden", !show);
    });
  });
}

function initHeroParallax() {
  if (reducedMotion || window.matchMedia("(max-width: 900px)").matches) return;
  const stage = document.querySelector("[data-building-stage]");
  if (!stage) return;
  const cards = [...stage.querySelectorAll(".hud-card")];
  const orbits = [...stage.querySelectorAll(".orbit")];
  stage.addEventListener("pointermove", (event) => {
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    cards.forEach((card, index) => {
      card.style.translate = `${x * (8 + index * 4)}px ${y * (7 + index * 3)}px`;
    });
    orbits.forEach((orbit, index) => {
      orbit.style.marginLeft = `${x * (6 + index * 3)}px`;
      orbit.style.marginTop = `${y * (5 + index * 2)}px`;
    });
  });
  stage.addEventListener("pointerleave", () => {
    cards.forEach((card) => { card.style.translate = "0 0"; });
    orbits.forEach((orbit) => { orbit.style.marginLeft = "0"; orbit.style.marginTop = "0"; });
  });
}

async function initBuilding() {
  const canvas = document.querySelector("#building-canvas");
  const fallback = document.querySelector("[data-model-fallback]");
  if (!canvas) return;
  try {
    const viewer = new BuildingViewer(canvas, "./assets/eish-tower.glb");
    await viewer.init();
    window.eishBuildingViewer = viewer;
  } catch (error) {
    console.warn("3D model unavailable; using visual fallback.", error);
    canvas.hidden = true;
    fallback?.classList.add("is-visible");
  }
}

function initSmoothAnchors() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href^='#']");
    if (!link) return;
    const id = link.getAttribute("href");
    if (!id || id === "#") return;
    const target = document.querySelector(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", id);
  });
}

function initCurrentYear() {
  document.querySelectorAll("[data-current-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
}

function init() {
  initAmbientCanvas();
  initHeaderAndProgress();
  initSectionTracking();
  initRevealObservers();
  initDialogs();
  initPlatformNodes();
  initOperationsDeck();
  initWorldMap();
  renderJournal();
  initHeroParallax();
  initSmoothAnchors();
  initCurrentYear();
  initBuilding();
  requestAnimationFrame(() => document.body.classList.add("is-ready"));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
