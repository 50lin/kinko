import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BadgeCheck, Building2, CalendarDays, Globe2, MapPin, Search, Sparkles, Star, Video, Users2, Phone, Languages } from 'lucide-react';
import { PROVINCES, SPECIALTIES } from '@kinko/core';
import { Avatar, Badge, Button, Card, Chip, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Select, Textarea, cx } from '@/components/ui';
import { useApi, useMut, toast } from '@/lib/query';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, fmtLongDate, fmtDateTime } from '@/lib/format';

export function Directory() {
  const [f, setF] = useState({ q: '', specialty: '', province: '', modality: '', maxPrice: '' });
  const [tab, setTab] = useState<'pros' | 'clinics'>('pros');
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as any).toString();
  const pros = useApi<any[]>(`/directory/professionals${qs ? `?${qs}` : ''}`);
  const clinics = useApi<any[]>(tab === 'clinics' ? `/directory/clinics${f.province ? `?province=${f.province}` : ''}` : null);
  const user = useAuth((s) => s.user);
  return (
    <div>
      <PageHeader eyebrow="Directorio" title="Encuentra a tu profesional" subtitle="Psicólogos, psiquiatras y centros con colegiación verificada. Las afinidades se calculan con tus resultados, solo para ti." />
      <div className="mb-4 flex gap-2"><Chip active={tab === 'pros'} onClick={() => setTab('pros')}><Users2 className="h-4 w-4" />Profesionales</Chip><Chip active={tab === 'clinics'} onClick={() => setTab('clinics')}><Building2 className="h-4 w-4" />Centros</Chip></div>
      <Card className="mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" /><input className="input pl-10" placeholder="Nombre, especialidad, ciudad…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <select className="input" value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })}><option value="">Todas las especialidades</option>{SPECIALTIES.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input" value={f.province} onChange={(e) => setF({ ...f, province: e.target.value })}><option value="">Toda España</option>{PROVINCES.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input" value={f.modality} onChange={(e) => setF({ ...f, modality: e.target.value })}><option value="">Online y presencial</option><option value="online">Online</option><option value="presencial">Presencial</option></select>
      </Card>
      {tab === 'pros' ? (pros.isLoading ? <Loading /> : pros.error ? <ErrorBox error={pros.error} /> : !pros.data?.length ? <Empty icon={<Search className="h-8 w-8" />} title="Sin resultados" text="Prueba a quitar algún filtro." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {pros.data.map((p) => (
            <Card key={p.id} className="flex flex-col transition hover:-translate-y-0.5">
              <div className="flex gap-4">
                <Avatar user={p} size={64} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Link to={`/directorio/${p.id}`} className="font-semibold hover:underline">{p.firstName} {p.lastName}</Link>{p.verified && <BadgeCheck className="h-4 w-4 text-brand-500" />}{p.featured && <Badge tone="violet">Destacado</Badge>}</div>
                  <div className="text-sm muted">{p.type}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs muted"><span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{p.city}</span>{p.modalities?.includes('online') && <span className="flex items-center gap-1"><Video className="h-3.5 w-3.5" />Online</span>}{p.rating && <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{p.rating} ({p.reviewsCount})</span>}</div>
                </div>
                <div className="text-right"><div className="font-display text-xl">{money(p.price)}</div><div className="text-xs muted">{p.sessionMinutes} min</div></div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm muted">{p.bio}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">{p.specialties?.slice(0, 4).map((s: string) => <Badge key={s}>{s}</Badge>)}</div>
              {p.match && <div className="mt-3 rounded-2xl bg-brand-50 p-3 text-xs text-brand-800 dark:bg-brand-500/10 dark:text-brand-200"><div className="flex items-center gap-1.5 font-semibold"><Sparkles className="h-3.5 w-3.5" />Afinidad {p.match.score}%</div><div className="mt-0.5">{p.match.reasons.join(' · ')}</div></div>}
              <div className="mt-4 flex gap-2 pt-1"><Button size="sm" to={`/directorio/${p.id}`} icon={<CalendarDays className="h-4 w-4" />}>{p.acceptingNew ? 'Ver huecos' : 'Ver perfil'}</Button>{p.clinic && <Button size="sm" variant="ghost" to={`/centros/${p.clinic.slug}`}>{p.clinic.name}</Button>}</div>
            </Card>
          ))}
        </div>
      )) : clinics.isLoading ? <Loading /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {(clinics.data || []).map((c) => (
            <Card key={c.id} as={Link} to={`/centros/${c.slug}`} className="flex gap-4 transition hover:-translate-y-0.5">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-white" style={{ background: `hsl(${c.logoHue} 45% 45%)` }}><Building2 className="h-7 w-7" /></div>
              <div><div className="font-semibold">{c.name}</div><div className="text-sm muted">{c.city} · {c.province}</div><p className="mt-2 line-clamp-2 text-sm muted">{c.description}</p><div className="mt-2 text-xs muted">{c.professionals} profesionales</div></div>
            </Card>
          ))}
        </div>
      )}
      {!user && <p className="mt-8 text-center text-sm muted">¿Eres profesional? <Link to="/registro?perfil=professional" className="link">Únete al directorio</Link></p>}
    </div>
  );
}

export function BookingModal({ pro, slot, onClose }: { pro: any; slot: any; onClose: () => void }) {
  const nav = useNavigate(); const user = useAuth((s) => s.user);
  const [f, setF] = useState({ modality: pro.modalities?.includes('online') ? 'video' : 'presencial', reason: '', firstVisit: true });
  const book = useMut((b: any) => post('/appointments', b), { invalidate: ['/appointments', '/me/dashboard', '/directory'], onSuccess: (r: any) => { toast(r.appointment.status === 'confirmed' ? 'Cita confirmada' : 'Solicitud enviada: te avisaremos cuando la confirme'); onClose(); nav('/app/citas'); } });
  if (!slot) return null;
  return (
    <Modal open onClose={onClose} title="Reservar sesión" footer={user?.role === 'patient' ? <Button block loading={book.isPending} onClick={() => book.mutate({ professionalId: pro.id, start: slot.start, ...f })}>Confirmar y pagar {money(pro.price)}</Button> : <Button block to="/login">Entra como paciente para reservar</Button>}>
      <div className="flex items-center gap-3"><Avatar user={pro} size={48} /><div><div className="font-semibold">{pro.firstName} {pro.lastName}</div><div className="text-sm muted">{fmtLongDate(slot.start)} · {slot.label}</div></div></div>
      <div className="mt-5 space-y-4">
        <div className="flex gap-2">{pro.modalities?.includes('online') && <Chip active={f.modality === 'video'} onClick={() => setF({ ...f, modality: 'video' })}><Video className="h-4 w-4" />Videollamada</Chip>}{pro.modalities?.includes('presencial') && <Chip active={f.modality === 'presencial'} onClick={() => setF({ ...f, modality: 'presencial' })}><MapPin className="h-4 w-4" />Presencial</Chip>}</div>
        <Textarea label="Motivo de consulta (opcional)" rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Lo que quieras adelantar. Solo lo verá tu profesional." />
        <p className="text-xs muted">Al reservar, tu profesional podrá ver tus check-ins, tests y plan (puedes cambiarlo en «Mi equipo»). Cancelación gratuita hasta 24 h antes. Pago seguro con Stripe{' '}(simulado en la demo).</p>
      </div>
    </Modal>
  );
}

export function ProfessionalProfile() {
  const { id } = useParams();
  const { data: p, isLoading, error } = useApi<any>(`/directory/professionals/${id}`);
  const [slot, setSlot] = useState<any>(null);
  const days = useMemo(() => { const m: Record<string, any[]> = {}; (p?.slots || []).forEach((s: any) => (m[s.day] ||= []).push(s)); return Object.entries(m).slice(0, 10); }, [p]);
  const [day, setDay] = useState(0);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex flex-col gap-5 sm:flex-row">
            <Avatar user={p} size={96} />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2"><h1 className="font-display text-3xl">{p.firstName} {p.lastName}</h1>{p.verified && <Badge tone="brand"><BadgeCheck className="h-3.5 w-3.5" />Colegiación verificada</Badge>}</div>
              <div className="mt-1 muted">{p.type}</div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm muted"><span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{p.city}, {p.province}</span><span className="flex items-center gap-1.5"><Languages className="h-4 w-4" />{p.languages?.join(', ')}</span>{p.rating && <span className="flex items-center gap-1.5"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{p.rating} · {p.reviewsCount} valoraciones</span>}</div>
              {p.clinic && <Link to={`/centros/${p.clinic.slug}`} className="mt-2 inline-flex items-center gap-1.5 text-sm link"><Building2 className="h-4 w-4" />{p.clinic.name}</Link>}
            </div>
          </div>
          {p.match && <div className="mt-5 rounded-2xl bg-brand-50 p-4 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-200"><b>Afinidad {p.match.score}%</b> · {p.match.reasons.join(' · ')}</div>}
          <p className="mt-5 whitespace-pre-line leading-relaxed">{p.bio}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div><div className="label mb-2">Especialidades</div><div className="flex flex-wrap gap-1.5">{p.specialties?.map((s: string) => <Badge key={s}>{s}</Badge>)}</div></div>
            <div><div className="label mb-2">Enfoques</div><div className="flex flex-wrap gap-1.5">{p.approaches?.map((s: string) => <Badge key={s} tone="violet">{s}</Badge>)}</div></div>
          </div>
        </Card>
        <Card>
          <h2 className="font-semibold">Valoraciones</h2>
          {!p.reviews?.length ? <p className="mt-2 text-sm muted">Aún no hay valoraciones.</p> : <div className="mt-4 space-y-4">{p.reviews.map((r: any, i: number) => <div key={i} className="border-b border-ink-100 pb-4 last:border-0 dark:border-white/5"><div className="flex items-center gap-1">{Array.from({ length: 5 }, (_, k) => <Star key={k} className={cx('h-4 w-4', k < r.rating ? 'fill-amber-400 text-amber-400' : 'text-ink-200')} />)}<span className="ml-2 text-xs muted">{r.author}</span></div>{r.comment && <p className="mt-1.5 text-sm">{r.comment}</p>}</div>)}</div>}
        </Card>
      </div>
      <div className="lg:sticky lg:top-24 lg:self-start">
        <Card>
          <div className="flex items-baseline justify-between"><div className="font-display text-3xl">{money(p.price)}</div><div className="text-sm muted">{p.sessionMinutes} min</div></div>
          {!p.acceptingNew && <Badge tone="amber" className="mt-2">Lista de espera</Badge>}
          <div className="mt-5 label">Próximos huecos</div>
          {!days.length ? <p className="mt-2 text-sm muted">Sin huecos en las próximas semanas.</p> : <>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">{days.map(([d], i) => <button key={d} onClick={() => setDay(i)} className={cx('shrink-0 rounded-2xl px-3 py-2 text-center text-xs transition', i === day ? 'bg-brand-600 text-white dark:bg-brand-500 dark:text-night-950' : 'bg-ink-100 dark:bg-white/5')}><div className="font-semibold capitalize">{new Date(`${d}T12:00`).toLocaleDateString('es-ES', { weekday: 'short' })}</div><div>{new Date(`${d}T12:00`).getDate()}</div></button>)}</div>
            <div className="mt-3 grid grid-cols-3 gap-2">{days[day]?.[1].map((s: any) => <button key={s.start} onClick={() => setSlot(s)} className="rounded-xl border border-ink-200 py-2 text-sm font-medium transition hover:border-brand-400 hover:bg-brand-50 dark:border-white/10 dark:hover:bg-brand-500/10">{s.label.split(' ').pop()}</button>)}</div>
          </>}
          <div className="mt-5 flex flex-wrap gap-2 text-xs muted">{p.modalities?.map((m: string) => <span key={m} className="flex items-center gap-1">{m === 'online' ? <Globe2 className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}{m}</span>)}</div>
        </Card>
      </div>
      {slot && <BookingModal pro={p} slot={slot} onClose={() => setSlot(null)} />}
    </div>
  );
}

export function ClinicPage() {
  const { slug } = useParams();
  const { data: c, isLoading, error } = useApi<any>(`/directory/clinics/${slug}`);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div>
      <Card className="overflow-hidden p-0">
        <div className="h-32" style={{ background: `linear-gradient(120deg, hsl(${c.logoHue} 50% 70%), hsl(${(c.logoHue + 40) % 360} 45% 40%))` }} />
        <div className="p-6">
          <div className="-mt-16 grid h-20 w-20 place-items-center rounded-3xl border-4 border-white text-white dark:border-night-900" style={{ background: `hsl(${c.logoHue} 45% 42%)` }}><Building2 className="h-9 w-9" /></div>
          <h1 className="mt-4 font-display text-3xl">{c.name}</h1>
          <div className="mt-1 flex flex-wrap gap-4 text-sm muted"><span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{c.address || c.city}, {c.province}</span>{c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1.5"><Phone className="h-4 w-4" />{c.phone}</a>}</div>
          <p className="mt-4 max-w-3xl leading-relaxed">{c.description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">{c.specialties?.map((s: string) => <Badge key={s}>{s}</Badge>)}</div>
        </div>
      </Card>
      <h2 className="mb-4 mt-8 font-display text-2xl">Equipo</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{c.professionals.map((p: any) => <Card key={p.id} as={Link} to={`/directorio/${p.id}`} className="flex items-center gap-3 transition hover:-translate-y-0.5"><Avatar user={p} size={52} /><div className="min-w-0"><div className="font-semibold">{p.firstName} {p.lastName}</div><div className="truncate text-xs muted">{p.type}</div><div className="mt-1 text-sm">{money(p.price)} · {p.sessionMinutes} min</div></div></Card>)}</div>
    </div>
  );
}
export { fmtDateTime };
