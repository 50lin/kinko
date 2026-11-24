import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DOMAINS, DOMAIN_LABEL, DOMAIN_COLOR, type Domain } from '@kinko/core';
import { dayLabel } from '@/lib/format';

const axis = { stroke: 'currentColor', fontSize: 11, tickLine: false, axisLine: false } as const;
const tip = { contentStyle: { borderRadius: 16, border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,.12)', fontSize: 12, background: 'rgba(255,255,255,.96)', color: '#1c1c1a' }, labelStyle: { fontWeight: 600 } };

export interface SeriesDef { key: string; label: string; color: string; area?: boolean; dashed?: boolean; yAxis?: 'left' | 'right' }
export function TrendChart({ data, series, height = 240, yDomain = [0, 100], xKey = 'date', refs = [], bands = [], formatX = dayLabel }: { data: any[]; series: SeriesDef[]; height?: number; yDomain?: [number, number] | ['auto', 'auto']; xKey?: string; refs?: { x?: string; y?: number; label?: string; color?: string }[]; bands?: { x1: string; x2: string; color: string; label?: string }[]; formatX?: (v: string) => string }) {
  const Chart: any = series.some((s) => s.area) ? AreaChart : LineChart;
  return (
    <div className="text-ink-400 dark:text-ink-500" style={{ height }}>
      <ResponsiveContainer>
        <Chart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
          <defs>{series.map((s) => <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={0.35} /><stop offset="100%" stopColor={s.color} stopOpacity={0} /></linearGradient>)}</defs>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
          <XAxis dataKey={xKey} {...axis} tickFormatter={formatX} minTickGap={24} />
          <YAxis {...axis} domain={yDomain as any} width={44} />
          <Tooltip {...tip} labelFormatter={formatX} />
          {bands.map((b, i) => <ReferenceArea key={i} x1={b.x1} x2={b.x2} fill={b.color} fillOpacity={0.08} label={b.label ? { value: b.label, position: 'insideTop', fontSize: 10, fill: b.color } : undefined} />)}
          {refs.map((r, i) => r.x ? <ReferenceLine key={i} x={r.x} stroke={r.color || '#9a968a'} strokeDasharray="3 3" label={r.label ? { value: r.label, position: 'top', fontSize: 10, fill: r.color || '#9a968a' } : undefined} /> : <ReferenceLine key={i} y={r.y} stroke={r.color || '#9a968a'} strokeDasharray="3 3" />)}
          {series.map((s) => s.area
            ? <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.2} fill={`url(#g-${s.key})`} connectNulls dot={false} />
            : <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.2} strokeDasharray={s.dashed ? '5 4' : undefined} dot={false} connectNulls />)}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}
export function DomainRadar({ domains, compare, height = 260 }: { domains: Partial<Record<Domain, number | null>>; compare?: Partial<Record<Domain, number | null>>; height?: number }) {
  const data = DOMAINS.map((d) => ({ d: DOMAIN_LABEL[d], v: domains[d] ?? 0, c: compare?.[d] ?? 0 }));
  return (
    <div className="text-ink-400" style={{ height }}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="currentColor" strokeOpacity={0.2} />
          <PolarAngleAxis dataKey="d" tick={{ fontSize: 11, fill: 'currentColor' }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          {compare && <Radar dataKey="c" stroke="#9a968a" fill="#9a968a" fillOpacity={0.08} strokeDasharray="4 4" name="Hace 2 semanas" />}
          <Radar dataKey="v" stroke="#339d87" fill="#339d87" fillOpacity={0.28} strokeWidth={2} name="Ahora" />
          <Tooltip {...tip} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Bars({ data, x, y, color = '#339d87', height = 200, formatX }: { data: any[]; x: string; y: string; color?: string; height?: number; formatX?: (v: any) => string }) {
  return (
    <div className="text-ink-400" style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
          <XAxis dataKey={x} {...axis} tickFormatter={formatX} minTickGap={10} /><YAxis {...axis} width={44} allowDecimals={false} />
          <Tooltip {...tip} cursor={{ fill: 'rgba(0,0,0,.04)' }} labelFormatter={formatX} />
          <Bar dataKey={y} fill={color} radius={[8, 8, 4, 4]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Spark({ data, k, color = '#339d87', height = 40 }: { data: any[]; k: string; color?: string; height?: number }) {
  return <div style={{ height }}><ResponsiveContainer><AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}><defs><linearGradient id={`sp-${k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.3} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs><Area type="monotone" dataKey={k} stroke={color} strokeWidth={1.8} fill={`url(#sp-${k})`} dot={false} connectNulls /></AreaChart></ResponsiveContainer></div>;
}
export function Ring({ value, size = 64, stroke = 7, label, color }: { value: number | null; size?: number; stroke?: number; label?: string; color?: string }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r; const v = value ?? 0;
  const col = color || (v >= 65 ? '#339d87' : v >= 45 ? '#e3a23c' : '#d9637d');
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" className="text-ink-100 dark:text-white/10" strokeWidth={stroke} fill="none" /><circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * v) / 100} style={{ transition: 'stroke-dashoffset 1s ease' }} /></svg>
      <div className="absolute text-center leading-none"><div className="font-semibold" style={{ fontSize: size * 0.28 }}>{value ?? '—'}</div>{label && <div className="mt-0.5 text-[10px] muted">{label}</div>}</div>
    </div>
  );
}
export function DomainBars({ domains }: { domains: Partial<Record<Domain, number | null>> }) {
  return (
    <div className="space-y-2.5">
      {DOMAINS.map((d) => (
        <div key={d} className="flex items-center gap-3 text-sm">
          <span className="w-20 shrink-0 muted">{DOMAIN_LABEL[d]}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-white/10"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${domains[d] ?? 0}%`, background: DOMAIN_COLOR[d] }} /></div>
          <span className="w-8 text-right font-medium tabular-nums">{domains[d] ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}
