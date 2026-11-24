import { create } from 'zustand';
import { useState } from 'react';
import { Phone, HeartHandshake, Wind, ShieldCheck } from 'lucide-react';
import { CRISIS_RESOURCES } from '@kinko/core';
import { Modal, Button } from './ui';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toast } from '@/lib/query';
import { useNavigate } from 'react-router-dom';

export const useCrisis = create<{ open: boolean; message?: string; show(message?: string): void; hide(): void }>((set) => ({ open: false, show: (message) => set({ open: true, message }), hide: () => set({ open: false, message: undefined }) }));

/** Protocolo de ayuda inmediata: siempre a un toque. Teléfonos reales de España. */
export function CrisisSheet() {
  const { open, hide, message } = useCrisis();
  const user = useAuth((s) => s.user);
  const [sent, setSent] = useState(false);
  const nav = useNavigate();
  const lines = CRISIS_RESOURCES.filter((r) => r.phone !== '900202010' || user?.isMinor || user?.role === 'parent');
  return (
    <Modal open={open} onClose={() => { hide(); setSent(false); }} title="No estás solo/a">
      <p className="text-sm muted">{message || 'Si estás pasando un momento muy difícil, hay personas preparadas para ayudarte ahora mismo, de forma gratuita y confidencial.'}</p>
      <div className="mt-5 space-y-2">
        {lines.map((r) => (
          <a key={r.phone} href={`tel:${r.phone}`} className="flex items-center gap-4 rounded-2xl bg-rose-50 p-4 transition hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-rose-600 text-white"><Phone className="h-5 w-5" /></div>
            <div className="flex-1"><div className="font-semibold">{r.name}</div><div className="text-xs muted">{r.desc}</div></div>
            <div className="font-display text-xl text-rose-700 dark:text-rose-300">{r.phone === '900202010' ? '900 20 20 10' : r.phone}</div>
          </a>
        ))}
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <Button variant="soft" icon={<Wind className="h-4 w-4" />} onClick={() => { hide(); nav('/app/respirar?patron=calma'); }}>Respirar conmigo</Button>
        {user?.role === 'patient' && (
          <Button variant={sent ? 'outline' : 'secondary'} icon={sent ? <ShieldCheck className="h-4 w-4" /> : <HeartHandshake className="h-4 w-4" />} disabled={sent}
            onClick={async () => { try { await post('/me/sos', { notify: true }); setSent(true); toast('Hemos avisado a tu profesional'); } catch (e: any) { toast(e.message, 'error'); } }}>
            {sent ? 'Profesional avisado' : 'Avisar a mi profesional'}
          </Button>
        )}
      </div>
      <p className="mt-5 text-xs muted">Kinkō no es un servicio de emergencias. Si tu vida o la de otra persona corre peligro, llama al 112.</p>
    </Modal>
  );
}
