class BlueFlame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.particles = [];
    this.time = 0;
    this.last = performance.now();
    this.visible = true;
    this.running = true;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.visible = entries[0]?.isIntersecting ?? true;
    }, { rootMargin: '120px' });
    this.intersectionObserver.observe(canvas);
    document.addEventListener('visibilitychange', () => { this.running = !document.hidden; });
    this.resize();
    this.seed();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.6);
    this.width = Math.max(1, Math.round(rect.width * dpr));
    this.height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== this.width || this.canvas.height !== this.height) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }
    this.scale = dpr;
  }

  seed() {
    const count = this.reduced ? 28 : 88;
    for (let i = 0; i < count; i += 1) this.particles.push(this.createParticle(true));
  }

  createParticle(initial = false) {
    const spread = this.width * 0.11;
    const x = this.width * 0.5 + (Math.random() - 0.5) * spread;
    const y = this.height * (0.73 + Math.random() * 0.08);
    const life = 0.95 + Math.random() * 1.25;
    return {
      x,
      y: initial ? y - Math.random() * this.height * 0.48 : y,
      vx: (Math.random() - 0.5) * 8,
      vy: -(22 + Math.random() * 44),
      radius: this.width * (0.018 + Math.random() * 0.035),
      age: initial ? Math.random() * life : 0,
      life,
      phase: Math.random() * Math.PI * 2,
      layer: Math.random()
    };
  }

  update(dt) {
    this.time += dt;
    const spawnCount = this.reduced ? 0 : Math.max(1, Math.floor(dt * 42));
    for (let i = 0; i < spawnCount; i += 1) this.particles.push(this.createParticle());

    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.age / p.life;
      const curl = Math.sin(this.time * 3.2 + p.phase + t * 7.0) * (8 + 22 * t);
      p.x += (p.vx + curl) * dt;
      p.y += p.vy * dt;
      p.vy -= 6.5 * dt;
      p.radius *= 1 - 0.17 * dt;
    }

    const cap = this.reduced ? 32 : 118;
    while (this.particles.length > cap) this.particles.shift();
  }

  drawBaseGlow() {
    const ctx = this.ctx;
    const x = this.width * 0.5;
    const y = this.height * 0.72;
    const r = this.width * 0.28;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(105,211,255,.30)');
    g.addColorStop(.28, 'rgba(31,134,255,.20)');
    g.addColorStop(.65, 'rgba(9,69,160,.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'lighter';
    this.drawBaseGlow();

    for (const p of this.particles) {
      const t = p.age / p.life;
      const fade = Math.sin(Math.PI * Math.min(1, t)) * (1 - t * 0.36);
      const r = p.radius * (1 - t * 0.25);
      if (r < 0.5 || fade <= 0) continue;

      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      if (p.layer < 0.34) {
        gradient.addColorStop(0, `rgba(198,240,255,${0.42 * fade})`);
        gradient.addColorStop(.18, `rgba(74,198,255,${0.42 * fade})`);
        gradient.addColorStop(.54, `rgba(28,121,255,${0.24 * fade})`);
      } else if (p.layer < 0.76) {
        gradient.addColorStop(0, `rgba(86,202,255,${0.28 * fade})`);
        gradient.addColorStop(.24, `rgba(28,131,255,${0.28 * fade})`);
        gradient.addColorStop(.62, `rgba(14,74,190,${0.14 * fade})`);
      } else {
        gradient.addColorStop(0, `rgba(62,127,255,${0.14 * fade})`);
        gradient.addColorStop(.45, `rgba(24,72,170,${0.09 * fade})`);
      }
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * 0.78, r * 1.45, Math.sin(p.phase + t * 3) * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  frame(now) {
    this.raf = requestAnimationFrame((t) => this.frame(t));
    if (!this.running || !this.visible) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.update(dt);
    this.draw();
  }
}

document.querySelectorAll('canvas[data-flame]').forEach((canvas) => new BlueFlame(canvas));
