import { emit, on } from './realtime';

/** Videollamada P2P con negociación «perfecta» (RFC 8829). La señalización viaja por Socket.IO solo entre participantes de la cita. */
export class Call {
  pc: RTCPeerConnection; makingOffer = false; ignoreOffer = false; offs: (() => void)[] = [];
  constructor(private appointmentId: string, iceServers: RTCIceServer[], private polite: boolean, private onRemote: (s: MediaStream) => void, private onState: (s: string) => void) {
    this.pc = new RTCPeerConnection({ iceServers });
    this.pc.ontrack = (e) => this.onRemote(e.streams[0]);
    this.pc.onicecandidate = (e) => e.candidate && emit('call:signal', { appointmentId, data: { candidate: e.candidate } });
    this.pc.onconnectionstatechange = () => this.onState(this.pc.connectionState);
    this.pc.onnegotiationneeded = async () => {
      try { this.makingOffer = true; await this.pc.setLocalDescription(); emit('call:signal', { appointmentId, data: { description: this.pc.localDescription } }); }
      finally { this.makingOffer = false; }
    };
    this.offs.push(on('call:signal', async ({ data }) => {
      try {
        if (data.description) {
          const collision = data.description.type === 'offer' && (this.makingOffer || this.pc.signalingState !== 'stable');
          this.ignoreOffer = !this.polite && collision;
          if (this.ignoreOffer) return;
          await this.pc.setRemoteDescription(data.description);
          if (data.description.type === 'offer') { await this.pc.setLocalDescription(); emit('call:signal', { appointmentId, data: { description: this.pc.localDescription } }); }
        } else if (data.candidate) { try { await this.pc.addIceCandidate(data.candidate); } catch (e) { if (!this.ignoreOffer) throw e; } }
      } catch (e) { console.warn('webrtc', e); }
    }));
    this.offs.push(on('call:peer-left', () => this.onState('peer-left')));
    this.offs.push(on('call:peer-joined', () => this.onState('peer-joined')));
  }
  async start(stream: MediaStream) {
    await new Promise<void>((res) => emit('call:join', { appointmentId: this.appointmentId }, () => res()));
    stream.getTracks().forEach((t) => this.pc.addTrack(t, stream));
  }
  replaceVideo(track: MediaStreamTrack) { this.pc.getSenders().find((s) => s.track?.kind === 'video')?.replaceTrack(track); }
  end() { emit('call:leave', { appointmentId: this.appointmentId }); this.offs.forEach((f) => f()); this.pc.close(); }
}
