import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { loadAuthUser, type Db, type Providers } from '@kinko/core';
import { config } from './config';

/** Tiempo real: notificaciones, chat y señalización WebRTC para videoconsultas (solo participantes de la cita). */
export function createRealtime() {
  let io: Server | null = null;
  const realtime: Providers['realtime'] = {
    toUser: (userId, event, data) => io?.to(`user:${userId}`).emit(event, data),
    toRoom: (room, event, data) => io?.to(room).emit(event, data),
  };
  function attach(server: HttpServer, db: Db, providers: Providers) {
    io = new Server(server, { path: '/socket.io', cors: { origin: config.corsOrigins, credentials: true }, maxHttpBufferSize: 1e6 });
    io.use(async (socket, next) => {
      const user = await loadAuthUser(db, providers, String(socket.handshake.auth?.token || ''));
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user; next();
    });
    io.on('connection', (socket) => {
      const u = socket.data.user;
      socket.join(`user:${u.id}`);
      const canJoin = async (appointmentId: string) => {
        const a = await db.col('appointments').findById(String(appointmentId));
        return a && [a.patientId, a.professionalId].includes(u.id) && a.status === 'confirmed' ? a : null;
      };
      socket.on('call:join', async ({ appointmentId }, ack) => {
        const a = await canJoin(appointmentId);
        if (!a) return ack?.({ ok: false });
        const room = `call:${a._id}`;
        const peers = (await io!.in(room).fetchSockets()).length;
        socket.join(room);
        socket.to(room).emit('call:peer-joined', { userId: u.id, name: u.firstName });
        ack?.({ ok: true, peers, initiator: peers > 0 });
      });
      socket.on('call:signal', async ({ appointmentId, data }) => {
        if (!socket.rooms.has(`call:${appointmentId}`)) return;
        socket.to(`call:${appointmentId}`).emit('call:signal', { from: u.id, data });
      });
      socket.on('call:leave', ({ appointmentId }) => { socket.to(`call:${appointmentId}`).emit('call:peer-left', { userId: u.id }); socket.leave(`call:${appointmentId}`); });
      socket.on('typing', async ({ conversationId }) => {
        const c = await db.col('conversations').findOne({ _id: String(conversationId), participants: u.id });
        if (c) for (const p of c.participants) if (p !== u.id) io!.to(`user:${p}`).emit('typing', { conversationId, userId: u.id });
      });
      socket.on('disconnecting', () => { for (const r of socket.rooms) if (r.startsWith('call:')) socket.to(r).emit('call:peer-left', { userId: u.id }); });
    });
  }
  return { realtime, attach };
}
