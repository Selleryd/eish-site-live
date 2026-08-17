const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPED_ARRAYS = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array
};

function mat4Identity() {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}
function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}
function mat4Translation(x, y, z) {
  const out = mat4Identity();
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}
function mat4Scale(x, y, z) {
  const out = mat4Identity();
  out[0] = x; out[5] = y; out[10] = z;
  return out;
}
function mat4RotationX(rad) {
  const c = Math.cos(rad); const s = Math.sin(rad);
  return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
}
function mat4RotationY(rad) {
  const c = Math.cos(rad); const s = Math.sin(rad);
  return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
}
function mat4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}
function normalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}
function cross(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function mat4LookAt(eye, center, up) {
  const z = normalize([eye[0]-center[0], eye[1]-center[1], eye[2]-center[2]]);
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
  ]);
}
function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${log}`);
  }
  return shader;
}
function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }
  return program;
}

function parseGlb(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Invalid GLB header');
  if (view.getUint32(4, true) !== 2) throw new Error('Only glTF 2.0 is supported');
  const totalLength = view.getUint32(8, true);
  let offset = 12;
  let json = null;
  let binary = null;

  while (offset < totalLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    if (chunkType === 0x4E4F534A) {
      const bytes = new Uint8Array(arrayBuffer, chunkStart, chunkLength);
      json = JSON.parse(new TextDecoder().decode(bytes).replace(/\u0000+$/g, '').trim());
    } else if (chunkType === 0x004E4942) {
      binary = new Uint8Array(arrayBuffer, chunkStart, chunkLength);
    }
    offset = chunkStart + chunkLength;
  }
  if (!json || !binary) throw new Error('GLB missing JSON or binary chunks');

  const accessorData = (index) => {
    const accessor = json.accessors[index];
    const bufferView = json.bufferViews[accessor.bufferView];
    const TypedArray = TYPED_ARRAYS[accessor.componentType];
    const componentCount = COMPONENTS[accessor.type];
    const byteOffset = binary.byteOffset + (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const elementCount = accessor.count * componentCount;
    const data = new TypedArray(binary.buffer, byteOffset, elementCount);
    return { data, accessor };
  };

  const primitive = json.meshes?.[0]?.primitives?.[0];
  if (!primitive) throw new Error('No renderable mesh primitive found');
  return {
    positions: accessorData(primitive.attributes.POSITION),
    normals: accessorData(primitive.attributes.NORMAL),
    colors: accessorData(primitive.attributes.COLOR_0),
    indices: accessorData(primitive.indices)
  };
}

export class BuildingViewer {
  constructor(canvas, modelUrl) {
    this.canvas = canvas;
    this.modelUrl = modelUrl;
    this.gl = null;
    this.program = null;
    this.vao = null;
    this.indexCount = 0;
    this.indexType = null;
    this.rotationY = -0.55;
    this.rotationX = -0.08;
    this.targetRotationX = -0.08;
    this.velocityY = 0;
    this.dragging = false;
    this.lastPointer = { x: 0, y: 0 };
    this.lastInteraction = 0;
    this.running = true;
    this.visible = true;
    this.frame = 0;
    this.startTime = performance.now();
    this.center = [0, 0, 0];
    this.scale = 1;
  }

  async init() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      depth: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance'
    });
    if (!gl) throw new Error('WebGL 2 is unavailable');
    this.gl = gl;

    const response = await fetch(this.modelUrl, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Unable to load model (${response.status})`);
    const mesh = parseGlb(await response.arrayBuffer());
    this.prepareProgram();
    this.prepareGeometry(mesh);
    this.bindEvents();
    this.resize();
    this.frame = requestAnimationFrame((time) => this.render(time));
    return this;
  }

  prepareProgram() {
    const gl = this.gl;
    const vertex = `#version 300 es
      precision highp float;
      layout(location = 0) in vec3 aPosition;
      layout(location = 1) in vec3 aNormal;
      layout(location = 2) in vec4 aColor;
      uniform mat4 uModel;
      uniform mat4 uViewProjection;
      out vec3 vNormal;
      out vec3 vWorldPosition;
      out vec4 vColor;
      void main() {
        vec4 world = uModel * vec4(aPosition, 1.0);
        vWorldPosition = world.xyz;
        vNormal = normalize(mat3(uModel) * aNormal);
        vColor = aColor;
        gl_Position = uViewProjection * world;
      }
    `;
    const fragment = `#version 300 es
      precision highp float;
      in vec3 vNormal;
      in vec3 vWorldPosition;
      in vec4 vColor;
      uniform float uTime;
      uniform float uGlowPass;
      out vec4 outColor;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec3 n = normalize(vNormal);
        vec3 lightA = normalize(vec3(-0.7, 0.92, 0.55));
        vec3 lightB = normalize(vec3(0.9, 0.18, -0.3));
        vec3 lightC = normalize(vec3(-0.15, 0.22, -1.0));
        float diffuseA = max(dot(n, lightA), 0.0);
        float diffuseB = max(dot(n, lightB), 0.0);
        float diffuseC = max(dot(n, lightC), 0.0);
        vec3 viewDir = normalize(vec3(0.0, 0.6, 8.0) - vWorldPosition);
        float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.5);

        float blueDominance = vColor.b - max(vColor.r, vColor.g * 0.68);
        float emissiveMask = smoothstep(0.10, 0.42, blueDominance) * smoothstep(0.24, 0.92, vColor.b);

        float windowSeed = hash(floor(vWorldPosition.xy * 8.0) + floor(vWorldPosition.zy * 6.0));
        float flicker = 0.74 + 0.26 * sin(uTime * (1.7 + windowSeed * 2.6) + windowSeed * 6.2831 + vWorldPosition.y * 0.42);
        float skylinePulse = 0.86 + 0.14 * sin(uTime * 0.55 + vWorldPosition.y * 0.35);

        vec3 base = vColor.rgb;
        vec3 lit = base * (0.18 + diffuseA * 0.86 + diffuseB * 0.22 + diffuseC * 0.18);
        lit += vec3(0.04, 0.10, 0.18) * smoothstep(-2.0, 6.0, vWorldPosition.y);
        lit += vec3(0.05, 0.16, 0.34) * rim * 0.78;

        vec3 emission = vec3(0.06, 0.50, 1.25) * emissiveMask * flicker;
        vec3 warmCrown = vec3(0.18, 0.12, 0.06) * smoothstep(3.5, 5.8, vWorldPosition.y) * 0.18;

        vec3 color = lit * skylinePulse + emission + warmCrown;
        float atmospheric = smoothstep(8.2, 0.6, length(vWorldPosition.xy));
        color *= 0.84 + atmospheric * 0.16;

        if (uGlowPass > 0.5) {
          float edge = rim * 0.34 + emissiveMask * 0.92;
          vec3 glow = mix(vec3(0.05, 0.18, 0.44), vec3(0.12, 0.58, 1.0), edge);
          outColor = vec4(glow, edge * 0.22);
        } else {
          outColor = vec4(color, 1.0);
        }
      }
    `;

    this.program = createProgram(gl, vertex, fragment);
    this.uniforms = {
      model: gl.getUniformLocation(this.program, 'uModel'),
      viewProjection: gl.getUniformLocation(this.program, 'uViewProjection'),
      time: gl.getUniformLocation(this.program, 'uTime'),
      glowPass: gl.getUniformLocation(this.program, 'uGlowPass')
    };
  }

  prepareGeometry(mesh) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const attach = (location, typedArray, size) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, typedArray, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    };
    attach(0, mesh.positions.data, 3);
    attach(1, mesh.normals.data, 3);
    attach(2, mesh.colors.data, 4);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices.data, gl.STATIC_DRAW);
    this.indexType = mesh.indices.data instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    this.indexCount = mesh.indices.accessor.count;
    this.vao = vao;

    const min = mesh.positions.accessor.min || [-4.5, -4.5, -4.5];
    const max = mesh.positions.accessor.max || [4.5, 4.5, 4.5];
    this.center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const extent = Math.max(max[0]-min[0], max[1]-min[1], max[2]-min[2]);
    this.scale = 6.1 / extent;
    gl.bindVertexArray(null);
  }

  bindEvents() {
    const canvas = this.canvas;
    canvas.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.velocityY = 0;
      this.lastInteraction = performance.now();
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      const dx = event.clientX - this.lastPointer.x;
      const dy = event.clientY - this.lastPointer.y;
      this.rotationY += dx * 0.0072;
      this.targetRotationX = Math.max(-0.3, Math.min(0.12, this.targetRotationX + dy * 0.0034));
      this.velocityY = dx * 0.00042;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.lastInteraction = performance.now();
    });
    const endDrag = (event) => {
      this.dragging = false;
      this.lastInteraction = performance.now();
      try { canvas.releasePointerCapture?.(event.pointerId); } catch (_) { }
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('dblclick', () => {
      this.rotationY = -0.55;
      this.targetRotationX = -0.08;
      this.lastInteraction = performance.now();
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.visible = entries[0]?.isIntersecting ?? true;
    }, { rootMargin: '180px' });
    this.intersectionObserver.observe(canvas);
    document.addEventListener('visibilitychange', () => { this.running = !document.hidden; });
  }

  resize() {
    const gl = this.gl;
    if (!gl) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.7);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  render(time) {
    this.frame = requestAnimationFrame((nextTime) => this.render(nextTime));
    if (!this.running || !this.visible || !this.gl) return;
    const gl = this.gl;
    this.resize();

    const elapsed = (time - this.startTime) / 1000;
    if (!this.dragging) {
      const idleFor = time - this.lastInteraction;
      if (idleFor > 1800) this.rotationY += 0.0021;
      this.rotationY += this.velocityY;
      this.velocityY *= 0.93;
    }
    this.rotationX += (this.targetRotationX - this.rotationX) * 0.09;

    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    const aspect = this.canvas.width / this.canvas.height;
    const projection = mat4Perspective(31 * Math.PI / 180, aspect, 0.1, 100);
    const view = mat4LookAt([0, 0.4, 7.9], [0, 0.45, 0], [0, 1, 0]);
    const viewProjection = mat4Multiply(projection, view);

    const centerTranslation = mat4Translation(-this.center[0], -this.center[1], -this.center[2]);
    const scale = mat4Scale(this.scale, this.scale, this.scale);
    const rotationX = mat4RotationX(this.rotationX);
    const rotationY = mat4RotationY(this.rotationY);
    const position = mat4Translation(0, -0.48, 0);
    let model = mat4Multiply(scale, centerTranslation);
    model = mat4Multiply(rotationX, model);
    model = mat4Multiply(rotationY, model);
    model = mat4Multiply(position, model);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniformMatrix4fv(this.uniforms.viewProjection, false, viewProjection);
    gl.uniform1f(this.uniforms.time, elapsed);

    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.uniformMatrix4fv(this.uniforms.model, false, model);
    gl.uniform1f(this.uniforms.glowPass, 0);
    gl.drawElements(gl.TRIANGLES, this.indexCount, this.indexType, 0);

    const glowScale = mat4Scale(1.015, 1.015, 1.015);
    const glowModel = mat4Multiply(model, glowScale);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.uniformMatrix4fv(this.uniforms.model, false, glowModel);
    gl.uniform1f(this.uniforms.glowPass, 1);
    gl.drawElements(gl.TRIANGLES, this.indexCount, this.indexType, 0);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
  }
}
