import { useRef, useState } from 'react';
import { Camera, Lock, NotebookPen, Share2, Trash2, X, Mic, Square } from 'lucide-react';
import { EMOTIONS } from '@kinko/core';
import { Badge, Button, Card, Chip, Confirm, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Slider, Textarea, Toggle, cx } from '@/components/ui';
import { useApi, useMut, toast } from '@/lib/query';
import { post, patch, del, upload, assetUrl } from '@/lib/api';
import { useCrisis } from '@/components/Crisis';
import { fmtDateTime } from '@/lib/format';

const PROMPTS = ['¿Qué ha sido lo más difícil de hoy y cómo lo has gestionado?', '¿Qué te ha hecho sonreír esta semana?', 'Si tu mejor amigo/a viviera tu día, ¿qué le dirías?', '¿Qué necesitas ahora mismo que no te estás dando?', 'Escribe tres cosas que salieron mejor de lo que esperabas.', '¿Qué pensamiento se repite hoy? ¿Es un hecho o una interpretación?'];

export function Journal() {
  const { data, isLoading, error } = useApi<any[]>('/journal?limit=100');
  const [edit, setEdit] = useState<any>(null);
  const remove = useMut((id: string) => del(`/journal/${id}`), { invalidate: ['/journal'], success: 'Entrada eliminada' });
  return (
    <div>
      <PageHeader eyebrow="Diario" title="Tu espacio para escribir" subtitle="Privado por defecto y cifrado. Solo tu profesional verá las entradas que tú marques como compartidas. Tu familia nunca." actions={<Button icon={<NotebookPen className="h-4 w-4" />} onClick={() => setEdit({})}>Nueva entrada</Button>} />
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : !data?.length ? <Empty icon={<NotebookPen className="h-8 w-8" />} title="Tu diario está vacío" text={PROMPTS[0]} action={<Button onClick={() => setEdit({})}>Escribir</Button>} /> : (
        <div className="columns-1 gap-4 md:columns-2 [&>*]:mb-4">
          {data.map((j) => (
            <Card key={j._id} className="break-inside-avoid">
              <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{j.title || 'Sin título'}</div><div className="text-xs muted">{fmtDateTime(j.createdAt)}</div></div><div className="flex items-center gap-1">{j.shared ? <Badge tone="violet"><Share2 className="h-3 w-3" />Compartida</Badge> : <Badge><Lock className="h-3 w-3" />Privada</Badge>}</div></div>
              <p className="mt-3 line-clamp-6 whitespace-pre-line text-sm leading-relaxed">{j.content}</p>
              {j.photos?.length > 0 && <div className="mt-3 flex gap-2">{j.photos.map((p: string) => <img key={p} src={assetUrl(p)} className="h-20 w-20 rounded-xl object-cover" alt="" />)}</div>}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">{j.mood && <Badge tone="brand">Ánimo {j.mood}/10</Badge>}{j.sentiment && <Badge tone={j.sentiment.label === 'positivo' ? 'brand' : j.sentiment.label === 'negativo' ? 'violet' : 'ink'}>Tono {j.sentiment.label}</Badge>}{j.emotions?.map((e: string) => <Badge key={e}>{e}</Badge>)}</div>
              <div className="mt-3 flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEdit(j)}>Editar</Button><Confirm danger title="¿Eliminar esta entrada?" text="No se puede deshacer." onConfirm={() => remove.mutate(j._id)}>{(open) => <Button size="sm" variant="ghost" onClick={open} icon={<Trash2 className="h-3.5 w-3.5" />}>Eliminar</Button>}</Confirm></div>
            </Card>
          ))}
        </div>
      )}
      {edit && <Editor entry={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function Editor({ entry, onClose }: { entry: any; onClose: () => void }) {
  const crisis = useCrisis();
  const [f, setF] = useState<any>({ title: entry.title || '', content: entry.content || '', mood: entry.mood || 6, emotions: entry.emotions || [], shared: !!entry.shared, photos: entry.photos || [] });
  const [prompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [rec, setRec] = useState<any>(null);
  const save = useMut((b: any) => (entry._id ? patch(`/journal/${entry._id}`, b) : post('/journal', b)), { invalidate: ['/journal', '/me/dashboard'], success: 'Guardado', onSuccess: (r: any) => { if (r?.crisis) crisis.show('Lo que has escrito nos importa. Si estás pasando un momento muy difícil, no tienes que hacerlo a solas.'); onClose(); } });
  const dictate = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return toast('Tu navegador no permite dictado por voz', 'error');
    if (rec) { rec.stop(); setRec(null); return; }
    const r = new SR(); r.lang = 'es-ES'; r.continuous = true; r.interimResults = false;
    r.onresult = (e: any) => { const t = Array.from(e.results).slice(e.resultIndex).map((x: any) => x[0].transcript).join(' '); setF((x: any) => ({ ...x, content: `${x.content}${x.content ? ' ' : ''}${t}` })); };
    r.onend = () => setRec(null); r.start(); setRec(r);
  };
  return (
    <Modal open wide onClose={onClose} title={entry._id ? 'Editar entrada' : 'Nueva entrada'} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={!f.content.trim()} onClick={() => save.mutate(f)}>Guardar</Button></>}>
      <div className="space-y-4">
        <Input label="Título (opcional)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <div className="relative"><Textarea label="¿Qué te ronda?" rows={8} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} placeholder={prompt} /><button onClick={dictate} className={cx('absolute bottom-3 right-3 rounded-full p-2', rec ? 'bg-rose-600 text-white animate-pulse' : 'bg-ink-100 dark:bg-white/10')} title="Dictar">{rec ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button></div>
        <div><div className="label mb-2">Ánimo {f.mood}/10</div><Slider value={f.mood} onChange={(v) => setF({ ...f, mood: v })} /></div>
        <div className="flex flex-wrap gap-1.5">{EMOTIONS.map((e) => <Chip key={e} active={f.emotions.includes(e)} onClick={() => setF({ ...f, emotions: f.emotions.includes(e) ? f.emotions.filter((x: string) => x !== e) : [...f.emotions, e].slice(0, 8) })}>{e}</Chip>)}</div>
        <div>
          <div className="flex flex-wrap gap-2">{f.photos.map((p: string) => <div key={p} className="relative"><img src={assetUrl(p)} className="h-20 w-20 rounded-xl object-cover" alt="" /><button onClick={() => setF({ ...f, photos: f.photos.filter((x: string) => x !== p) })} className="absolute -right-1.5 -top-1.5 rounded-full bg-ink-900 p-0.5 text-white"><X className="h-3 w-3" /></button></div>)}
            {f.photos.length < 6 && <button onClick={() => fileRef.current?.click()} className="grid h-20 w-20 place-items-center rounded-xl border-2 border-dashed border-ink-200 text-ink-400 hover:border-brand-400 dark:border-white/10">{uploading ? '…' : <Camera className="h-5 w-5" />}</button>}</div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setUploading(true); try { const m = await upload(file); setF((x: any) => ({ ...x, photos: [...x.photos, m.url] })); } catch (er: any) { toast(er.message, 'error'); } finally { setUploading(false); e.target.value = ''; } }} />
        </div>
        <div className="rounded-2xl bg-ink-50 px-4 py-2 dark:bg-white/5"><Toggle checked={f.shared} onChange={(v) => setF({ ...f, shared: v })} label="Compartir con mi profesional" hint="Solo si le has dado permiso de «diario compartido». Tu familia nunca lo verá." /></div>
      </div>
    </Modal>
  );
}
