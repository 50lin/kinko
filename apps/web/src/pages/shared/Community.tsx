import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Flag, Heart, HandHeart, MessageSquare, Pin, Plus, Search, Sparkles, ThumbsUp, Users, ShieldCheck } from 'lucide-react';
import { Avatar, Badge, Button, Card, Chip, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Select, Textarea, Toggle, cx } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useApi, useMut, toast } from '@/lib/query';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCrisis } from '@/components/Crisis';
import { ago } from '@/lib/format';

const REACTIONS: [string, string, any][] = [['apoyo', 'Te apoyo', HandHeart], ['meidentifico', 'Me identifico', Users], ['gracias', 'Gracias', Heart], ['fuerza', 'Fuerza', Sparkles]];

export function Community() {
  const [sp, setSp] = useSearchParams(); const cat = sp.get('categoria') || '';
  const [q, setQ] = useState(''); const [compose, setCompose] = useState(false);
  const user = useAuth((s) => s.user);
  const cats = useApi<any[]>('/forum/categories');
  const posts = useApi<any[]>(`/forum/posts?limit=50${cat ? `&category=${cat}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  const visibleCats = (cats.data || []).filter((c) => c.audience !== 'parent' || user?.role === 'parent' || user?.role === 'admin');
  return (
    <div>
      <PageHeader eyebrow="Comunidad" title="No estás solo/a" subtitle="Un espacio moderado, anónimo por defecto, para compartir lo que funciona. Los mensajes con riesgo se revisan antes de publicarse." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCompose(true)}>Publicar</Button>} />
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none"><Chip active={!cat} onClick={() => setSp({})}>Todo</Chip>{visibleCats.map((c) => <Chip key={c._id} active={cat === c.slug} onClick={() => setSp({ categoria: c.slug })}><Icon name={c.icon} className="h-3.5 w-3.5" />{c.name}<span className="text-[10px] opacity-60">{c.posts}</span></Chip>)}</div>
      <div className="relative mb-6"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" /><input className="input pl-11" placeholder="Buscar en la comunidad…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {posts.isLoading ? <Loading /> : posts.error ? <ErrorBox error={posts.error} /> : !posts.data?.length ? <Empty icon={<MessageSquare className="h-8 w-8" />} title="Aún no hay publicaciones aquí" action={<Button onClick={() => setCompose(true)}>Sé la primera persona</Button>} /> : (
        <div className="space-y-3">{posts.data.map((p) => (
          <Card key={p._id} as={Link} to={`/comunidad/${p._id}`} className="block transition hover:-translate-y-0.5">
            <div className="flex items-center gap-2 text-xs muted">{p.pinned && <Pin className="h-3.5 w-3.5 text-brand-500" />}{p.category && <Badge><Icon name={p.category.icon} className="h-3 w-3" />{p.category.name}</Badge>}<span>{p.author ? `${p.author.firstName}` : 'Anónimo'} · {ago(p.createdAt)}</span></div>
            <h3 className="mt-2 font-semibold">{p.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm muted">{p.body}</p>
            <div className="mt-3 flex items-center gap-4 text-xs muted"><span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{p.commentsCount}</span>{Object.entries(p.reactionCounts || {}).map(([k, n]) => { const r = REACTIONS.find((x) => x[0] === k); if (!r) return null; const I = r[2]; return <span key={k} className="flex items-center gap-1"><I className="h-3.5 w-3.5" />{String(n)}</span>; })}</div>
          </Card>
        ))}</div>
      )}
      {compose && <Compose cats={visibleCats} initial={cats.data?.find((c) => c.slug === cat)?._id} onClose={() => setCompose(false)} />}
    </div>
  );
}

function Compose({ cats, initial, onClose }: { cats: any[]; initial?: string; onClose: () => void }) {
  const crisis = useCrisis(); const nav = useNavigate();
  const [f, setF] = useState({ categoryId: initial || cats[0]?._id, title: '', body: '', anonymous: true });
  const send = useMut((b: any) => post('/forum/posts', b), { invalidate: ['/forum'], onSuccess: (r: any) => { onClose(); if (r.held) { crisis.show(r.message); toast('Tu publicación está en revisión', 'info'); } else { toast('Publicado · +5 puntos'); nav(`/comunidad/${r.post._id}`); } } });
  return (
    <Modal open wide onClose={onClose} title="Nueva publicación" footer={<Button loading={send.isPending} disabled={f.title.length < 4 || f.body.length < 10} onClick={() => send.mutate(f)}>Publicar</Button>}>
      <div className="space-y-4">
        <Select label="Espacio" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>{cats.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select>
        <Input label="Título" maxLength={140} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Textarea label="¿Qué quieres compartir?" rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <Toggle checked={f.anonymous} onChange={(v) => setF({ ...f, anonymous: v })} label="Publicar de forma anónima" hint="Nadie verá tu nombre. Tu profesional tampoco." />
        <p className="flex gap-2 text-xs muted"><ShieldCheck className="h-4 w-4 shrink-0" />Normas: respeto, nada de consejos médicos ni de medicación, sin datos personales. Si alguien está en peligro, 112.</p>
      </div>
    </Modal>
  );
}

export function Post() {
  const { id } = useParams();
  const { data: p, isLoading, error, refetch } = useApi<any>(`/forum/posts/${id}`);
  const [c, setC] = useState({ body: '', anonymous: true });
  const crisis = useCrisis();
  const react = useMut((type: string | null) => post(`/forum/posts/${id}/react`, { type }), { onSuccess: () => refetch() });
  const comment = useMut(() => post(`/forum/posts/${id}/comments`, c), { invalidate: ['/forum/posts'], onSuccess: (r: any) => { setC({ ...c, body: '' }); if (r.held) crisis.show(r.message); else refetch(); } });
  const report = useMut((reason: string) => post(`/forum/posts/${id}/report`, { reason }), { success: 'Gracias. Lo revisaremos.' });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back="/comunidad" eyebrow={p.category?.name} title={p.title} subtitle={`${p.author ? `${p.author.firstName} ${p.author.lastName}` : 'Anónimo'} · ${ago(p.createdAt)}`} />
      <Card><p className="whitespace-pre-line leading-relaxed">{p.body}</p>
        <div className="mt-5 flex flex-wrap gap-2">{REACTIONS.map(([k, l, I]) => <button key={k} onClick={() => react.mutate(p.myReaction === k ? null : k)} className={cx('flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition', p.myReaction === k ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200' : 'border-ink-200 hover:border-brand-300 dark:border-white/10')}><I className="h-4 w-4" />{l}{p.reactionCounts?.[k] ? <span className="text-xs opacity-70">{p.reactionCounts[k]}</span> : null}</button>)}
          <button onClick={() => report.mutate('Contenido inapropiado')} className="ml-auto flex items-center gap-1 text-xs muted hover:text-rose-600"><Flag className="h-3.5 w-3.5" />Reportar</button></div>
      </Card>
      <h2 className="mb-3 mt-8 font-semibold">{p.comments.length} respuestas</h2>
      <div className="space-y-3">{p.comments.map((x: any) => (
        <Card key={x._id} className={cx(x.author?.verifiedPro && 'ring-1 ring-brand-300')}>
          <div className="flex items-center gap-2 text-sm">{x.author ? <><Avatar user={x.author} size={28} /><span className="font-medium">{x.author.firstName} {x.author.lastName}</span>{x.author.verifiedPro && <Badge tone="brand"><BadgeCheck className="h-3 w-3" />Profesional verificado</Badge>}</> : <span className="font-medium">Anónimo</span>}<span className="text-xs muted">· {ago(x.createdAt)}</span></div>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{x.body}</p>
        </Card>
      ))}</div>
      <Card className="mt-6"><Textarea label="Responder con cuidado" rows={3} value={c.body} onChange={(e) => setC({ ...c, body: e.target.value })} /><div className="mt-3 flex items-center justify-between"><Toggle checked={c.anonymous} onChange={(v) => setC({ ...c, anonymous: v })} label="Anónimo" /><Button loading={comment.isPending} disabled={c.body.trim().length < 2} onClick={() => comment.mutate(undefined)} icon={<ThumbsUp className="h-4 w-4" />}>Responder</Button></div></Card>
    </div>
  );
}
