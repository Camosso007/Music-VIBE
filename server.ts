import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { Request, Response, NextFunction } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// Initialize Firebase Admin ONLY with projectId for ID token verification (works on Starter Tier with no IAM)
const adminApp = getApps().length
  ? getApp()
  : initializeApp({ projectId: firebaseConfig.projectId });
const adminAuth = getAuth(adminApp);

// Ensure upload directories exist
const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');
const AUDIO_DIR = path.join(UPLOAD_ROOT, 'audio');
const IMAGE_DIR = path.join(UPLOAD_ROOT, 'images');
fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(IMAGE_DIR, { recursive: true });

// --- RATE LIMITING ---
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'unknown'}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= maxRequests) {
      return res.status(429).json({ error: 'Muitos pedidos. Tenta novamente dentro de instantes.' });
    }
    bucket.count += 1;
    return next();
  };
}

// --- AUTH MIDDLEWARE ---
interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação em falta.' });
  }
  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}

// --- FILE UPLOADS (AUDIO & IMAGES) ---
const ALLOWED_AUDIO_EXTS = new Set(['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.opus', '.flac', '.webm', '.mp4']);
const ALLOWED_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/x-mpeg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/aac',
  'audio/aacp',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/ogg',
  'audio/opus',
  'audio/flac',
  'audio/x-flac',
  'audio/webm',
  'video/mp4',
  'application/ogg',
]);

const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const audioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AUDIO_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_AUDIO_EXTS.has(ext) ? ext : '.mp3';
    cb(null, `${Date.now()}-${crypto.randomUUID()}${safeExt}`);
  },
});

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMAGE_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_IMAGE_EXTS.has(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${crypto.randomUUID()}${safeExt}`);
  },
});

const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (
      ALLOWED_AUDIO_EXTS.has(ext) ||
      ALLOWED_AUDIO_MIMES.has(file.mimetype) ||
      file.mimetype.startsWith('audio/')
    ) {
      return cb(null, true);
    }
    return cb(new Error('Formato de áudio não suportado. Usa MP3, WAV, AAC, M4A ou OGG.'));
  },
});

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (
      ALLOWED_IMAGE_EXTS.has(ext) ||
      ALLOWED_IMAGE_MIMES.has(file.mimetype) ||
      file.mimetype.startsWith('image/')
    ) {
      return cb(null, true);
    }
    return cb(new Error('Formato de imagem inválido. Usa PNG, JPG, WEBP ou GIF.'));
  },
});

// --- REAL-TIME AUTHORITATIVE ROOM SYNC ENGINE ---
interface SyncTrack {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string;
  sourceType: 'upload' | 'youtube' | 'synth';
  sourceRef: string;
  durationMs: number;
  addedByUid: string;
  addedByName: string;
}

interface RoomParticipant {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  role: 'admin' | 'dj' | 'listener';
  isMuted: boolean;
  isTyping: boolean;
  joinedAtMs: number;
  sockets: Set<WebSocket>;
}

interface LiveBattle {
  id: string;
  theme: string;
  trackATitle: string;
  trackAArtist: string;
  trackASourceType: 'upload' | 'youtube' | 'synth';
  trackASourceRef: string;
  trackBTitle: string;
  trackBArtist: string;
  trackBSourceType: 'upload' | 'youtube' | 'synth';
  trackBSourceRef: string;
  votesA: string[];
  votesB: string[];
  status: 'active' | 'finished';
  winner: 'A' | 'B' | 'tie' | '';
}

interface RoomSyncState {
  roomId: string;
  playlist: SyncTrack[];
  currentTrack: SyncTrack | null;
  isPlaying: boolean;
  positionMs: number;
  updatedAtServerMs: number;
  shuffle: boolean;
  repeat: 'off' | 'one' | 'all';
  partyMode: boolean;
  participants: Map<string, RoomParticipant>;
  battle: LiveBattle | null;
  autoAdvanceTimer?: NodeJS.Timeout;
  reactionCooldowns: Map<string, number>;
}

const roomStates = new Map<string, RoomSyncState>();
const globalPresence = new Map<
  string,
  {
    uid: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    roomId: string;
    roomName: string;
    trackTitle: string;
    sockets: Set<WebSocket>;
  }
>();

function getOrCreateRoomState(roomId: string): RoomSyncState {
  let state = roomStates.get(roomId);
  if (!state) {
    state = {
      roomId,
      playlist: [],
      currentTrack: null,
      isPlaying: false,
      positionMs: 0,
      updatedAtServerMs: Date.now(),
      shuffle: false,
      repeat: 'all',
      partyMode: false,
      participants: new Map(),
      battle: null,
      reactionCooldowns: new Map(),
    };
    roomStates.set(roomId, state);
  }
  return state;
}

function getEffectivePositionMs(state: RoomSyncState): number {
  if (!state.currentTrack) return 0;
  if (!state.isPlaying) return Math.min(state.positionMs, state.currentTrack.durationMs);
  const elapsed = Date.now() - state.updatedAtServerMs;
  return Math.min(state.positionMs + Math.max(0, elapsed), state.currentTrack.durationMs);
}

function serializeParticipants(state: RoomSyncState) {
  return Array.from(state.participants.values()).map((p) => ({
    uid: p.uid,
    username: p.username,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    role: p.role,
    isMuted: p.isMuted,
    isTyping: p.isTyping,
  }));
}

function serializePlayback(state: RoomSyncState) {
  return {
    roomId: state.roomId,
    currentTrack: state.currentTrack,
    playlist: state.playlist,
    isPlaying: state.isPlaying,
    positionMs: state.positionMs,
    updatedAtServerMs: state.updatedAtServerMs,
    serverNowMs: Date.now(),
    shuffle: state.shuffle,
    repeat: state.repeat,
    partyMode: state.partyMode,
  };
}

function broadcastToRoom(state: RoomSyncState, payload: unknown) {
  const raw = JSON.stringify(payload);
  for (const participant of state.participants.values()) {
    for (const sock of participant.sockets) {
      if (sock.readyState === WebSocket.OPEN) {
        sock.send(raw);
      }
    }
  }
}

function broadcastGlobalPresence() {
  const list = Array.from(globalPresence.values()).map((u) => ({
    uid: u.uid,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    roomId: u.roomId,
    roomName: u.roomName,
    trackTitle: u.trackTitle,
  }));
  const raw = JSON.stringify({ type: 'presence:global', users: list });
  for (const user of globalPresence.values()) {
    for (const sock of user.sockets) {
      if (sock.readyState === WebSocket.OPEN) {
        sock.send(raw);
      }
    }
  }
}

function scheduleAutoAdvance(state: RoomSyncState) {
  if (state.autoAdvanceTimer) {
    clearTimeout(state.autoAdvanceTimer);
    state.autoAdvanceTimer = undefined;
  }
  if (!state.isPlaying || !state.currentTrack) return;

  const currentPos = getEffectivePositionMs(state);
  const remainingMs = Math.max(300, state.currentTrack.durationMs - currentPos);

  state.autoAdvanceTimer = setTimeout(() => {
    advanceTrack(state, 1, true);
  }, remainingMs + 150);
}

function advanceTrack(state: RoomSyncState, direction: 1 | -1, isAuto = false) {
  if (state.playlist.length === 0) {
    state.isPlaying = false;
    state.positionMs = 0;
    state.updatedAtServerMs = Date.now();
    broadcastToRoom(state, { type: 'room:playback_updated', ...serializePlayback(state) });
    return;
  }

  if (isAuto && state.repeat === 'one' && state.currentTrack) {
    state.positionMs = 0;
    state.isPlaying = true;
    state.updatedAtServerMs = Date.now();
    scheduleAutoAdvance(state);
    broadcastToRoom(state, { type: 'room:playback_updated', ...serializePlayback(state) });
    return;
  }

  const currentIdx = state.currentTrack
    ? state.playlist.findIndex((t) => t.id === state.currentTrack?.id)
    : -1;

  let nextIdx = 0;
  if (state.shuffle && state.playlist.length > 1) {
    do {
      nextIdx = Math.floor(Math.random() * state.playlist.length);
    } while (nextIdx === currentIdx);
  } else {
    nextIdx = currentIdx + direction;
    if (nextIdx >= state.playlist.length) {
      if (state.repeat === 'off' && isAuto) {
        state.isPlaying = false;
        state.positionMs = state.currentTrack?.durationMs || 0;
        state.updatedAtServerMs = Date.now();
        broadcastToRoom(state, { type: 'room:playback_updated', ...serializePlayback(state) });
        return;
      }
      nextIdx = 0;
    } else if (nextIdx < 0) {
      nextIdx = state.playlist.length - 1;
    }
  }

  state.currentTrack = state.playlist[nextIdx];
  state.positionMs = 0;
  state.isPlaying = true;
  state.updatedAtServerMs = Date.now();
  scheduleAutoAdvance(state);
  broadcastToRoom(state, {
    type: 'room:playback_updated',
    ...serializePlayback(state),
    trackChanged: true,
  });
}

function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  // Extract a URL from pasted share text if present
  const urlMatch = trimmed.match(/((?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\/\S+)/i);
  const candidate = urlMatch ? urlMatch[1] : trimmed;
  const normalized = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;

  try {
    const parsed = new URL(normalized);
    if (!parsed.hostname.includes('youtube.com') && !parsed.hostname.includes('youtu.be')) {
      return null;
    }
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0]?.slice(0, 11) || '';
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (parsed.searchParams.get('v')) {
      const id = parsed.searchParams.get('v')!.slice(0, 11);
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    const pathMatch = parsed.pathname.match(/\/(?:shorts|live|embed|v)\/([a-zA-Z0-9_-]{11})/);
    if (pathMatch) return pathMatch[1];
  } catch {
    return null;
  }
  return null;
}

function parseDurationTextToMs(raw?: string): number {
  if (!raw) return 210000;
  const parts = raw
    .trim()
    .split(':')
    .map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n) || n < 0)) return 210000;
  let seconds = 0;
  if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 1) {
    seconds = parts[0];
  }
  if (!seconds) return 210000;
  return Math.min(7200000, Math.max(5000, seconds * 1000));
}

async function fetchYoutubeDurationMs(videoId: string): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: controller.signal,
    });
    if (!res.ok) return 210000;
    const html = await res.text();
    const lenMatch = html.match(/"lengthSeconds":"(\d+)"/);
    if (lenMatch) {
      const sec = Number(lenMatch[1]);
      if (Number.isFinite(sec) && sec > 0) {
        return Math.min(7200000, Math.max(5000, sec * 1000));
      }
    }
  } catch {
    // fallback below
  } finally {
    clearTimeout(timer);
  }
  return 210000;
}

async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, serverTimeMs: Date.now() });
  });

  // Audio upload endpoint
  app.post('/api/upload/audio', rateLimit(20, 60_000), requireAuth, (req: AuthRequest, res) => {
    uploadAudio.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Erro no upload de áudio.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum ficheiro de áudio enviado.' });
      }
      return res.json({
        url: `/api/media/audio/${req.file.filename}`,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
      });
    });
  });

  // Image upload endpoint
  app.post('/api/upload/image', rateLimit(30, 60_000), requireAuth, (req: AuthRequest, res) => {
    uploadImage.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Erro no upload de imagem.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
      }
      return res.json({
        url: `/api/media/images/${req.file.filename}`,
        filename: req.file.filename,
        size: req.file.size,
      });
    });
  });

  // Byte-range media streaming endpoint (critical for accurate millisecond audio seeking!)
  app.get('/api/media/:folder/:filename', (req, res) => {
    const folder = req.params.folder;
    const filename = path.basename(req.params.filename);
    if (folder !== 'audio' && folder !== 'images') {
      return res.status(404).end();
    }
    const baseDir = folder === 'audio' ? AUDIO_DIR : IMAGE_DIR;
    const fullPath = path.join(baseDir, filename);
    if (!fullPath.startsWith(baseDir) || !fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Ficheiro não encontrado.' });
    }

    const stat = fs.statSync(fullPath);
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.aac': 'audio/aac',
      '.m4a': 'audio/mp4',
      '.mp4': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
      '.flac': 'audio/flac',
      '.webm': 'audio/webm',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    const range = req.headers.range;

    if (range && folder === 'audio') {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      if (Number.isNaN(start) || start >= stat.size || end >= stat.size) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`);
        return res.end();
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      });
      return fs.createReadStream(fullPath, { start, end }).pipe(res);
    }

    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
    });
    return fs.createReadStream(fullPath).pipe(res);
  });

  // Policy-compliant YouTube metadata lookup via official oEmbed
  app.get('/api/youtube/info', rateLimit(40, 60_000), requireAuth, async (req, res) => {
    const rawUrl = String(req.query.url || '');
    const videoId = extractYoutubeId(rawUrl);
    if (!videoId) {
      return res.status(400).json({ error: 'Link ou ID do YouTube inválido.' });
    }
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const [response, durationMs] = await Promise.all([
        fetch(oembedUrl),
        fetchYoutubeDurationMs(videoId),
      ]);
      if (!response.ok) {
        return res.json({
          videoId,
          title: `YouTube Track (${videoId})`,
          author: 'YouTube',
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          durationMs,
        });
      }
      const data = (await response.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
      return res.json({
        videoId,
        title: (data.title || `YouTube (${videoId})`).slice(0, 140),
        author: (data.author_name || 'YouTube').slice(0, 100),
        thumbnailUrl: (data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`).slice(0, 500),
        durationMs,
      });
    } catch {
      return res.json({
        videoId,
        title: `YouTube Track (${videoId})`,
        author: 'YouTube',
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        durationMs: 210000,
      });
    }
  });

  // Policy-compliant YouTube search metadata endpoint (no audio extraction)
  app.get('/api/youtube/search', rateLimit(30, 60_000), requireAuth, async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Escreve o nome da música ou artista.' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
      const response = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8' },
        signal: controller.signal,
      });
      if (!response.ok) {
        return res.status(502).json({ error: 'Não foi possível pesquisar no YouTube agora.' });
      }
      const html = await response.text();
      const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/);
      if (!match) {
        return res.json({ results: [] });
      }
      const data = JSON.parse(match[1]) as {
        contents?: {
          twoColumnSearchResultsRenderer?: {
            primaryContents?: {
              sectionListRenderer?: {
                contents?: Array<{
                  itemSectionRenderer?: {
                    contents?: Array<{
                      videoRenderer?: {
                        videoId?: string;
                        title?: { runs?: Array<{ text?: string }> };
                        ownerText?: { runs?: Array<{ text?: string }> };
                        lengthText?: { simpleText?: string };
                      };
                    }>;
                  };
                }>;
              };
            };
          };
        };
      };

      const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
      const items = sections.flatMap((s) => s.itemSectionRenderer?.contents || []);
      const results = items
        .map((c) => c.videoRenderer)
        .filter((v): v is NonNullable<typeof v> => Boolean(v && v.videoId && v.title?.runs?.[0]?.text))
        .slice(0, 8)
        .map((v) => ({
          videoId: v.videoId!,
          title: (v.title?.runs?.[0]?.text || `YouTube (${v.videoId})`).slice(0, 140),
          author: (v.ownerText?.runs?.[0]?.text || 'YouTube').slice(0, 100),
          thumbnailUrl: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          durationMs: parseDurationTextToMs(v.lengthText?.simpleText),
        }));

      return res.json({ results });
    } catch {
      return res.status(502).json({ error: 'Erro ao pesquisar vídeos no YouTube.' });
    } finally {
      clearTimeout(timer);
    }
  });

  const server = http.createServer(app);

  // --- WEBSOCKET REAL-TIME SERVER ---
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws: WebSocket, req) => {
    const reqUrl = new URL(req.url || '/ws', `http://${req.headers.host || 'localhost'}`);
    const token = reqUrl.searchParams.get('token');
    if (!token) {
      ws.close(4001, 'Missing auth token');
      return;
    }

    let uid = '';
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      ws.close(4001, 'Invalid auth token');
      return;
    }

    let activeRoomId: string | null = null;

    ws.on('message', (rawMsg) => {
      try {
        const msg = JSON.parse(rawMsg.toString());
        if (!msg || typeof msg.type !== 'string') return;

        // 1. Clock sync
        if (msg.type === 'clock:ping') {
          ws.send(
            JSON.stringify({
              type: 'clock:pong',
              clientSentMs: msg.clientSentMs,
              serverTimeMs: Date.now(),
            })
          );
          return;
        }

        // 2. Global presence registration
        if (msg.type === 'presence:hello') {
          const existingGlobal = globalPresence.get(uid);
          if (existingGlobal) {
            existingGlobal.username = msg.username || existingGlobal.username;
            existingGlobal.displayName = msg.displayName || existingGlobal.displayName;
            existingGlobal.avatarUrl = msg.avatarUrl ?? existingGlobal.avatarUrl;
            existingGlobal.roomId = msg.roomId || '';
            existingGlobal.roomName = msg.roomName || '';
            existingGlobal.trackTitle = msg.trackTitle || '';
            existingGlobal.sockets.add(ws);
          } else {
            globalPresence.set(uid, {
              uid,
              username: msg.username || 'user',
              displayName: msg.displayName || 'Listener',
              avatarUrl: msg.avatarUrl || '',
              roomId: msg.roomId || '',
              roomName: msg.roomName || '',
              trackTitle: msg.trackTitle || '',
              sockets: new Set([ws]),
            });
          }
          broadcastGlobalPresence();
          return;
        }

        // 3. Join Room
        if (msg.type === 'room:join') {
          const roomId = String(msg.roomId || '');
          if (!roomId) return;

          if (activeRoomId && activeRoomId !== roomId) {
            removeSocketFromRoom(activeRoomId, uid, ws);
          }
          activeRoomId = roomId;

          const state = getOrCreateRoomState(roomId);
          const userMeta = msg.user || {};
          const existingParticipant = state.participants.get(uid);
          if (existingParticipant) {
            existingParticipant.sockets.add(ws);
            existingParticipant.role = userMeta.role || existingParticipant.role;
            existingParticipant.isMuted = Boolean(userMeta.isMuted);
            existingParticipant.displayName = userMeta.displayName || existingParticipant.displayName;
            existingParticipant.avatarUrl = userMeta.avatarUrl ?? existingParticipant.avatarUrl;
          } else {
            state.participants.set(uid, {
              uid,
              username: userMeta.username || 'user',
              displayName: userMeta.displayName || 'Listener',
              avatarUrl: userMeta.avatarUrl || '',
              role: userMeta.role || 'listener',
              isMuted: Boolean(userMeta.isMuted),
              isTyping: false,
              joinedAtMs: Date.now(),
              sockets: new Set([ws]),
            });
          }

          // Seed initial playlist if state has no playlist yet
          if (state.playlist.length === 0 && Array.isArray(msg.initialPlaylist) && msg.initialPlaylist.length > 0) {
            state.playlist = msg.initialPlaylist;
            state.currentTrack = msg.initialPlaylist[0];
            state.positionMs = 0;
            state.isPlaying = true;
            state.updatedAtServerMs = Date.now();
            scheduleAutoAdvance(state);
          }

          // Update global presence
          const gp = globalPresence.get(uid);
          if (gp) {
            gp.roomId = roomId;
            gp.roomName = msg.roomName || '';
            gp.trackTitle = state.currentTrack?.title || '';
            broadcastGlobalPresence();
          }

          ws.send(
            JSON.stringify({
              type: 'room:state',
              ...serializePlayback(state),
              participants: serializeParticipants(state),
              battle: state.battle,
            })
          );

          broadcastToRoom(state, {
            type: 'room:presence',
            participants: serializeParticipants(state),
          });
          return;
        }

        if (!activeRoomId) return;
        const state = roomStates.get(activeRoomId);
        if (!state) return;
        const sender = state.participants.get(uid);
        if (!sender) return;

        // 4. Leave Room
        if (msg.type === 'room:leave') {
          removeSocketFromRoom(activeRoomId, uid, ws);
          activeRoomId = null;
          return;
        }

        // 5. Typing indicator
        if (msg.type === 'chat:typing') {
          sender.isTyping = Boolean(msg.isTyping);
          broadcastToRoom(state, {
            type: 'room:presence',
            participants: serializeParticipants(state),
          });
          return;
        }

        // 6. Real-time animated reactions (rate-limited)
        if (msg.type === 'reaction:send') {
          const allowedEmojis = new Set(['❤️', '🔥', '🎶', '😂', '😍', '🕺']);
          const emoji = String(msg.emoji || '');
          if (!allowedEmojis.has(emoji)) return;
          const now = Date.now();
          const last = state.reactionCooldowns.get(uid) || 0;
          if (now - last < 350) return;
          state.reactionCooldowns.set(uid, now);
          broadcastToRoom(state, {
            type: 'reaction:burst',
            id: crypto.randomUUID(),
            emoji,
            senderName: sender.displayName,
            x: 15 + Math.random() * 70,
          });
          return;
        }

        // 7. Music Battle Live Sync
        if (msg.type === 'battle:vote') {
          if (!state.battle || state.battle.status !== 'active') return;
          const choice = msg.choice === 'A' ? 'A' : msg.choice === 'B' ? 'B' : null;
          if (!choice) return;
          state.battle.votesA = state.battle.votesA.filter((id) => id !== uid);
          state.battle.votesB = state.battle.votesB.filter((id) => id !== uid);
          if (choice === 'A') state.battle.votesA.push(uid);
          else state.battle.votesB.push(uid);
          broadcastToRoom(state, { type: 'battle:updated', battle: state.battle });
          return;
        }

        if (msg.type === 'battle:sync') {
          if (sender.role !== 'admin' && sender.role !== 'dj') return;
          state.battle = msg.battle || null;
          broadcastToRoom(state, { type: 'battle:updated', battle: state.battle });
          return;
        }

        // 8. Staff-only controls (Admin or DJ)
        const isStaff = sender.role === 'admin' || sender.role === 'dj';
        if (!isStaff) return;

        if (msg.type === 'room:sync_playlist' && Array.isArray(msg.playlist)) {
          state.playlist = msg.playlist;
          if (!state.currentTrack && state.playlist.length > 0) {
            state.currentTrack = state.playlist[0];
            state.positionMs = 0;
            state.isPlaying = true;
            state.updatedAtServerMs = Date.now();
            scheduleAutoAdvance(state);
          } else if (state.currentTrack && !state.playlist.some((t) => t.id === state.currentTrack?.id)) {
            state.currentTrack = state.playlist[0] || null;
            state.positionMs = 0;
            state.updatedAtServerMs = Date.now();
            scheduleAutoAdvance(state);
          }
          broadcastToRoom(state, { type: 'room:playback_updated', ...serializePlayback(state) });
          return;
        }

        if (msg.type === 'player:play') {
          if (!state.currentTrack && state.playlist.length > 0) {
            state.currentTrack = state.playlist[0];
            state.positionMs = 0;
          }
          if (!state.currentTrack) return;
          state.isPlaying = true;
          state.updatedAtServerMs = Date.now();
          scheduleAutoAdvance(state);
          broadcastToRoom(state, { type: 'room:playback_updated', ...serializePlayback(state) });
          return;
        }

        if (msg.type === 'player:pause') {
          state.positionMs = getEffectivePositionMs(state);
          state.isPlaying = false;
          state.updatedAtServerMs = Date.now();
          scheduleAutoAdvance(state);
          broadcastToRoom(state, { type: 'room:playback_updated', ...serializePlayback(state) });
          return;
        }

        if (msg.type === 'player:seek') {
          if (!state.currentTrack) return;
          const target = Math.max(0, Math.min(Number(msg.positionMs) || 0, state.currentTrack.durationMs));
          state.positionMs = target;
          state.updatedAtServerMs = Date.now();
          scheduleAutoAdvance(state);
          broadcastToRoom(state, { type: 'room:playback_updated', ...serializePlayback(state) });
          return;
        }

        if (msg.type === 'player:select_track') {
          const found = state.playlist.find((t) => t.id === msg.trackId);
          if (!found) return;
          state.currentTrack = found;
          state.positionMs = 0;
          state.isPlaying = true;
          state.updatedAtServerMs = Date.now();
          scheduleAutoAdvance(state);
          broadcastToRoom(state, {
            type: 'room:playback_updated',
            ...serializePlayback(state),
            trackChanged: true,
          });
          return;
        }

        if (msg.type === 'player:next') {
          advanceTrack(state, 1, false);
          return;
        }

        if (msg.type === 'player:prev') {
          const curPos = getEffectivePositionMs(state);
          if (curPos > 4000 && state.currentTrack) {
            state.positionMs = 0;
            state.updatedAtServerMs = Date.now();
            scheduleAutoAdvance(state);
            broadcastToRoom(state, { type: 'room:playback_updated', ...serializePlayback(state) });
          } else {
            advanceTrack(state, -1, false);
          }
          return;
        }

        if (msg.type === 'player:toggle_shuffle') {
          state.shuffle = !state.shuffle;
          broadcastToRoom(state, { type: 'room:playback_updated', ...serializePlayback(state) });
          return;
        }

        if (msg.type === 'player:set_repeat') {
          if (msg.repeat === 'off' || msg.repeat === 'one' || msg.repeat === 'all') {
            state.repeat = msg.repeat;
            broadcastToRoom(state, { type: 'room:playback_updated', ...serializePlayback(state) });
          }
          return;
        }

        if (msg.type === 'room:toggle_party_mode') {
          state.partyMode = Boolean(msg.partyMode);
          broadcastToRoom(state, { type: 'room:playback_updated', ...serializePlayback(state) });
          return;
        }

        // Admin moderation sync signals
        if (sender.role === 'admin') {
          if (msg.type === 'room:role_updated' && msg.targetUid) {
            const target = state.participants.get(msg.targetUid);
            if (target) {
              if (msg.role) target.role = msg.role;
              if (typeof msg.isMuted === 'boolean') target.isMuted = msg.isMuted;
              broadcastToRoom(state, {
                type: 'room:presence',
                participants: serializeParticipants(state),
              });
            }
            return;
          }

          if (msg.type === 'room:kick_user' && msg.targetUid) {
            const target = state.participants.get(msg.targetUid);
            if (target) {
              for (const s of target.sockets) {
                if (s.readyState === WebSocket.OPEN) {
                  s.send(JSON.stringify({ type: 'room:kicked', roomId: activeRoomId }));
                }
              }
              state.participants.delete(msg.targetUid);
              broadcastToRoom(state, {
                type: 'room:presence',
                participants: serializeParticipants(state),
              });
            }
            return;
          }

          if (msg.type === 'room:close') {
            broadcastToRoom(state, { type: 'room:closed', roomId: activeRoomId });
            if (state.autoAdvanceTimer) clearTimeout(state.autoAdvanceTimer);
            roomStates.delete(activeRoomId);
          }
        }
      } catch {
        // Ignore malformed socket frames
      }
    });

    ws.on('close', () => {
      if (activeRoomId) {
        removeSocketFromRoom(activeRoomId, uid, ws);
      }
      const gp = globalPresence.get(uid);
      if (gp) {
        gp.sockets.delete(ws);
        if (gp.sockets.size === 0) {
          globalPresence.delete(uid);
        }
        broadcastGlobalPresence();
      }
    });
  });

  function removeSocketFromRoom(roomId: string, uid: string, ws: WebSocket) {
    const state = roomStates.get(roomId);
    if (!state) return;
    const participant = state.participants.get(uid);
    if (!participant) return;

    participant.sockets.delete(ws);
    if (participant.sockets.size > 0) return;

    const wasAdmin = participant.role === 'admin';
    state.participants.delete(uid);

    const gp = globalPresence.get(uid);
    if (gp && gp.roomId === roomId) {
      gp.roomId = '';
      gp.roomName = '';
      gp.trackTitle = '';
      broadcastGlobalPresence();
    }

    // Rule 9: Automatic admin handover if last admin leaves while others remain
    if (wasAdmin && state.participants.size > 0) {
      const hasRemainingAdmin = Array.from(state.participants.values()).some((p) => p.role === 'admin');
      if (!hasRemainingAdmin) {
        const sorted = Array.from(state.participants.values()).sort((a, b) => {
          if (a.role === 'dj' && b.role !== 'dj') return -1;
          if (b.role === 'dj' && a.role !== 'dj') return 1;
          return a.joinedAtMs - b.joinedAtMs;
        });
        const successor = sorted[0];
        if (successor) {
          successor.role = 'admin';
          broadcastToRoom(state, {
            type: 'room:admin_transferred',
            newAdminUid: successor.uid,
            newAdminName: successor.displayName,
          });
        }
      }
    }

    if (state.participants.size === 0) {
      state.isPlaying = false;
      if (state.autoAdvanceTimer) clearTimeout(state.autoAdvanceTimer);
    } else {
      broadcastToRoom(state, {
        type: 'room:presence',
        participants: serializeParticipants(state),
      });
    }
  }

  // Mount Vite middleware in dev, or serve static dist in production
  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`VIBE ROOM server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap();
