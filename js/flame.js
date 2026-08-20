export class BlueFlame {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.mode = options.mode || 'center';
    this.intensity = options.intensity ?? 1;
    this.maxParticles = options.maxParticles || (this.mode === 'hero' ? 210 : 110);
    this.particles = [];
    this.visible = true;
    this.running = true;
    this.lastTime = performance.now();
    this.frame = 0;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.visible = entries[0]?.isIntersecting ?? true;
    }, { rootMargin: '180px' });
    this.intersectionObserver.observe(canvas);
    this.resize();
    this.animate = this.animate.bind(this);
    this.frame = requestAnimationFrame(this.animate);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.7);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.canvas.style.width = `${rect.width}px`;
      this.canvas.style.height = `${rect.height}px`;
      this.dpr = dpr;
      this.width = width;
      this.height = height;
    }
  }

  origin() {
    if (this.mode === 'hero') return { x: this.width * 0.735, y: this.height * 0.70, spread: this.width * 0.07, lift: this.height * 0.38 };
    if (this.mode === 'portal') return { x: this.width * 0.5, y: this.height * 0.80, spread: this.width * 0.10, lift: this.height * 0.60 };
    return { x: this.width * 0.5, y: this.height * 0.72, spread: this.width * 0.11, lift: this.height * 0.48 };
  }

  spawn(count = 2) {
    const o = this.origin();
    for (let i = 0; i < count && this.particles.length < this.maxParticles; i += 1) {
      const seed = Math.random();
      const life = 0.75 + Math.random() * 1.2;
      this.particles.push({
        x: o.x + (Math.random() - 0.5) * o.spread,
        y: o.y + (Math.random() - 0.5) * o.spread * 0.22,
        vx: (Math.random() - 0.5) * o.spread * 0.20,
        vy: -(o.lift * (0.45 + Math.random() * 0.55)),
        life,
        maxLife: life,
        size: (4 + Math.random() * 13) * this.dpr * this.intensity,
        seed,
        hue: 195 + Math.random() * 25
      });
    }
  }

  drawCore(time) {
    const ctx = this.ctx;
    const o = this.origin();
    const themeDay = document.body.dataset.theme === 'day';
    const pulse = 1 + Math.sin(time * 0.0021) * 0.035;
    const coreW = o.spread * 1.8 * pulse;
    const coreH = o.lift * 0.72 * pulse;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(o.x, o.y);

    const halo = ctx.createRadialGradient(0, -coreH * 0.22, 0, 0, -coreH * 0.22, coreW * 1.45);
    halo.addColorStop(0, themeDay ? 'rgba(95,190,255,.18)' : 'rgba(44,135,255,.28)');
    halo.addColorStop(0.45, 'rgba(31,105,238,.10)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(0, -coreH * 0.22, coreW * 1.4, coreH * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();

    const layers = [
      { scale: 1, color0: 'rgba(34,93,255,.04)', color1: 'rgba(33,132,255,.25)', color2: 'rgba(93,221,255,.12)' },
      { scale: .72, color0: 'rgba(36,106,255,.12)', color1: 'rgba(61,173,255,.48)', color2: 'rgba(164,241,255,.20)' },
      { scale: .42, color0: 'rgba(110,211,255,.25)', color1: 'rgba(201,250,255,.72)', color2: 'rgba(255,255,255,.18)' }
    ];

    layers.forEach((layer, index) => {
      const w = coreW * layer.scale;
      const h = coreH * layer.scale;
      const sway = Math.sin(time * 0.0016 + index * 1.7) * coreW * 0.09;
      const grad = ctx.createLinearGradient(0, 0, 0, -h);
      grad.addColorStop(0, layer.color0);
      grad.addColorStop(.48, layer.color1);
      grad.addColorStop(1, layer.color2);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-w * .42, 0);
      ctx.bezierCurveTo(-w * .72, -h * .28, -w * .24 + sway, -h * .58, -w * .08 + sway, -h);
      ctx.bezierCurveTo(w * .05 + sway, -h * .72, w * .58, -h * .38, w * .42, 0);
      ctx.bezierCurveTo(w * .17, -h * .08, -w * .18, -h * .08, -w * .42, 0);
      ctx.fill();
    });
    ctx.restore();
  }

  update(dt, time) {
    const o = this.origin();
    const spawnRate = this.reduced ? 0 : (this.mode === 'hero' ? 5 : 3);
    this.spawn(Math.max(0, Math.round(spawnRate * dt * 60)));
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      const normalized = 1 - p.life / p.maxLife;
      const turbulence = Math.sin(time * 0.0025 + p.seed * 12 + normalized * 9);
      p.x += (p.vx + turbulence * o.spread * 0.045) * dt;
      p.y += p.vy * dt;
      p.vx *= 0.996;
      p.vy *= 0.994;
      p.size *= 0.998;
      return true;
    });
  }

  drawParticles() {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const life = p.life / p.maxLife;
      const alpha = Math.sin(Math.PI * Math.min(1, life)) * (0.12 + p.seed * 0.20) * this.intensity;
      const radius = p.size * (0.55 + (1 - life) * 1.2);
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 2.1);
      grad.addColorStop(0, `hsla(${p.hue + 10},100%,88%,${alpha * 1.3})`);
      grad.addColorStop(.28, `hsla(${p.hue},100%,62%,${alpha})`);
      grad.addColorStop(1, `hsla(${p.hue - 16},100%,38%,0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, radius * .78, radius * 1.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  animate(time) {
    this.frame = requestAnimationFrame(this.animate);
    if (!this.visible || !this.running || !this.ctx) return;
    const dt = Math.min(.04, Math.max(.001, (time - this.lastTime) / 1000));
    this.lastTime = time;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawCore(time);
    if (!this.reduced) this.update(dt, time);
    this.drawParticles();
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
  }
}
