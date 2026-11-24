import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCirclePlus, Paperclip, Send, ShieldCheck, FileText, Lock } from 'lucide-react';
import { ROLE_LABEL } from '@kinko/core';
import { Avatar, Button, Card, Empty, Loading, Modal, cx } from '@/components/ui';
import { useApi, invalidate, toast } from '@/lib/query';
import { post, upload, assetUrl } from '@/lib/api';
import { on } from '@/lib/realtime';
import { useAuth } from '@/lib/auth';
import { ago, fmtTime, fmtDate } from '@/lib/format';
import { queryClient } from '@/lib/query';

export function Messages() {
  const { id } = useParams(); const nav = useNavigate();
  const convs = useApi<any[]>('/conversations', { refetchInterval: 20000 });
  const [picker, setPicker] = useState(false);
  useEffect(() => on('message:new', (m) => { invalidate('/conversations'); queryClient.invalidateQueries({ queryKey: [`/conversations/${m.conversationId}/messages`] }); }), []);
  const current = convs.data?.find((c) => c._id === id);
  return (
    <div className="-mt-2 grid h-[calc(100dvh-12.5rem-var(--demo,0px))] gap-4 lg:h-[calc(100dvh-8.5rem-var(--demo,0px))] lg:grid-cols-[320px_1fr]">
      <Card className={cx('flex min-h-0 flex-col p-0', id && 'hidden lg:flex')}>
        <div className="flex items-center justify-between border-b border-ink-100 p-4 dark:border-white/5"><h1 className="font-display text-2xl">Mensajes</h1><Button size="sm" variant="soft" icon={<MessageCirclePlus className="h-4 w-4" />} onClick={() => setPicker(true)}>Nuevo</Button></div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {convs.isLoading ? <Loading /> : !convs.data?.length ? <div className="p-6 text-center text-sm muted">Sin conversaciones todavía.</div> : convs.data.map((c) => { const o = c.others[0]; return (
            <Link key={c._id} to={`/mensajes/${c._id}`} className={cx('flex items-center gap-3 px-4 py-3 transition', c._id === id ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-ink-50 dark:hover:bg-white/5')}>
              <Avatar user={o} size={44} />
              <div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-2"><span className="truncate font-semibold">{o?.firstName} {o?.lastName}</span><span className="shrink-0 text-[11px] muted">{c.last ? ago(c.last.createdAt) : ''}</span></div><div className="flex items-center gap-2"><span className="truncate text-sm muted">{c.last?.body || ROLE_LABEL[o?.role as keyof typeof ROLE_LABEL]}</span>{c.unread > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{c.unread}</span>}</div></div>
            </Link>
          ); })}
        </div>
        <div className="flex items-center gap-2 border-t border-ink-100 p-3 text-[11px] muted dark:border-white/5"><Lock className="h-3.5 w-3.5" />Mensajes cifrados en reposo. No es un canal de urgencias.</div>
      </Card>
      {id ? (current ? <Thread conv={current} onBack={() => nav('/mensajes')} /> : convs.isLoading ? <Loading /> : <Empty title="Conversación no encontrada" />) : <Card className="hidden place-items-center lg:grid"><Empty icon={<ShieldCheck className="h-8 w-8" />} title="Comunicación segura" text="Habla con tu equipo de cuidado. Solo puedes escribir a personas con las que tienes una relación activa." action={<Button onClick={() => setPicker(true)}>Empezar conversación</Button>} /></Card>}
      {picker && <ContactPicker onClose={() => setPicker(false)} />}
    </div>
  );
}

function Thread({ conv, onBack }: { conv: any; onBack: () => void }) {
  const user = useAuth((s) => s.user)!;
  const { data, isLoading } = useApi<any[]>(`/conversations/${conv._id}/messages`);
  const [text, setText] = useState(''); const [sending, setSending] = useState(false);
  const [files, setFiles] = useState<any[]>([]);
  const end = useRef<HTMLDivElement>(null); const fileRef = useRef<HTMLInputElement>(null);
  const o = conv.others[0];
  useEffect(() => { const box = end.current?.parentElement; if (box) box.scrollTop = box.scrollHeight; if (conv.unread) post(`/conversations/${conv._id}/read`).then(() => invalidate('/conversations', '/me/dashboard')).catch(() => null); }, [data?.length, conv._id]);
  const send = async () => {
    if (!text.trim() && !files.length) return;
    setSending(true);
    try { await post(`/conversations/${conv._id}/messages`, { body: text.trim() || '📎 Archivo adjunto', attachments: files }); setText(''); setFiles([]); await queryClient.invalidateQueries({ queryKey: [`/conversations/${conv._id}/messages`] }); invalidate('/conversations'); }
    catch (e: any) { toast(e.message, 'error'); } finally { setSending(false); }
  };
  let lastDay = '';
  return (
    <Card className="flex min-h-0 flex-col p-0">
      <div className="flex items-center gap-3 border-b border-ink-100 p-3 dark:border-white/5"><button onClick={onBack} className="rounded-full p-2 hover:bg-ink-100 lg:hidden dark:hover:bg-white/5"><ArrowLeft className="h-5 w-5" /></button><Avatar user={o} size={40} /><div><div className="font-semibold">{o?.firstName} {o?.lastName}</div><div className="text-xs muted">{ROLE_LABEL[o?.role as keyof typeof ROLE_LABEL]}</div></div>{user.role === 'professional' && o?.role === 'patient' && <Button size="sm" variant="ghost" className="ml-auto" to={`/pro/pacientes/${o.id}`}>Ver ficha</Button>}</div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {isLoading ? <Loading /> : (data || []).map((m) => {
          const mine = m.senderId === user.id; const day = fmtDate(m.createdAt, { weekday: 'long', day: 'numeric', month: 'long' }); const sep = day !== lastDay; lastDay = day;
          return (<div key={m._id}>
            {sep && <div className="my-3 text-center text-[11px] font-medium uppercase tracking-wider muted">{day}</div>}
            <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[80%] rounded-3xl px-4 py-2.5 text-[15px]', mine ? 'rounded-br-lg bg-brand-600 text-white dark:bg-brand-500 dark:text-night-950' : 'rounded-bl-lg bg-ink-100 dark:bg-white/5')}>
                <div className="whitespace-pre-line">{m.body}</div>
                {m.attachments?.map((a: any) => a.mime?.startsWith('image/') ? <img key={a.url} src={assetUrl(a.url)} className="mt-2 max-h-60 rounded-2xl" alt={a.name} /> : <a key={a.url} href={assetUrl(a.url)} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 rounded-xl bg-black/10 px-3 py-2 text-sm underline"><FileText className="h-4 w-4" />{a.name}</a>)}
                <div className={cx('mt-1 text-right text-[10px]', mine ? 'text-white/70 dark:text-night-950/60' : 'muted')}>{fmtTime(m.createdAt)}{mine && (m.readBy?.length > 1 ? ' · leído' : '')}</div>
              </div>
            </div>
          </div>);
        })}
        <div ref={end} />
      </div>
      {files.length > 0 && <div className="flex gap-2 px-4 pb-2">{files.map((f) => <span key={f.url} className="rounded-full bg-ink-100 px-3 py-1 text-xs dark:bg-white/10">{f.name}</span>)}</div>}
      <div className="flex items-end gap-2 border-t border-ink-100 p-3 dark:border-white/5">
        <button onClick={() => fileRef.current?.click()} className="rounded-full p-2.5 hover:bg-ink-100 dark:hover:bg-white/5" title="Adjuntar"><Paperclip className="h-5 w-5" /></button>
        <input ref={fileRef} type="file" hidden accept="image/*,application/pdf" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const m = await upload(f); setFiles((x) => [...x, { url: m.url, name: m.name, mime: m.mime }]); } catch (er: any) { toast(er.message, 'error'); } e.target.value = ''; }} />
        <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Escribe un mensaje…" className="input max-h-32 min-h-[44px] flex-1 resize-none !rounded-3xl py-2.5" />
        <Button onClick={send} loading={sending} className="!h-11 !w-11 !p-0" aria-label="Enviar"><Send className="h-4 w-4" /></Button>
      </div>
    </Card>
  );
}

function ContactPicker({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useApi<any[]>('/contacts');
  const support = useApi<any[]>('/support/admins');
  const nav = useNavigate();
  const start = async (id: string) => { try { const c = await post('/conversations', { participantId: id }); invalidate('/conversations'); onClose(); nav(`/mensajes/${c._id}`); } catch (e: any) { toast(e.message, 'error'); } };
  const list = [...(data || []), ...(support.data || []).filter((a) => !(data || []).some((d) => d.id === a.id))];
  return (
    <Modal open onClose={onClose} title="Nueva conversación">
      {isLoading ? <Loading /> : !list.length ? <p className="text-sm muted">Aún no tienes contactos. Cuando tengas un profesional o un equipo, aparecerán aquí.</p> : (
        <div className="space-y-1">{list.map((u) => <button key={u.id} onClick={() => start(u.id)} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-ink-50 dark:hover:bg-white/5"><Avatar user={u} size={40} /><div><div className="font-medium">{u.firstName} {u.lastName}</div><div className="text-xs muted">{u.role === 'admin' ? 'Soporte Kinkō' : ROLE_LABEL[u.role as keyof typeof ROLE_LABEL]}</div></div></button>)}</div>
      )}
    </Modal>
  );
}
