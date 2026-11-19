import { auth } from './firebase.ts';
import { useAppStore } from '../store/useAppStore.ts';
import { MusicBattleDoc, RoomRole, RoomTrackDoc } from '../types/index.ts';

class RealtimeSyncClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private activeRoomJoinPayload: {
    roomId: string;
    roomName: string;
    user: {
      uid: string;
      username: string;
      displayName: string;
      avatarUrl: string;
      role: RoomRole;
      isMuted: boolean;
    };
    initialPlaylist?: RoomTrackDoc[];
  } | null = null;

  public async connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const user = auth.currentUser;
    if (!user) return;

    const token = await user.getIdToken();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;

    const socket = new WebSocket(wsUrl);
    this.ws = socket;

    socket.onopen = () => {
      useAppStore.getState().setWsConnected(true);
      this.sendClockPing();
      this.startPingLoop();

      const pub = useAppStore.getState().publicProfile;
      if (pub) {
        this.send({
          type: 'presence:hello',
          username: pub.username,
          displayName: pub.displayName,
          avatarUrl: pub.avatarUrl,
          roomId: pub.currentRoomId || '',
          roomName: pub.currentRoomName || '',
          trackTitle: pub.currentTrackTitle || '',
        });
      }

      if (this.activeRoomJoinPayload) {
        this.send({ type: 'room:join', ...this.activeRoomJoinPayload });
      }
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch {
        // ignore malformed JSON
      }
    };

    socket.onclose = () => {
      useAppStore.getState().setWsConnected(false);
      this.stopPingLoop();
      if (this.ws === socket) {
        this.ws = null;
        if (auth.currentUser && !this.reconnectTimer) {
          this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 2200);
        }
      }
    };

    socket.onerror = () => {
      // onclose handles reconnect
    };
  }

  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPingLoop();
    this.activeRoomJoinPayload = null;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    useAppStore.getState().setWsConnected(false);
  }

  private startPingLoop() {
    this.stopPingLoop();
    this.pingTimer = window.setInterval(() => this.sendClockPing(), 15000);
  }

  private stopPingLoop() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private sendClockPing() {
    this.send({ type: 'clock:ping', clientSentMs: Date.now() });
  }

  public send(payload: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public joinRoom(payload: NonNullable<RealtimeSyncClient['activeRoomJoinPayload']>) {
    this.activeRoomJoinPayload = payload;
    this.send({ type: 'room:join', ...payload });
  }

  public leaveRoom() {
    this.activeRoomJoinPayload = null;
    this.send({ type: 'room:leave' });
  }

  private handleMessage(msg: Record<string, unknown>) {
    const store = useAppStore.getState();

    if (msg.type === 'clock:pong') {
      const sent = Number(msg.clientSentMs || 0);
      const serverTime = Number(msg.serverTimeMs || 0);
      const rtt = Date.now() - sent;
      const offset = serverTime - (sent + rtt / 2);
      store.setClockOffsetMs(offset);
      return;
    }

    if (msg.type === 'presence:global' && Array.isArray(msg.users)) {
      store.setGlobalOnlineUsers(msg.users);
      return;
    }

    if (msg.type === 'room:state' || msg.type === 'room:playback_updated') {
      const serverNow = Number(msg.serverNowMs || Date.now());
      const updatedAt = Number(msg.updatedAtServerMs || serverNow);
      const basePos = Number(msg.positionMs || 0);
      const isPlaying = Boolean(msg.isPlaying);
      // Adjust updatedAtServerMs into local client time using clock offset or serverNow diff
      const driftFromServerNow = Math.max(0, serverNow - updatedAt);
      const adjustedPosMs = isPlaying ? basePos + driftFromServerNow : basePos;

      store.setPlayback({
        currentTrack: (msg.currentTrack as typeof store.playback.currentTrack) ?? null,
        playlist: Array.isArray(msg.playlist) ? (msg.playlist as RoomTrackDoc[]) : store.playback.playlist,
        isPlaying,
        positionMs: adjustedPosMs,
        updatedAtServerMs: Date.now(),
        shuffle: Boolean(msg.shuffle),
        repeat: (msg.repeat as 'off' | 'one' | 'all') || 'all',
        partyMode: Boolean(msg.partyMode),
      });

      if (msg.type === 'room:state') {
        if (Array.isArray(msg.participants)) {
          store.setRoomParticipants(msg.participants);
        }
        if ('battle' in msg) {
          store.setLiveBattle((msg.battle as MusicBattleDoc) || null);
        }
      }
      return;
    }

    if (msg.type === 'room:presence' && Array.isArray(msg.participants)) {
      store.setRoomParticipants(msg.participants);
      return;
    }

    if (msg.type === 'reaction:burst') {
      const id = String(msg.id || `${Date.now()}`);
      store.pushReaction({
        id,
        emoji: String(msg.emoji || '🔥'),
        senderName: String(msg.senderName || ''),
        x: Number(msg.x || 50),
      });
      window.setTimeout(() => {
        useAppStore.getState().removeReaction(id);
      }, 2400);
      return;
    }

    if (msg.type === 'battle:updated') {
      store.setLiveBattle((msg.battle as MusicBattleDoc) || null);
      return;
    }

    if (msg.type === 'room:admin_transferred') {
      const newName = String(msg.newAdminName || '');
      store.addToast(
        store.language === 'pt'
          ? `Administração transferida automaticamente para ${newName}.`
          : `Room admin automatically transferred to ${newName}.`,
        'info'
      );
      return;
    }

    if (msg.type === 'room:kicked') {
      store.addToast(
        store.language === 'pt'
          ? 'Foste removido desta sala pelo administrador.'
          : 'You were removed from this room by the admin.',
        'error'
      );
      this.activeRoomJoinPayload = null;
      store.leaveActiveRoomState();
      return;
    }

    if (msg.type === 'room:closed') {
      store.addToast(
        store.language === 'pt'
          ? 'Esta sala foi encerrada pelo administrador.'
          : 'This room was closed by the admin.',
        'info'
      );
      this.activeRoomJoinPayload = null;
      store.leaveActiveRoomState();
    }
  }
}

export const realtimeClient = new RealtimeSyncClient();
