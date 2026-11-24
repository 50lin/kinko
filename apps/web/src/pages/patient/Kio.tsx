import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, Send, Share2, Sparkles, Trash2, ShieldCheck, Info, Mic, Square } from 'lucide-react';
import { Sphere } from '@/components/Sphere';
import { Badge, Button, Card, Confirm, Empty, Loading, Modal, cx } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useApi, useMut, invalidate, toast } from '@/lib/query';
import { post, del } from '@/lib/api';
import { useCrisis } from '@/components/Crisis';
import { useAuth } from '@/lib/auth';
import { ago } from '@/lib/format';
import { queryClient } from '@/lib/query';

export function Kio() {
  const { id } = useParams();
  return id ? <Chat id={id} /> : <KioHome />;
}

function KioHome() {
  const modes = useApi<any>('/companion/modes');
  const threads = useApi<any[]>('/companion/threads');
  const usage = useApi<any>('/companion/usage');
  const dash = useApi<any>('/me/dashboard');
  const [sp] = useSearchParams(); const nav = useNavigate();
  const pre = sp.get('modo');
  const start = useMut((mode: string) => post('/companion/threads', { mode }), { invalidate: ['/companion/threads'], onSuccess: (t: any) => nav(`/app/kio/${t._id}`) });
  if (modes.isLoading) return <Loading />;
  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-6 text-center md:flex-row md:text-left">
        <Sphere className="h-48 w-48 shrink-0" domains={dash.data?.kinko?.domains} overall={dash.data?.kinko?.overall} face />
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-300">Kio · acompañante con IA</div>
          <h1 className="mt-1 font-display text-4xl">¿Qué necesitas ahora?</h1>
          <p className="mt-2 max-w-xl muted">Kio te ayuda a ordenar ideas, analizar situaciones y dar el siguiente paso. No es un psicólogo ni un médico: no diagnostica ni receta. Si hay riesgo, te conecta con ayuda real.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 md:justify-start">
            <Badge tone="brand"><ShieldCheck className="h-3.5 w-3.5" />Conversaciones cifradas y privadas</Badge>
            <Badge>{modes.data?.aiAvailable ? `IA: ${modes.data.model}` : 'Motor local sin conexión'}</Badge>
            {usage.data?.limit && <Badge tone="amber">{usage.data.today}/{usage.data.limit} mensajes hoy</Badge>}
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(modes.data?.modes || {}).map(([k, m]: any) => (
          <button key={k} disabled={start.isPending} onClick={() => start.mutate(k)} className={cx('group rounded-3xl p-5 text-left ring-1 transition hover:-translate-y-0.5', pre === k ? 'bg-brand-600 text-white ring-brand-600 dark:bg-brand-500 dark:text-night-950' : 'bg-white/70 ring-ink-200/70 hover:ring-brand-300 dark:bg-white/[.03] dark:ring-white/5')}>
            <Icon name={m.icon} className={cx('h-7 w-7', pre === k ? '' : 'text-brand-500')} />
            <div className="mt-3 font-semibold">{m.label}</div>
            <div className={cx('mt-1 text-sm', pre === k ? 'opacity-80' : 'muted')}>{m.hint}</div>
          </button>
        ))}
      </div>
      <div>
        <h2 className="mb-3 font-semibold">Conversaciones recientes</h2>
        {!threads.data?.length ? <p className="text-sm muted">Aún no has hablado con Kio.</p> : (
          <div className="grid gap-2 sm:grid-cols-2">{threads.data.map((t) => (
            <Link key={t._id} to={`/app/kio/${t._id}`} className="flex items-center gap-3 rounded-2xl bg-white/60 p-3 ring-1 ring-ink-200/60 transition hover:ring-brand-300 dark:bg-white/[.03] dark:ring-white/5">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10"><Icon name={modes.data?.modes?.[t.mode]?.icon} className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{t.title}</div><div className="text-xs muted">{modes.data?.modes?.[t.mode]?.label} · {ago(t.lastMessageAt)}</div></div>
              {t.sharedSummary && <Share2 className="h-4 w-4 text-violet-500" />}
            </Link>
          ))}</div>
        )}
      </div>
    </div>
  );
}

function Chat({ id }: { id: string }) {
  const { data, isLoading, error } = useApi<any>(`/companion/threads/${id}`);
  const modes = useApi<any>('/companion/modes');
  const dash = useApi<any>('/me/dashboard');
  const user = useAuth((s) => s.user);
  const crisis = useCrisis(); const nav = useNavigate();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [rec, setRec] = useState<any>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { const box = end.current?.parentElement; if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' }); }, [data?.messages?.length, typing, pending]);
  const send = async () => {
    const t = text.trim(); if (!t || typing) return;
    setText(''); setPending(t); setTyping(true);
    try {
      const r = await post(`/companion/threads/${id}/messages`, { content: t });
      await queryClient.invalidateQueries({ queryKey: [`/companion/threads/${id}`] });
      invalidate('/companion/threads', '/companion/usage');
      if (r.crisis) crisis.show('Lo que me cuentas es importante y no quiero que lo pases a solas. Habla ahora con alguien preparado para ayudarte.');
    } catch (e: any) { toast(e.message, e.status === 402 ? 'info' : 'error'); setText(t); }
    finally { setPending(null); setTyping(false); }
  };
  const summarize = useMut((share: boolean) => post(`/companion/threads/${id}/summary`, { share }), { invalidate: ['/companion/threads'], onSuccess: (r: any) => setSummary(r) });
  const remove = useMut(() => del(`/companion/threads/${id}`), { invalidate: ['/companion/threads'], onSuccess: () => nav('/app/kio') });
  const dictate = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return toast('Tu navegador no permite dictado por voz', 'error');
    if (rec) { rec.stop(); setRec(null); return; }
    const r = new SR(); r.lang = 'es-ES'; r.interimResults = false;
    r.onresult = (e: any) => setText((x) => `${x}${x ? ' ' : ''}${e.results[0][0].transcript}`); r.onend = () => setRec(null); r.start(); setRec(r);
  };
  if (isLoading) return <Loading />;
  if (error) return <Empty title="Conversación no encontrada" action={<Button to="/app/kio">Volver</Button>} />;
  const m = modes.data?.modes?.[data.thread.mode];
  const msgs = [...data.messages, ...(pending ? [{ _id: 'p', role: 'user', content: pending }] : [])];
  return (
    <div className="-mt-2 flex h-[calc(100dvh-12.5rem-var(--demo,0px))] flex-col lg:h-[calc(100dvh-8.5rem-var(--demo,0px))]">
      <div className="flex items-center gap-3 border-b border-ink-200/60 pb-3 dark:border-white/5">
        <button onClick={() => nav('/app/kio')} className="rounded-full p-2 hover:bg-ink-100 dark:hover:bg-white/5"><ArrowLeft className="h-5 w-5" /></button>
        <Sphere className="h-11 w-11" overall={dash.data?.kinko?.overall} domains={dash.data?.kinko?.domains} interactive={false} quality="low" calmOverride={typing ? 0.2 : undefined} />
        <div className="min-w-0 flex-1"><div className="truncate font-semibold">{data.thread.title}</div><div className="text-xs muted">Kio · {m?.label}</div></div>
        <Button size="sm" variant="soft" icon={<FileText className="h-4 w-4" />} onClick={() => summarize.mutate(false)} loading={summarize.isPending}>Resumen</Button>
        <Confirm danger title="¿Borrar esta conversación?" text="Se elimina para siempre de nuestros servidores." onConfirm={() => remove.mutate(undefined)}>{(open) => <button onClick={open} className="rounded-full p-2 hover:bg-ink-100 dark:hover:bg-white/5" title="Borrar"><Trash2 className="h-4 w-4" /></button>}</Confirm>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto py-5">
        <div className="mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-ink-50 px-3 py-2 text-center text-[11px] muted dark:bg-white/5"><Info className="h-3.5 w-3.5 shrink-0" />Kio es una IA y puede equivocarse. No sustituye a un profesional. En una emergencia, 112.</div>
        {msgs.map((x: any) => (
          <div key={x._id} className={cx('flex animate-fade', x.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[85%] whitespace-pre-line rounded-3xl px-4 py-3 text-[15px] leading-relaxed', x.role === 'user' ? 'rounded-br-lg bg-brand-600 text-white dark:bg-brand-500 dark:text-night-950' : x.source === 'safety' ? 'rounded-bl-lg bg-rose-50 text-rose-900 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-100 dark:ring-rose-500/20' : 'rounded-bl-lg bg-white ring-1 ring-ink-200/70 dark:bg-white/5 dark:ring-white/5')}>
              {x.content}
              {x.source === 'safety' && <Button size="sm" variant="danger" className="mt-3" onClick={() => crisis.show()}>Ver teléfonos de ayuda</Button>}
            </div>
          </div>
        ))}
        {typing && <div className="flex gap-1.5 px-2"><span className="h-2 w-2 animate-bounce rounded-full bg-brand-400" /><span className="h-2 w-2 animate-bounce rounded-full bg-brand-400 [animation-delay:.15s]" /><span className="h-2 w-2 animate-bounce rounded-full bg-brand-400 [animation-delay:.3s]" /></div>}
        <div ref={end} />
      </div>
      <div className="border-t border-ink-200/60 pt-3 dark:border-white/5">
        <div className="flex items-end gap-2 rounded-3xl bg-white p-2 ring-1 ring-ink-200 focus-within:ring-brand-400 dark:bg-white/5 dark:ring-white/10">
          <button onClick={dictate} className={cx('rounded-full p-2.5', rec ? 'bg-rose-600 text-white animate-pulse' : 'hover:bg-ink-100 dark:hover:bg-white/10')} title="Dictar">{rec ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
          <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={`Escribe a Kio, ${user?.profile?.firstName}…`} className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none" />
          <Button onClick={send} disabled={!text.trim() || typing} className="!h-10 !w-10 !p-0" aria-label="Enviar"><Send className="h-4 w-4" /></Button>
        </div>
      </div>
      <Modal open={!!summary} onClose={() => setSummary(null)} title="Resumen de la conversación" footer={!summary?.shared && <Button icon={<Share2 className="h-4 w-4" />} loading={summarize.isPending} onClick={() => summarize.mutate(true)}>Compartir con mi profesional</Button>}>
        <p className="whitespace-pre-line text-sm leading-relaxed">{summary?.summary}</p>
        <p className="mt-4 text-xs muted">{summary?.shared ? 'Compartido. Tu profesional verá este resumen, nunca la conversación completa.' : 'Solo se comparte el resumen (sin frases literales), y solo si das permiso de «resúmenes de Kio» en Mi equipo.'}</p>
      </Modal>
    </div>
  );
}
export { Sparkles };
