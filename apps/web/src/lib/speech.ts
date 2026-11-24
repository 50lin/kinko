/** Guía por voz con la síntesis del sistema (funciona sin conexión y sin archivos de audio). */
let cancelled = false;
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
function voice() { const vs = speechSynthesis.getVoices(); return vs.find((v) => v.lang === 'es-ES' && /female|mujer|lucia|elvira|monica|paulina/i.test(v.name)) || vs.find((v) => v.lang.startsWith('es')); }
export async function speakScript(lines: string[], onLine?: (i: number) => void, pauseMs = 2600) {
  if (!canSpeak()) return;
  cancelled = false; speechSynthesis.cancel();
  for (let i = 0; i < lines.length && !cancelled; i++) {
    onLine?.(i);
    await new Promise<void>((res) => {
      const u = new SpeechSynthesisUtterance(lines[i]);
      const v = voice(); if (v) u.voice = v;
      u.lang = 'es-ES'; u.rate = 0.88; u.pitch = 1; u.onend = () => res(); u.onerror = () => res();
      speechSynthesis.speak(u);
    });
    if (!cancelled) await new Promise((r) => setTimeout(r, pauseMs));
  }
  onLine?.(-1);
}
export function stopSpeaking() { cancelled = true; if (canSpeak()) speechSynthesis.cancel(); }
