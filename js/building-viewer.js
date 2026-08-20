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
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}
function mat4Translation(x, y, z) { const m=mat4Identity();m[12]=x;m[13]=y;m[14]=z;return m; }
function mat4Scale(x, y, z) { const m=mat4Identity();m[0]=x;m[5]=y;m[10]=z;return m; }
function mat4RotationX(r) { const c=Math.cos(r),s=Math.sin(r);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]); }
function mat4RotationY(r) { const c=Math.cos(r),s=Math.sin(r);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]); }
function mat4Perspective(fovy, aspect, near, far) {
  const f=1/Math.tan(fovy/2),nf=1/(near-far),m=new Float32Array(16);
  m[0]=f/aspect;m[5]=f;m[10]=(far+near)*nf;m[11]=-1;m[14]=2*far*near*nf;return m;
}
function normalize(v) { const l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l]; }
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function mat4LookAt(eye,center,up){
  const z=normalize([eye[0]-center[0],eye[1]-center[1],eye[2]-center[2]]),x=normalize(cross(up,z)),y=cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
function compileShader(gl,type,source){
  const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(`Shader compilation failed: ${log}`);}return shader;
}
function createProgram(gl,vs,fs){
  const program=gl.createProgram();gl.attachShader(program,compileShader(gl,gl.VERTEX_SHADER,vs));gl.attachShader(program,compileShader(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){const log=gl.getProgramInfoLog(program);gl.deleteProgram(program);throw new Error(`Program link failed: ${log}`);}return program;
}
function parseGlb(buffer){
  const view=new DataView(buffer);if(view.getUint32(0,true)!==0x46546c67)throw new Error('Invalid GLB');if(view.getUint32(4,true)!==2)throw new Error('Unsupported GLB version');
  const total=view.getUint32(8,true);let offset=12,json=null,binary=null;
  while(offset<total){const len=view.getUint32(offset,true),type=view.getUint32(offset+4,true),start=offset+8;if(type===0x4E4F534A){json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,start,len)).replace(/\u0000+$/g,'').trim());}else if(type===0x004E4942){binary=new Uint8Array(buffer,start,len);}offset=start+len;}
  if(!json||!binary)throw new Error('GLB chunks missing');
  const accessorData=(index)=>{const a=json.accessors[index],bv=json.bufferViews[a.bufferView],TA=TYPED_ARRAYS[a.componentType],cc=COMPONENTS[a.type],bo=binary.byteOffset+(bv.byteOffset||0)+(a.byteOffset||0);return{data:new TA(binary.buffer,bo,a.count*cc),accessor:a};};
  const primitive=json.meshes?.[0]?.primitives?.[0];if(!primitive)throw new Error('No mesh in GLB');
  return{positions:accessorData(primitive.attributes.POSITION),normals:accessorData(primitive.attributes.NORMAL),colors:accessorData(primitive.attributes.COLOR_0),indices:accessorData(primitive.indices)};
}

export class BuildingViewer {
  constructor(canvas, modelUrl) {
    this.canvas=canvas;this.modelUrl=modelUrl;this.gl=null;this.program=null;this.vao=null;this.indexCount=0;this.indexType=null;
    this.rotationY=-0.52;this.rotationX=-0.08;this.targetRotationX=-0.08;this.velocityY=0;this.dragging=false;this.last={x:0,y:0};this.lastInteraction=0;
    this.visible=true;this.running=true;this.start=performance.now();this.center=[0,0,0];this.scale=1;this.frame=0;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  async init(){
    const gl=this.canvas.getContext('webgl2',{alpha:true,antialias:true,depth:true,premultipliedAlpha:true,powerPreference:'high-performance'});if(!gl)throw new Error('WebGL2 unavailable');this.gl=gl;
    const response=await fetch(this.modelUrl,{cache:'force-cache'});if(!response.ok)throw new Error(`Model load failed (${response.status})`);const mesh=parseGlb(await response.arrayBuffer());
    this.prepareProgram();this.prepareGeometry(mesh);this.bindEvents();this.resize();this.frame=requestAnimationFrame((t)=>this.render(t));return this;
  }
  prepareProgram(){
    const gl=this.gl;
    const vertex=`#version 300 es
      precision highp float;
      layout(location=0) in vec3 aPosition;
      layout(location=1) in vec3 aNormal;
      layout(location=2) in vec4 aColor;
      uniform mat4 uModel;
      uniform mat4 uViewProjection;
      out vec3 vNormal;
      out vec3 vWorld;
      out vec4 vColor;
      void main(){vec4 world=uModel*vec4(aPosition,1.0);vWorld=world.xyz;vNormal=normalize(mat3(uModel)*aNormal);vColor=aColor;gl_Position=uViewProjection*world;}
    `;
    const fragment=`#version 300 es
      precision highp float;
      in vec3 vNormal;
      in vec3 vWorld;
      in vec4 vColor;
      uniform float uTime;
      uniform float uGlow;
      uniform float uDay;
      out vec4 outColor;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123);}
      void main(){
        vec3 n=normalize(vNormal);
        vec3 key=normalize(vec3(-.62,.86,.54));
        vec3 rimLight=normalize(vec3(.84,.18,-.46));
        float kd=max(dot(n,key),0.0);
        float kd2=max(dot(n,rimLight),0.0);
        vec3 viewDir=normalize(vec3(0.0,.5,8.2)-vWorld);
        float fresnel=pow(1.0-max(dot(n,viewDir),0.0),2.6);
        float blueDominance=vColor.b-max(vColor.r,vColor.g*.72);
        float blueWindow=smoothstep(.12,.46,blueDominance)*smoothstep(.30,.95,vColor.b);
        float warmWindow=smoothstep(.38,.72,vColor.r)*smoothstep(.20,.55,vColor.g)*(1.0-blueWindow);
        float seed=hash(floor(vWorld*vec3(6.0,8.0,6.0)));
        float frequency=1.2+seed*3.8;
        float raw=.5+.5*sin(uTime*frequency+seed*14.0+vWorld.y*.6);
        float flicker=mix(.58,1.12,smoothstep(.16,.9,raw));
        float rareOff=step(.08,hash(floor(vWorld*12.0)+floor(uTime*.35)));
        flicker*=mix(.32,1.0,rareOff);
        vec3 base=vColor.rgb;
        vec3 nightLit=base*(.14+kd*.82+kd2*.18)+vec3(.045,.15,.34)*fresnel*.95;
        vec3 dayLit=base*(.42+kd*.95+kd2*.20)+vec3(.11,.24,.42)*fresnel*.52+vec3(.10,.09,.07)*smoothstep(2.0,8.0,vWorld.y);
        vec3 lit=mix(nightLit,dayLit,uDay);
        vec3 emission=vec3(.04,.46,1.22)*blueWindow*flicker+vec3(1.0,.52,.18)*warmWindow*flicker*.9;
        float crown=smoothstep(6.2,8.2,vWorld.y)*(0.7+0.3*sin(uTime*2.1));
        emission+=vec3(.04,.50,1.25)*crown*blueWindow*.55;
        vec3 color=lit+emission;
        float verticalFog=smoothstep(-4.0,7.0,vWorld.y);
        color+=vec3(.02,.07,.16)*verticalFog*(1.0-uDay)*.3;
        if(uGlow>.5){float edge=fresnel*.34+blueWindow*.85+warmWindow*.55+crown*.12;vec3 g=mix(vec3(.04,.18,.56),vec3(.13,.68,1.3),blueWindow);g+=vec3(1.0,.34,.08)*warmWindow*.6;outColor=vec4(g,edge*.21);}else{outColor=vec4(color,1.0);}
      }
    `;
    this.program=createProgram(gl,vertex,fragment);this.uniforms={model:gl.getUniformLocation(this.program,'uModel'),viewProjection:gl.getUniformLocation(this.program,'uViewProjection'),time:gl.getUniformLocation(this.program,'uTime'),glow:gl.getUniformLocation(this.program,'uGlow'),day:gl.getUniformLocation(this.program,'uDay')};
  }
  prepareGeometry(mesh){
    const gl=this.gl,vao=gl.createVertexArray();gl.bindVertexArray(vao);
    const attach=(loc,data,size)=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);};
    attach(0,mesh.positions.data,3);attach(1,mesh.normals.data,3);attach(2,mesh.colors.data,4);
    const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices.data,gl.STATIC_DRAW);this.indexType=mesh.indices.data instanceof Uint32Array?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT;this.indexCount=mesh.indices.accessor.count;this.vao=vao;
    const min=mesh.positions.accessor.min||[-3,-4,-3],max=mesh.positions.accessor.max||[3,8,3];this.center=[(min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2];this.scale=7.0/Math.max(max[0]-min[0],max[1]-min[1],max[2]-min[2]);gl.bindVertexArray(null);
  }
  bindEvents(){
    const c=this.canvas;c.addEventListener('pointerdown',(e)=>{this.dragging=true;this.last={x:e.clientX,y:e.clientY};this.velocityY=0;this.lastInteraction=performance.now();c.setPointerCapture?.(e.pointerId);});
    c.addEventListener('pointermove',(e)=>{if(!this.dragging)return;const dx=e.clientX-this.last.x,dy=e.clientY-this.last.y;this.rotationY+=dx*.0068;this.targetRotationX=Math.max(-.28,Math.min(.14,this.targetRotationX+dy*.0032));this.velocityY=dx*.00042;this.last={x:e.clientX,y:e.clientY};this.lastInteraction=performance.now();});
    const end=(e)=>{this.dragging=false;this.lastInteraction=performance.now();try{c.releasePointerCapture?.(e.pointerId);}catch{}};c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);c.addEventListener('dblclick',()=>{this.rotationY=-.52;this.targetRotationX=-.08;});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(c);this.intersectionObserver=new IntersectionObserver((entries)=>{this.visible=entries[0]?.isIntersecting??true;},{rootMargin:'180px'});this.intersectionObserver.observe(c);document.addEventListener('visibilitychange',()=>{this.running=!document.hidden;});
  }
  resize(){
    if(!this.gl)return;const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.75),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.gl.viewport(0,0,w,h);}
  }
  render(time){
    this.frame=requestAnimationFrame((t)=>this.render(t));if(!this.running||!this.visible||!this.gl)return;const gl=this.gl;this.resize();const elapsed=(time-this.start)/1000;
    if(!this.dragging&&!this.reduced){if(time-this.lastInteraction>1600)this.rotationY+=.00165;this.rotationY+=this.velocityY;this.velocityY*=.93;}this.rotationX+=(this.targetRotationX-this.rotationX)*.08;
    gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
    const aspect=this.canvas.width/this.canvas.height,projection=mat4Perspective(29*Math.PI/180,aspect,.1,100),view=mat4LookAt([0,.5,8.4],[0,.55,0],[0,1,0]),vp=mat4Multiply(projection,view);
    let model=mat4Multiply(mat4Scale(this.scale,this.scale,this.scale),mat4Translation(-this.center[0],-this.center[1],-this.center[2]));model=mat4Multiply(mat4RotationX(this.rotationX),model);model=mat4Multiply(mat4RotationY(this.rotationY),model);model=mat4Multiply(mat4Translation(0,-.22,0),model);
    gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.uniformMatrix4fv(this.uniforms.viewProjection,false,vp);gl.uniform1f(this.uniforms.time,elapsed);gl.uniform1f(this.uniforms.day,document.body.dataset.theme==='day'?1:0);
    gl.disable(gl.BLEND);gl.depthMask(true);gl.uniformMatrix4fv(this.uniforms.model,false,model);gl.uniform1f(this.uniforms.glow,0);gl.drawElements(gl.TRIANGLES,this.indexCount,this.indexType,0);
    const glowModel=mat4Multiply(model,mat4Scale(1.012,1.012,1.012));gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);gl.uniformMatrix4fv(this.uniforms.model,false,glowModel);gl.uniform1f(this.uniforms.glow,1);gl.drawElements(gl.TRIANGLES,this.indexCount,this.indexType,0);gl.depthMask(true);gl.disable(gl.BLEND);gl.bindVertexArray(null);
  }
  destroy(){cancelAnimationFrame(this.frame);this.resizeObserver?.disconnect();this.intersectionObserver?.disconnect();}
}
