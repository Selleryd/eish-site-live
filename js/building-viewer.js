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
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("Invalid GLB header");
  if (view.getUint32(4, true) !== 2) throw new Error("Only glTF 2.0 is supported");
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
      json = JSON.parse(new TextDecoder().decode(bytes).replace(/\u0000+$/g, "").trim());
    } else if (chunkType === 0x004E4942) {
      binary = new Uint8Array(arrayBuffer, chunkStart, chunkLength);
    }
    offset = chunkStart + chunkLength;
  }
  if (!json || !binary) throw new Error("GLB is missing JSON or binary chunks");

  const accessorData = (index) => {
    const accessor = json.accessors[index];
    const bufferView = json.bufferViews[accessor.bufferView];
    const TypedArray = TYPED_ARRAYS[accessor.componentType];
    if (!TypedArray) throw new Error(`Unsupported component type ${accessor.componentType}`);
    const componentCount = COMPONENTS[accessor.type];
    const byteOffset = binary.byteOffset + (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const elementCount = accessor.count * componentCount;
    const data = new TypedArray(binary.buffer, byteOffset, elementCount);
    return { data, accessor, componentCount };
  };

  const primitive = json.meshes?.[0]?.primitives?.[0];
  if (!primitive) throw new Error("GLB has no renderable mesh primitive");
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
    this.rotationY = -0.42;
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
    this.resizeObserver = null;
    this.intersectionObserver = null;
  }

  async init() {
    const gl = this.canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      depth: true,
      premultipliedAlpha: true,
      powerPreference: "high-performance"
    });
    if (!gl) throw new Error("WebGL 2 is unavailable");
    this.gl = gl;

    const response = await fetch(this.modelUrl, { cache: "force-cache" });
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
      void main() {
        vec3 n = normalize(vNormal);
        vec3 lightA = normalize(vec3(-0.6, 0.85, 0.7));
        vec3 lightB = normalize(vec3(0.8, 0.22, -0.5));
        float diffuseA = max(dot(n, lightA), 0.0);
        float diffuseB = max(dot(n, lightB), 0.0);
        vec3 viewDir = normalize(vec3(0.0, 0.1, 7.0) - vWorldPosition);
        float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.4);
        float blueDominance = vColor.b - max(vColor.r, vColor.g * 0.62);
        float emissiveMask = smoothstep(0.22, 0.62, blueDominance) * smoothstep(0.25, 0.72, vColor.b);
        float shimmer = 0.88 + 0.12 * sin(uTime * 1.35 + vWorldPosition.y * 2.3 + vWorldPosition.x * 0.8);
        vec3 base = vColor.rgb;
        vec3 lit = base * (0.22 + diffuseA * 0.82 + diffuseB * 0.24);
        lit += vec3(0.08, 0.24, 0.52) * rim * 0.72;
        vec3 emission = vec3(0.04, 0.43, 1.08) * emissiveMask * shimmer;
        float heightGlow = smoothstep(-2.2, 2.4, vWorldPosition.y) * 0.05;
        vec3 color = lit + emission + vec3(0.04, 0.12, 0.24) * heightGlow;
        if (uGlowPass > 0.5) {
          float edge = rim * 0.28 + emissiveMask * 0.8;
          outColor = vec4(vec3(0.04, 0.38, 1.0) * edge, edge * 0.23);
        } else {
          float fog = smoothstep(8.5, 2.2, length(vWorldPosition.xy));
          color *= 0.86 + fog * 0.14;
          outColor = vec4(color, 1.0);
        }
      }
    `;
    this.program = createProgram(gl, vertex, fragment);
    this.uniforms = {
      model: gl.getUniformLocation(this.program, "uModel"),
      viewProjection: gl.getUniformLocation(this.program, "uViewProjection"),
      time: gl.getUniformLocation(this.program, "uTime"),
      glowPass: gl.getUniformLocation(this.program, "uGlowPass")
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

    const min = mesh.positions.accessor.min || [-4.5, 0, -3];
    const max = mesh.positions.accessor.max || [4.5, 27.4, 3];
    this.center = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2
    ];
    const extent = Math.max(max[0]-min[0], max[1]-min[1], max[2]-min[2]);
    this.scale = 5.6 / extent;
    gl.bindVertexArray(null);
  }

  bindEvents() {
    const canvas = this.canvas;
    canvas.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.velocityY = 0;
      this.lastInteraction = performance.now();
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!this.dragging) return;
      const dx = event.clientX - this.lastPointer.x;
      const dy = event.clientY - this.lastPointer.y;
      this.rotationY += dx * 0.007;
      this.targetRotationX = Math.max(-0.24, Math.min(0.15, this.targetRotationX + dy * 0.003));
      this.velocityY = dx * 0.00045;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.lastInteraction = performance.now();
    });
    const endDrag = (event) => {
      this.dragging = false;
      this.lastInteraction = performance.now();
      try { canvas.releasePointerCapture?.(event.pointerId); } catch (_) { /* no-op */ }
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("dblclick", () => {
      this.rotationY = -0.42;
      this.targetRotationX = -0.08;
      this.lastInteraction = performance.now();
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.visible = entries[0]?.isIntersecting ?? true;
    }, { rootMargin: "180px" });
    this.intersectionObserver.observe(canvas);
    document.addEventListener("visibilitychange", () => { this.running = !document.hidden; });
  }

  resize() {
    const gl = this.gl;
    if (!gl) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
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
      if (idleFor > 2200) this.rotationY += 0.00225;
      this.rotationY += this.velocityY;
      this.velocityY *= 0.94;
    }
    this.rotationX += (this.targetRotationX - this.rotationX) * 0.08;

    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    const aspect = this.canvas.width / this.canvas.height;
    const projection = mat4Perspective(34 * Math.PI / 180, aspect, 0.1, 100);
    const view = mat4LookAt([0, 0.15, 7.4], [0, -0.05, 0], [0, 1, 0]);
    const viewProjection = mat4Multiply(projection, view);

    const centerTranslation = mat4Translation(-this.center[0], -this.center[1], -this.center[2]);
    const scale = mat4Scale(this.scale, this.scale, this.scale);
    const rotationX = mat4RotationX(this.rotationX);
    const rotationY = mat4RotationY(this.rotationY);
    const position = mat4Translation(0, -0.15, 0);
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

    const glowScale = mat4Scale(1.013, 1.013, 1.013);
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
