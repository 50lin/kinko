import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Mic, MicOff, MonitorUp, PhoneOff, Video, VideoOff, NotebookPen, Lock, Wifi } from 'lucide-react';
import { Avatar, Button, Card, ErrorBox, Loading, Textarea, cx } from '@/components/ui';
import { Sphere } from '@/components/Sphere';
import { post, patch, mode } from '@/lib/api';
import { Call } from '@/lib/webrtc';
import { useAuth } from '@/lib/auth';
import { toast } from '@/lib/query';

export function VideoCall() {
  const { id } = useParams(); const nav = useNavigate();
  const user = useAuth((s) => s.user)!;
  const [info, setInfo] = useState<any>(null); const [err, setErr] = useState<any>(null);
  const [state, setState] = useState('conectando'); const [mic, setMic] = useState(true); const [cam, setCam] = useState(true); const [sharing, setSharing] = useState(false);
  const [notes, setNotes] = useState(''); const [panel, setPanel] = useState(false); const [secs, setSecs] = useState(0);
  const local = useRef<HTMLVideoElement>(null); const remote = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null); const call = useRef<Call | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await post(`/appointments/${id}/join`); if (!alive) return; setInfo(j);
        let s: MediaStream | null = null;
        try { s = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: { echoCancellation: true, noiseSuppression: true } }); } catch { toast('No hemos podido acceder a cámara o micrófono', 'error'); }
        stream.current = s; if (local.current && s) local.current.srcObject = s;
        if (mode.demo) { setState('demo'); return; }
        const c = new Call(id!, j.iceServers, j.role === 'guest', (rs) => { if (remote.current) remote.current.srcObject = rs; }, (st) => setState(st));
        call.current = c; if (s) await c.start(s); else await c.start(new MediaStream());
        setState('esperando');
      } catch (e) { setErr(e); }
    })();
    const t = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => { alive = false; clearInterval(t); call.current?.end(); stream.current?.getTracks().forEach((x) => x.stop()); };
  }, [id]);
  const toggle = (kind: 'audio' | 'video') => { stream.current?.getTracks().filter((t) => t.kind === kind).forEach((t) => (t.enabled = !t.enabled)); kind === 'audio' ? setMic(!mic) : setCam(!cam); };
  const share = async () => {
    if (sharing) { const v = stream.current?.getVideoTracks()[0]; if (v) call.current?.replaceVideo(v); if (local.current) local.current.srcObject = stream.current; setSharing(false); return; }
    try { const d = await (navigator.mediaDevices as any).getDisplayMedia({ video: true }); const tr = d.getVideoTracks()[0]; call.current?.replaceVideo(tr); if (local.current) local.current.srcObject = d; setSharing(true); tr.onended = () => share(); } catch { /* cancelado */ }
  };
  const hang = async () => {
    call.current?.end(); stream.current?.getTracks().forEach((t) => t.stop());
    if (info?.role === 'host') {
      try {
        if (notes.trim()) await post(`/pro/patients/${info.patientId}/records`, { type: 'note', title: `Sesión por vídeo ${new Date().toLocaleDateString('es-ES')}`, soap: { s: notes, o: '', a: '', p: '' }, appointmentId: id });
        await patch(`/appointments/${id}`, { status: 'completed' });
        toast('Sesión cerrada y nota guardada en la historia');
      } catch (e: any) { toast(e.message, 'error'); }
      nav(info?.patientId ? `/pro/pacientes/${info.patientId}` : '/pro/agenda');
    } else nav('/app/citas');
  };
  if (err) return <div className="mx-auto max-w-lg p-8"><ErrorBox error={err} /><Button className="mt-4" onClick={() => nav(-1)}>Volver</Button></div>;
  if (!info) return <div className="grid min-h-screen place-items-center bg-night-950"><Loading label="Preparando la sala segura…" /></div>;
  const mm = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <div className="fixed inset-0 z-50 flex bg-night-950 text-white">
      <div className="relative flex-1">
        <video ref={remote} autoPlay playsInline className={cx('h-full w-full object-cover', !['connected'].includes(state) && 'hidden')} />
        {state !== 'connected' && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-4 text-center">
              {state === 'demo' ? <Sphere className="h-56 w-56" overall={74} face interactive={false} /> : <Avatar user={info.peer} size={120} />}
              <div className="font-display text-2xl">{info.peer?.firstName} {info.peer?.lastName}</div>
              <div className="max-w-sm text-sm text-white/60">{state === 'demo' ? 'Modo demostración: la otra persona se conectaría aquí. Prueba los controles, la cámara y las notas de sesión.' : state === 'peer-left' ? 'La otra persona ha salido de la sala.' : 'Esperando a que se conecte…'}</div>
            </div>
          </div>
        )}
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs backdrop-blur"><Lock className="h-3.5 w-3.5" />Cifrado extremo a extremo (WebRTC) · {mm}{state === 'connected' && <Wifi className="h-3.5 w-3.5 text-emerald-400" />}</div>
        <video ref={local} autoPlay muted playsInline className={cx('absolute bottom-28 right-4 aspect-video w-40 rounded-2xl border border-white/20 object-cover shadow-2xl sm:w-56', !sharing && '-scale-x-100', !cam && 'opacity-0')} />
        <div className="absolute inset-x-0 bottom-6 flex justify-center gap-3">
          <Ctl on={mic} onClick={() => toggle('audio')} icon={mic ? <Mic /> : <MicOff />} label="Micro" />
          <Ctl on={cam} onClick={() => toggle('video')} icon={cam ? <Video /> : <VideoOff />} label="Cámara" />
          <Ctl on={!sharing} onClick={share} icon={<MonitorUp />} label="Pantalla" />
          {info.role === 'host' && <Ctl on={!panel} onClick={() => setPanel(!panel)} icon={<NotebookPen />} label="Notas" />}
          <button onClick={hang} className="grid h-14 w-14 place-items-center rounded-full bg-rose-600 shadow-lg hover:bg-rose-700" title="Colgar"><PhoneOff className="h-6 w-6" /></button>
        </div>
      </div>
      {panel && info.role === 'host' && (
        <Card className="m-3 hidden w-80 flex-col !bg-white/95 text-ink-900 md:flex">
          <div className="font-semibold">Notas de sesión</div>
          <p className="mt-1 text-xs muted">Se guardarán cifradas en la historia clínica al colgar.</p>
          <Textarea rows={16} className="mt-3" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Subjetivo: lo que cuenta el paciente…" />
        </Card>
      )}
    </div>
  );
}
function Ctl({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: any; label: string }) {
  return <button onClick={onClick} title={label} className={cx('grid h-14 w-14 place-items-center rounded-full backdrop-blur transition [&>svg]:h-6 [&>svg]:w-6', on ? 'bg-white/15 hover:bg-white/25' : 'bg-white text-night-950')}>{icon}</button>;
}
