import { assetUrl } from '@/lib/api';
import { clsx } from 'clsx';
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Loader2, X, Info, AlertTriangle } from 'lucide-react';
import { useToasts } from '@/lib/query';

export const cx = clsx;

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'outline'; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode; to?: string; block?: boolean };
export function Button({ variant = 'primary', size = 'md', loading, icon, children, className, to, block, ...rest }: BtnProps) {
  const nav = useNavigate();
  const cls = cx(
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none select-none',
    { sm: 'h-8 px-3.5 text-xs', md: 'h-10 px-5 text-sm', lg: 'h-12 px-6 text-base' }[size],
    {
      primary: 'bg-brand-600 text-white shadow-[var(--shadow-glow)] hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400 dark:text-night-950',
      secondary: 'bg-ink-900 text-white hover:bg-ink-800 dark:bg-white dark:text-ink-900 dark:hover:bg-ink-100',
      ghost: 'text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-white/5',
      danger: 'bg-rose-600 text-white hover:bg-rose-700',
      soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-200 dark:hover:bg-brand-500/20',
      outline: 'border border-ink-200 bg-white/60 text-ink-800 hover:bg-white dark:border-white/10 dark:bg-transparent dark:text-ink-100 dark:hover:bg-white/5',
    }[variant], block && 'w-full', className,
  );
  return <button className={cls} disabled={loading || rest.disabled} {...rest} onClick={to ? () => nav(to) : rest.onClick}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}{children}</button>;
}

export function Card({ children, className, as: As = 'div', ...rest }: { children: ReactNode; className?: string; as?: any; [k: string]: any }) {
  return <As className={cx('card p-5', className)} {...rest}>{children}</As>;
}
export function CardTitle({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">{icon && <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">{icon}</div>}
        <div><h3 className="font-semibold text-ink-900 dark:text-white">{title}</h3>{subtitle && <p className="mt-0.5 text-sm muted">{subtitle}</p>}</div></div>
      {action}
    </div>
  );
}
export function PageHeader({ title, subtitle, actions, back, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: string | boolean; eyebrow?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fade">
      <div className="min-w-0">
        {back && <button onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))} className="mb-2 inline-flex items-center gap-1 text-sm muted hover:text-ink-900 dark:hover:text-white"><ArrowLeft className="h-4 w-4" /> Volver</button>}
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-300">{eyebrow}</div>}
        <h1 className="font-display text-3xl leading-tight text-ink-900 sm:text-4xl dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function Field({ label, hint, error, children }: { label?: ReactNode; hint?: ReactNode; error?: string; children: ReactNode }) {
  return <label className="block">{label && <span className="label">{label}</span>}{children}{error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-xs muted">{hint}</span> : null}</label>;
}
export const Input = ({ label, hint, error, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; error?: string }) => <Field label={label} hint={hint} error={error}><input className={cx('input', className)} {...p} /></Field>;
export const Textarea = ({ label, hint, className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode }) => <Field label={label} hint={hint}><textarea className={cx('input min-h-28 resize-y leading-relaxed', className)} {...p} /></Field>;
export const Select = ({ label, hint, className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode }) => <Field label={label} hint={hint}><select className={cx('input appearance-none pr-8', className)} {...p}>{children}</select></Field>;

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; hint?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 rounded-2xl py-2 text-left">
      <span><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-xs muted">{hint}</span>}</span>
      <span className={cx('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-brand-500' : 'bg-ink-200 dark:bg-white/10')}><span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-5.5' : 'left-0.5')} style={{ left: checked ? 22 : 2 }} /></span>
    </button>
  );
}
export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return <button type="button" onClick={onClick} className={cx('inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition', active ? 'border-brand-500 bg-brand-500 text-white dark:text-night-950' : 'border-ink-200 bg-white/70 text-ink-700 hover:border-brand-300 dark:border-white/10 dark:bg-white/5 dark:text-ink-200', className)}>{children}</button>;
}
const TONES = { brand: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-200 dark:ring-brand-500/20', amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20', rose: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/20', ink: 'bg-ink-100 text-ink-700 ring-ink-200 dark:bg-white/5 dark:text-ink-300 dark:ring-white/10', violet: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/20', sky: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/20' };
export type Tone = keyof typeof TONES;
export const Badge = ({ tone = 'ink', children, className }: { tone?: Tone; children: ReactNode; className?: string }) => <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>{children}</span>;

export function Avatar({ user, size = 40, className }: { user?: { firstName?: string; lastName?: string; avatarUrl?: string | null; avatarHue?: number } | null; size?: number; className?: string }) {
  const hue = user?.avatarHue ?? 165;
  const ini = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || '·';
  if (user?.avatarUrl) return <img src={assetUrl(user.avatarUrl)} alt="" className={cx('rounded-full object-cover', className)} style={{ width: size, height: size }} />;
  return <div className={cx('grid shrink-0 place-items-center rounded-full font-sans font-semibold text-white', className)} style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, hsl(${hue} 55% 62%), hsl(${(hue + 40) % 360} 50% 42%))` }}>{ini}</div>;
}
export function Tabs<T extends string>({ items, value, onChange, className }: { items: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1', className)}>
      {items.map((it) => (
        <button key={it.id} onClick={() => onChange(it.id)} className={cx('whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition', value === it.id ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/5')}>
          {it.label}{it.count != null && <span className="ml-1.5 opacity-60">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm animate-fade" onClick={onClose} />
      <div className={cx('relative max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] bg-white p-6 shadow-2xl animate-fade sm:rounded-[2rem] dark:bg-night-800', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="mb-4 flex items-start justify-between gap-4"><h2 className="font-display text-2xl">{title}</h2><button onClick={onClose} className="rounded-full p-2 hover:bg-ink-100 dark:hover:bg-white/5" aria-label="Cerrar"><X className="h-5 w-5" /></button></div>
        {children}
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>, document.body);
}
export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: ReactNode; text?: ReactNode; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-ink-200 px-6 py-12 text-center dark:border-white/10">{icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-ink-100 text-ink-500 dark:bg-white/5">{icon}</div>}<p className="font-semibold">{title}</p>{text && <p className="mt-1 max-w-sm text-sm muted">{text}</p>}{action && <div className="mt-4">{action}</div>}</div>;
}
export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx('h-5 w-5 animate-spin text-brand-500', className)} />;
export function Loading({ label = 'Cargando…' }: { label?: string }) { return <div className="flex items-center justify-center gap-3 py-16 muted"><Spinner /> {label}</div>; }
export function ErrorBox({ error }: { error: any }) { return <div className="flex items-start gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error?.message || 'Ha ocurrido un error'}</div>; }
export function Stat({ label, value, hint, icon, tone = 'brand', to }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'brand' | 'amber' | 'rose' | 'violet' | 'sky'; to?: string }) {
  const tc = { brand: 'text-brand-600 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-300', amber: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300', rose: 'text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-300', violet: 'text-violet-600 bg-violet-50 dark:bg-violet-500/10 dark:text-violet-300', sky: 'text-sky-600 bg-sky-50 dark:bg-sky-500/10 dark:text-sky-300' }[tone];
  const body = <div className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5">{icon && <div className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', tc)}>{icon}</div>}<div className="min-w-0"><div className="text-xs font-medium uppercase tracking-wider muted">{label}</div><div className="truncate text-2xl font-semibold tracking-tight">{value}</div>{hint && <div className="truncate text-xs muted">{hint}</div>}</div></div>;
  return to ? <Link to={to}>{body}</Link> : body;
}
export const Progress = ({ value, className, tone = 'bg-brand-500' }: { value: number; className?: string; tone?: string }) => <div className={cx('h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-white/10', className)}><div className={cx('h-full rounded-full transition-all duration-700', tone)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return <div className="inline-flex rounded-full bg-ink-100 p-1 dark:bg-white/5">{options.map((o) => <button key={o.id} onClick={() => onChange(o.id)} className={cx('rounded-full px-3.5 py-1.5 text-xs font-semibold transition', value === o.id ? 'bg-white text-ink-900 shadow dark:bg-night-800 dark:text-white' : 'text-ink-500')}>{o.label}</button>)}</div>;
}
export function Toaster() {
  const { items, remove } = useToasts();
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3">
      {items.map((t) => (
        <div key={t.id} onClick={() => remove(t.id)} className={cx('pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm shadow-xl animate-fade', t.kind === 'error' ? 'bg-rose-600 text-white' : t.kind === 'info' ? 'bg-ink-900 text-white' : 'bg-brand-600 text-white')}>
          {t.kind === 'error' ? <AlertTriangle className="h-4 w-4" /> : t.kind === 'info' ? <Info className="h-4 w-4" /> : <Check className="h-4 w-4" />}{t.text}
        </div>
      ))}
    </div>, document.body);
}
export function Confirm({ children, onConfirm, title = '¿Seguro?', text, danger }: { children: (open: () => void) => ReactNode; onConfirm: () => void; title?: string; text?: string; danger?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>{children(() => setOpen(true))}<Modal open={open} onClose={() => setOpen(false)} title={title} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant={danger ? 'danger' : 'primary'} onClick={() => { setOpen(false); onConfirm(); }}>Confirmar</Button></>}>{text && <p className="muted">{text}</p>}</Modal></>;
}
export function Slider({ value, onChange, min = 1, max = 10, step = 1, labels }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; labels?: [string, string] }) {
  return <div><input type="range" className="kinko-range w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />{labels && <div className="mt-1 flex justify-between text-xs muted"><span>{labels[0]}</span><span>{labels[1]}</span></div>}</div>;
}
