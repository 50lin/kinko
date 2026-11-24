import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { DOMAINS, DOMAIN_COLOR, type Domain } from '@kinko/core';

/*
 * Esfera Kinkō: un objeto vivo que traduce tu estado en forma, color y ritmo.
 * - Cada una de las 7 dimensiones ocupa una zona: si está baja, esa zona se contrae y pierde color.
 * - La calma controla la turbulencia; la energía, la velocidad; la puntuación global, el tono (cálido → sereno).
 * - En los ejercicios de respiración se expande y contrae marcando el ritmo.
 * Ruido simplex 3D: Ashima Arts / Stefan Gustavson (licencia MIT).
 */
const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}`;

const VERT = `uniform float uTime,uCalm,uEnergy,uBreath,uPulse;uniform float uDomains[7];uniform vec3 uDirs[7];uniform vec3 uColors[7];
varying vec3 vNormal;varying vec3 vView;varying float vNoise;varying vec3 vTint;varying float vLow;${NOISE}
void main(){vec3 p=position;vec3 dir=normalize(p);float speed=0.12+uEnergy*0.38;float turb=0.045+(1.0-uCalm)*0.2;
float n=snoise(p*1.5+vec3(uTime*speed));float n2=snoise(p*3.4-vec3(uTime*speed*1.4));float disp=n*turb+n2*turb*0.35;
vec3 tint=vec3(0.0);float ws=0.0;float low=0.0;
for(int i=0;i<7;i++){float w=pow(max(dot(dir,uDirs[i]),0.0),5.0);disp+=w*(uDomains[i]-0.55)*0.34;tint+=uColors[i]*w;ws+=w;low+=w*(1.0-uDomains[i]);}
vTint=ws>0.001?tint/ws:vec3(0.6);vLow=clamp(low*1.2,0.0,1.0);vNoise=n;
float sc=1.0+uBreath*0.24+uPulse*0.09;vec3 np=p*(1.0+disp)*sc;vec4 mv=modelViewMatrix*vec4(np,1.0);vView=-mv.xyz;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*mv;}`;

const FRAG = `uniform float uOverall,uTime;varying vec3 vNormal;varying vec3 vView;varying float vNoise;varying vec3 vTint;varying float vLow;
void main(){vec3 N=normalize(vNormal);vec3 V=normalize(vView);float fres=pow(1.0-max(dot(N,V),0.0),2.0);
vec3 warm=vec3(0.92,0.52,0.42);vec3 mid=vec3(0.86,0.76,0.47);vec3 cool=vec3(0.24,0.70,0.62);
vec3 base=uOverall<0.5?mix(warm,mid,uOverall*2.0):mix(mid,cool,(uOverall-0.5)*2.0);
vec3 col=mix(base,vTint,0.42);float g=dot(col,vec3(0.299,0.587,0.114));col=mix(col,vec3(g)*0.82,vLow*0.6);
col+=0.09*vNoise;col*=0.82+0.25*max(dot(N,normalize(vec3(0.4,0.6,0.7))),0.0);
vec3 irid=0.5+0.5*cos(6.2831*(fres*0.55+vec3(0.0,0.33,0.67)+uTime*0.025));col=mix(col,irid*0.8+0.25,fres*0.5);col+=fres*0.32;
gl_FragColor=vec4(col,1.0);}`;

// Halo: se dibuja la cara trasera de una esfera mayor; la intensidad cae suavemente a 0 en el borde (sin disco visible).
const GLOW_FRAG = `uniform vec3 uColor;varying vec3 vN;varying vec3 vV;void main(){float d=clamp(-dot(normalize(vN),normalize(vV)),0.0,1.0);float i=pow(d,2.6)*0.9;gl_FragColor=vec4(uColor*i,i*0.85);}`;
const GLOW_VERT = `varying vec3 vN;varying vec3 vV;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`;

function fib(n: number) {
  const pts: THREE.Vector3[] = []; const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) { const y = 1 - (i / (n - 1)) * 2; const r = Math.sqrt(1 - y * y); pts.push(new THREE.Vector3(Math.cos(phi * i) * r, y * 0.85, Math.sin(phi * i) * r).normalize()); }
  return pts;
}
const hexToVec = (h: string) => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b); };

export interface SphereProps {
  domains?: Partial<Record<Domain, number | null>>; overall?: number | null; className?: string; face?: boolean; interactive?: boolean;
  breathRef?: { current: number }; onTap?: () => void; calmOverride?: number; quality?: 'high' | 'low'; mood?: number;
}

export function Sphere({ domains = {}, overall, className = 'h-72 w-72', face, interactive = true, breathRef, onTap, calmOverride, quality, mood }: SphereProps) {
  const host = useRef<HTMLDivElement>(null);
  const target = useRef({ overall: 0.6, calm: 0.6, energy: 0.5, domains: Array(7).fill(0.6) as number[] });
  const [fallback, setFallback] = useState(false);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const pulse = useRef(0);

  useEffect(() => {
    const vals = DOMAINS.map((d) => (domains[d] == null ? 0.6 : (domains[d] as number) / 100));
    target.current = { overall: overall == null ? 0.6 : overall / 100, calm: calmOverride ?? (domains.calma == null ? 0.6 : (domains.calma as number) / 100), energy: domains.energia == null ? 0.5 : (domains.energia as number) / 100, domains: vals };
  }, [JSON.stringify(domains), overall, calmOverride]);

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch { setFallback(true); return; }
    const mobile = quality === 'low' || /Android|iPhone|iPad/i.test(navigator.userAgent);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.6 : 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50); camera.position.z = 5.2;
    const dirs = fib(7);
    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 }, uCalm: { value: 0.6 }, uEnergy: { value: 0.5 }, uBreath: { value: 0 }, uPulse: { value: 0 }, uOverall: { value: 0.6 },
      uDomains: { value: Array(7).fill(0.6) }, uDirs: { value: dirs }, uColors: { value: DOMAINS.map((d) => hexToVec(DOMAIN_COLOR[d])) },
    };
    const geo = new THREE.IcosahedronGeometry(1, mobile ? 40 : 72);
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms });
    const mesh = new THREE.Mesh(geo, mat);
    const glowU = { uColor: { value: new THREE.Color('#52b9a1') } };
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.32, 48, 48), new THREE.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: glowU, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    const n = mobile ? 180 : 360; const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(1.55 + Math.random() * 0.75); pos.set([v.x, v.y, v.z], i * 3); }
    const pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pmat = new THREE.PointsMaterial({ size: 0.022, color: '#a8e6d6', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(pgeo, pmat);
    const group = new THREE.Group(); group.add(glow, mesh, points); scene.add(group);

    const resize = () => { const w = el.clientWidth || 1, h = el.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting)); io.observe(el);
    const pointer = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2; pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 2; if (face) setLook({ x: Math.max(-1, Math.min(1, pointer.x)), y: Math.max(-1, Math.min(1, pointer.y)) }); };
    if (interactive) window.addEventListener('pointermove', onMove);
    const clock = new THREE.Clock(); const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    renderer.setAnimationLoop(() => {
      if (!visible || document.hidden) return;
      const dt = Math.min(clock.getDelta(), 0.05); const t = target.current;
      uniforms.uTime.value += dt * (reduce ? 0.25 : 1);
      uniforms.uOverall.value = lerp(uniforms.uOverall.value, t.overall, 0.04);
      uniforms.uCalm.value = lerp(uniforms.uCalm.value, t.calm, 0.04);
      uniforms.uEnergy.value = lerp(uniforms.uEnergy.value, t.energy, 0.04);
      uniforms.uDomains.value = (uniforms.uDomains.value as number[]).map((v, i) => lerp(v, t.domains[i], 0.05));
      uniforms.uBreath.value = lerp(uniforms.uBreath.value, breathRef ? breathRef.current : Math.sin(uniforms.uTime.value * 0.9) * 0.03 + 0.03, breathRef ? 0.12 : 0.1);
      pulse.current *= 0.92; uniforms.uPulse.value = pulse.current;
      const o = uniforms.uOverall.value as number;
      glowU.uColor.value.setHSL(lerp(0.05, 0.47, o), 0.6, 0.55);
      pmat.color.setHSL(lerp(0.08, 0.45, o), 0.55, 0.75);
      group.rotation.y += dt * (0.08 + (uniforms.uEnergy.value as number) * 0.12);
      group.rotation.x = lerp(group.rotation.x, pointer.y * 0.25, 0.03);
      group.rotation.z = lerp(group.rotation.z, -pointer.x * 0.12, 0.03);
      points.rotation.y -= dt * 0.05;
      renderer.render(scene, camera);
    });
    (el as any).__pulse = () => { pulse.current = 1; };
    return () => {
      renderer.setAnimationLoop(null); ro.disconnect(); io.disconnect(); window.removeEventListener('pointermove', onMove);
      geo.dispose(); mat.dispose(); pgeo.dispose(); pmat.dispose(); (glow.geometry as THREE.BufferGeometry).dispose(); (glow.material as THREE.Material).dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [face, interactive, quality]);

  const ov = overall == null ? 60 : overall;
  const smile = mood != null ? (mood - 5.5) * 3 : (ov - 55) / 4;
  return (
    <div className={`relative ${className}`} onClick={() => { (host.current as any)?.__pulse?.(); onTap?.(); }} role={onTap ? 'button' : 'img'} aria-label={`Esfera Kinkō: equilibrio ${overall ?? 'sin datos'} sobre 100`}>
      <div ref={host} className="absolute inset-0" />
      {fallback && <div className="absolute inset-[12%] rounded-full animate-float" style={{ background: `radial-gradient(circle at 35% 30%, #e6fbf4, hsl(${120 + ov * 0.6} 45% 55%) 50%, hsl(${140 + ov * 0.5} 50% 22%))`, boxShadow: '0 30px 80px -20px rgba(51,157,135,.6)' }} />}
      {face && (
        <svg viewBox="-50 -50 100 100" className="pointer-events-none absolute left-1/2 top-1/2 h-[46%] w-[46%] -translate-x-1/2 -translate-y-1/2 drop-shadow">
          <g transform={`translate(${look.x * 4} ${look.y * 3})`}>
            <g className="origin-center" style={{ animation: 'blink 4.5s infinite' }}>
              <ellipse cx="-13" cy="-6" rx="5" ry="7" fill="#0e1514" opacity=".85" /><ellipse cx="13" cy="-6" rx="5" ry="7" fill="#0e1514" opacity=".85" />
              <circle cx="-11.5" cy="-9" r="1.6" fill="#fff" /><circle cx="14.5" cy="-9" r="1.6" fill="#fff" />
            </g>
            <path d={`M -11 12 Q 0 ${12 + smile} 11 12`} stroke="#0e1514" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".8" />
            <circle cx="-22" cy="6" r="4" fill="#ff8fa3" opacity=".35" /><circle cx="22" cy="6" r="4" fill="#ff8fa3" opacity=".35" />
          </g>
          <style>{`@keyframes blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}`}</style>
        </svg>
      )}
    </div>
  );
}
