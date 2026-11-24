import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Sphere } from './Sphere';
import { Button, Segmented } from './ui';

export const PATTERNS = {
  caja: { name: 'En caja', phases: [['Inspira', 4], ['Mantén', 4], ['Suelta', 4], ['Pausa', 4]] as [string, number][], cycles: 5, desc: 'Equilibra y centra. Ideal antes de algo importante.' },
  '478': { name: '4-7-8', phases: [['Inspira', 4], ['Mantén', 7], ['Suelta', 8]] as [string, number][], cycles: 4, desc: 'Para dormir: exhalación larga que relaja.' },
  coherente: { name: 'Coherente', phases: [['Inspira', 5.5], ['Suelta', 5.5]] as [string, number][], cycles: 8, desc: 'Unas 5,5 respiraciones por minuto: aumenta la variabilidad cardiaca.' },
  calma: { name: 'Suspiro', phases: [['Inspira', 2], ['Un poco más', 1], ['Suelta despacio', 6]] as [string, number][], cycles: 5, desc: 'Suspiro fisiológico: la forma más rápida de bajar la activación.' },
} as const;
export type PatternId = keyof typeof PATTERNS;

/** Ejercicio de respiración guiado por la esfera 3D: se expande al inspirar y se contrae al soltar. */
export function Breathing({ initial = 'caja', onClose, onDone, domains, overall }: { initial?: PatternId; onClose: () => void; onDone?: (p: PatternId) => void; domains?: any; overall?: number | null }) {
  const [pid, setPid] = useState<PatternId>(initial);
  const [running, setRunning] = useState(false);
  const [state, setState] = useState({ phase: 'Preparado/a', left: 0, cycle: 0 });
  const breath = useRef(0);
  const p = PATTERNS[pid];
  useEffect(() => {
    if (!running) return;
    let raf = 0; const start = performance.now(); const total = p.phases.reduce((a, [, s]) => a + s, 0);
    let lastLabel = '';
    const tick = (now: number) => {
      const el = (now - start) / 1000; const cycle = Math.floor(el / total);
      if (cycle >= p.cycles) { setRunning(false); breath.current = 0; setState({ phase: '¡Hecho!', left: 0, cycle: p.cycles }); onDone?.(pid); return; }
      let t = el % total; let i = 0;
      while (t > p.phases[i][1]) { t -= p.phases[i][1]; i++; }
      const [label, dur] = p.phases[i]; const k = t / dur;
      const isIn = /inspira|más/i.test(label), isOut = /suelta/i.test(label);
      breath.current = isIn ? Math.min(1, (i > 0 && /más/i.test(label) ? 0.8 : 0) + k * (/más/i.test(label) ? 0.2 : 0.8)) : isOut ? 1 - k : /pausa/i.test(label) ? 0 : 1;
      if (/pausa/i.test(label)) breath.current = 0;
      const left = Math.ceil(dur - t);
      const key = `${label}${left}${cycle}`;
      if (key !== lastLabel) { lastLabel = key; setState({ phase: label, left, cycle: cycle + 1 }); if ('vibrate' in navigator && t < 0.05) navigator.vibrate?.(15); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, pid]);
  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-between bg-night-950 bg-aurora px-6 pb-10 pt-6 text-white">
      <div className="flex w-full max-w-xl items-center justify-between">
        <Segmented options={Object.entries(PATTERNS).map(([id, x]) => ({ id: id as PatternId, label: x.name }))} value={pid} onChange={(v) => { setRunning(false); breath.current = 0; setPid(v); setState({ phase: 'Preparado/a', left: 0, cycle: 0 }); }} />
        <button onClick={onClose} className="rounded-full bg-white/10 p-2.5 hover:bg-white/20" aria-label="Cerrar"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex flex-col items-center">
        <Sphere className="h-[min(70vw,420px)] w-[min(70vw,420px)]" breathRef={breath} domains={domains} overall={overall ?? 70} calmOverride={0.95} interactive={false} />
        <div className="mt-4 text-center">
          <div className="font-display text-4xl">{state.phase}</div>
          <div className="mt-1 h-6 text-lg text-white/70 tabular-nums">{running && state.left > 0 ? state.left : ''}</div>
          <div className="mt-2 text-sm text-white/60">{running ? `Ciclo ${state.cycle} de ${p.cycles}` : p.desc}</div>
        </div>
      </div>
      <div className="flex gap-3">
        {!running ? <Button size="lg" onClick={() => setRunning(true)}>{state.phase === '¡Hecho!' ? 'Repetir' : 'Empezar'}</Button> : <Button size="lg" variant="outline" className="!border-white/20 !text-white" onClick={() => { setRunning(false); breath.current = 0; }}>Pausar</Button>}
      </div>
    </div>
  );
}
