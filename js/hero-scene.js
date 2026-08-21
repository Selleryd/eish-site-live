const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const ARRAYS = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

const identity = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
function multiply(a,b) {
  const o=new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++) o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return o;
}
function translate(x,y,z){const o=identity();o[12]=x;o[13]=y;o[14]=z;return o;}
function scale(x,y,z){const o=identity();o[0]=x;o[5]=y;o[10]=z;return o;}
function rotateX(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);}
function rotateY(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);}
function perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),nf=1/(near-far),o=new Float32Array(16);o[0]=f/aspect;o[5]=f;o[10]=(far+near)*nf;o[11]=-1;o[14]=2*far*near*nf;return o;}
function normalize(v){const l=Math.hypot(...v)||1;return v.map((x)=>x/l);}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function lookAt(eye,center,up){const z=normalize([eye[0]-center[0],eye[1]-center[1],eye[2]-center[2]]),x=normalize(cross(up,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}

function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Shader compilation failed');return s;}
function program(gl,vs,fs){const p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'Program link failed');return p;}

function parseGlb(buffer){
  const view=new DataView(buffer);
  if(view.getUint32(0,true)!==0x46546c67)throw new Error('Invalid GLB');
  let offset=12,json,bin;
  while(offset<buffer.byteLength){const len=view.getUint32(offset,true),type=view.getUint32(offset+4,true),start=offset+8;if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,start,len)).replace(/\0+$/,'').trim());else if(type===0x004e4942)bin=new Uint8Array(buffer,start,len);offset=start+len;}
  if(!json||!bin)throw new Error('Incomplete GLB');
  const read=(i)=>{const a=json.accessors[i],v=json.bufferViews[a.bufferView],T=ARRAYS[a.componentType],count=a.count*COMPONENTS[a.type],byteOffset=bin.byteOffset+(v.byteOffset||0)+(a.byteOffset||0);return{data:new T(bin.buffer,byteOffset,count),accessor:a};};
  const prim=json.meshes?.[0]?.primitives?.[0];
  if(!prim)throw new Error('No mesh primitive');
  return{positions:read(prim.attributes.POSITION),normals:read(prim.attributes.NORMAL),colors:read(prim.attributes.COLOR_0),indices:read(prim.indices)};
}

class ArchitecturalScene {
  constructor(canvas){
    this.canvas=canvas;
    this.gl=canvas.getContext('webgl2',{alpha:true,antialias:true,depth:true,premultipliedAlpha:true,powerPreference:'high-performance'});
    if(!this.gl)throw new Error('WebGL2 unavailable');
    this.rotationY=-0.42;this.rotationX=-0.08;this.targetX=-0.08;this.velocity=0;this.dragging=false;this.last={x:0,y:0};this.pointer={x:0,y:0};this.visible=true;this.running=true;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.start=performance.now();
  }

  async init(){
    const url=new URL('../assets/models/eish-hq.glb',import.meta.url);
    const response=await fetch(url,{cache:'force-cache'});
    if(!response.ok)throw new Error(`Model failed: ${response.status}`);
    const mesh=parseGlb(await response.arrayBuffer());
    this.createProgram();this.createGeometry(mesh);this.bind();this.resize();this.raf=requestAnimationFrame((t)=>this.render(t));
  }

  createProgram(){
    const gl=this.gl;
    const vs=`#version 300 es
      precision highp float;
      layout(location=0) in vec3 aPosition;
      layout(location=1) in vec3 aNormal;
      layout(location=2) in vec4 aColor;
      uniform mat4 uModel;
      uniform mat4 uViewProjection;
      out vec3 vNormal;
      out vec3 vWorld;
      out vec4 vColor;
      void main(){vec4 w=uModel*vec4(aPosition,1.0);vWorld=w.xyz;vNormal=normalize(mat3(uModel)*aNormal);vColor=aColor;gl_Position=uViewProjection*w;}`;
    const fs=`#version 300 es
      precision highp float;
      in vec3 vNormal;
      in vec3 vWorld;
      in vec4 vColor;
      uniform float uTime;
      uniform float uPass;
      out vec4 outColor;
      float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      void main(){
        vec3 N=normalize(vNormal);
        vec3 V=normalize(vec3(0.0,0.8,8.4)-vWorld);
        vec3 L1=normalize(vec3(-.65,.9,.55));
        vec3 L2=normalize(vec3(.85,.16,-.42));
        vec3 H1=normalize(V+L1);
        float d1=max(dot(N,L1),0.0),d2=max(dot(N,L2),0.0);
        float spec=pow(max(dot(N,H1),0.0),54.0);
        float fres=pow(1.0-max(dot(N,V),0.0),3.0);
        float blueSignal=vColor.b-max(vColor.r,vColor.g*.68);
        float warmSignal=vColor.r-max(vColor.g*.72,vColor.b*.48);
        float blueWindow=smoothstep(.22,.58,blueSignal)*smoothstep(.32,.88,vColor.b);
        float warmWindow=smoothstep(.22,.62,warmSignal)*smoothstep(.30,.78,vColor.r);
        float windowMask=max(blueWindow,warmWindow);
        float seed=hash(floor(vWorld*vec3(8.0,5.0,8.0)));
        float flicker=.82+.18*sin(uTime*(1.3+seed*2.1)+seed*13.7+vWorld.y*.37);
        flicker*=.92+.08*sin(uTime*.31+seed*6.0);
        vec3 base=vColor.rgb;
        vec3 ambient=mix(vec3(.025,.045,.075),vec3(.075,.12,.19),smoothstep(-3.0,9.0,vWorld.y));
        vec3 lit=base*(.18+d1*.72+d2*.18)+ambient;
        lit+=vec3(.12,.18,.24)*spec*.85;
        lit+=vec3(.035,.13,.32)*fres*.72;
        vec3 emission=vec3(.04,.47,1.18)*blueWindow*flicker+vec3(1.0,.42,.12)*warmWindow*(.72+.28*flicker);
        float distanceFog=smoothstep(10.0,3.8,length(vWorld.xz));
        vec3 color=(lit+emission)*(.86+.14*distanceFog);
        if(uPass>.5){float a=(windowMask*.76+fres*.16);outColor=vec4(mix(vec3(.03,.22,.7),vec3(.12,.62,1.0),blueWindow)*a,a*.22);}else{outColor=vec4(color,1.0);}
      }`;
    this.program=program(gl,vs,fs);
    this.uniforms={model:gl.getUniformLocation(this.program,'uModel'),vp:gl.getUniformLocation(this.program,'uViewProjection'),time:gl.getUniformLocation(this.program,'uTime'),pass:gl.getUniformLocation(this.program,'uPass')};
  }

  createGeometry(mesh){
    const gl=this.gl;this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
    const attach=(loc,data,size)=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);};
    attach(0,mesh.positions.data,3);attach(1,mesh.normals.data,3);attach(2,mesh.colors.data,4);
    const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices.data,gl.STATIC_DRAW);
    this.indexType=mesh.indices.data instanceof Uint32Array?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT;this.count=mesh.indices.accessor.count;
    const min=mesh.positions.accessor.min,max=mesh.positions.accessor.max;this.center=[(min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2];this.fit=7.0/Math.max(max[0]-min[0],max[1]-min[1],max[2]-min[2]);gl.bindVertexArray(null);
  }

  bind(){
    const c=this.canvas;
    c.addEventListener('pointerdown',(e)=>{this.dragging=true;this.last={x:e.clientX,y:e.clientY};this.velocity=0;c.setPointerCapture?.(e.pointerId);});
    c.addEventListener('pointermove',(e)=>{const rect=c.getBoundingClientRect();this.pointer.x=(e.clientX-rect.left)/rect.width-.5;this.pointer.y=(e.clientY-rect.top)/rect.height-.5;if(!this.dragging)return;const dx=e.clientX-this.last.x,dy=e.clientY-this.last.y;this.rotationY+=dx*.0068;this.targetX=Math.max(-.24,Math.min(.1,this.targetX+dy*.003));this.velocity=dx*.00042;this.last={x:e.clientX,y:e.clientY};});
    const end=(e)=>{this.dragging=false;try{c.releasePointerCapture?.(e.pointerId);}catch{}};c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);
    c.addEventListener('dblclick',()=>{this.rotationY=-.42;this.targetX=-.08;});
    this.ro=new ResizeObserver(()=>this.resize());this.ro.observe(c);
    this.io=new IntersectionObserver((entries)=>{this.visible=entries[0]?.isIntersecting??true;},{rootMargin:'180px'});this.io.observe(c);
    document.addEventListener('visibilitychange',()=>{this.running=!document.hidden;});
  }

  resize(){const gl=this.gl,rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.55),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;gl.viewport(0,0,w,h);}}

  render(now){
    this.raf=requestAnimationFrame((t)=>this.render(t));if(!this.running||!this.visible)return;this.resize();const gl=this.gl,t=(now-this.start)/1000;
    if(!this.dragging&&!this.reduced){this.rotationY+=.00165+this.velocity;this.velocity*=.94;}this.rotationX+=(this.targetX-this.rotationX)*.08;
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
    const aspect=this.canvas.width/this.canvas.height,proj=perspective(31*Math.PI/180,aspect,.1,100),eye=[this.pointer.x*.38,.55-this.pointer.y*.22,8.5],view=lookAt(eye,[0,.42,0],[0,1,0]),vp=multiply(proj,view);
    let model=multiply(scale(this.fit,this.fit,this.fit),translate(-this.center[0],-this.center[1],-this.center[2]));model=multiply(rotateX(this.rotationX),model);model=multiply(rotateY(this.rotationY),model);model=multiply(translate(0,-.34,0),model);
    gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.uniformMatrix4fv(this.uniforms.vp,false,vp);gl.uniform1f(this.uniforms.time,t);gl.uniformMatrix4fv(this.uniforms.model,false,model);
    gl.disable(gl.BLEND);gl.depthMask(true);gl.uniform1f(this.uniforms.pass,0);gl.drawElements(gl.TRIANGLES,this.count,this.indexType,0);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);gl.uniform1f(this.uniforms.pass,1);gl.drawElements(gl.TRIANGLES,this.count,this.indexType,0);gl.depthMask(true);gl.disable(gl.BLEND);gl.bindVertexArray(null);
  }
}

const canvas=document.querySelector('canvas[data-building]');
if(canvas){
  try{const scene=new ArchitecturalScene(canvas);scene.init().then(()=>canvas.closest('.hero-scene')?.classList.add('is-ready')).catch((error)=>console.warn('Architectural scene unavailable',error));}
  catch(error){console.warn('Architectural scene unavailable',error);}
}
