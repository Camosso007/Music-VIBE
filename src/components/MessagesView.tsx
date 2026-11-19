import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Plus, Send, Users, X } from 'lucide-react';
import { OperationType, db, handleFirestoreError } from '../lib/firebase.ts';
import {
  createFriendGroup,
  createOrGetDmThread,
  joinRoom,
  sendDmMessage,
} from '../lib/firestoreService.ts';
import { t } from '../lib/i18n.ts';
import { useAppStore } from '../store/useAppStore.ts';
import { DmMessageDoc, DmThreadDoc, RoomDoc, UserPublic } from '../types/index.ts';
import { CoverImage } from './CoverImage.tsx';

interface MessagesViewProps {
  threads: DmThreadDoc[];
  users: UserPublic[];
  rooms: RoomDoc[];
}

export function MessagesView({ threads, users, rooms }: MessagesViewProps) {
  const language = useAppStore((s) => s.language);
  const publicProfile = useAppStore((s) => s.publicProfile);
  const activeDmThreadId = useAppStore((s) => s.activeDmThreadId);
  const openDmThread = useAppStore((s) => s.openDmThread);
  const openRoom = useAppStore((s) => s.openRoom);
  const addToast = useAppStore((s) => s.addToast);

  const [messages, setMessages] = useState<DmMessageDoc[]>([]);
  const [text, setText] = useState('');
  const [groupModal, setGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMemberUids, setSelectedMemberUids] = useState<string[]>([]);
  const [newDmTargetUid, setNewDmTargetUid] = useState('');
  const [inviteRoomId, setInviteRoomId] = useState('');

  const selectedThread =
    threads.find((th) => th.id === activeDmThreadId) || threads[0] || null;

  useEffect(() => {
    if (!selectedThread) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'dm_threads', selectedThread.id, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setMessages(snap.docs.map((d) => d.data() as DmMessageDoc)),
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `dm_threads/${selectedThread.id}/messages`
        )
    );
    return () => unsub();
  }, [selectedThread?.id]);

  if (!publicProfile) return null;

  const getThreadTitle = (th: DmThreadDoc) => {
    if (th.isGroup) return th.name || 'Grupo';
    const otherUid = th.participants.find((id) => id !== publicProfile.uid);
    const other = users.find((u) => u.uid === otherUid);
    return other?.displayName || 'Utilizador';
  };

  const getThreadAvatar = (th: DmThreadDoc) => {
    if (th.isGroup) return '';
    const otherUid = th.participants.find((id) => id !== publicProfile.uid);
    return users.find((u) => u.uid === otherUid)?.avatarUrl || '';
  };

  const handleStartDm = async (uid: string) => {
    if (!uid) return;
    const threadId = await createOrGetDmThread(publicProfile.uid, uid);
    openDmThread(threadId);
    setNewDmTargetUid('');
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedMemberUids.length === 0) return;
    const id = await createFriendGroup(publicProfile.uid, groupName, selectedMemberUids);
    setGroupModal(false);
    setGroupName('');
    setSelectedMemberUids([]);
    openDmThread(id);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread || !text.trim()) return;
    const msg = text.trim();
    setText('');
    await sendDmMessage(selectedThread.id, publicProfile, msg);
  };

  const handleSendInvite = async () => {
    if (!selectedThread || !inviteRoomId) return;
    const room = rooms.find((r) => r.id === inviteRoomId);
    if (!room) return;
    await sendDmMessage(
      selectedThread.id,
      publicProfile,
      language === 'pt'
        ? `Vem ouvir música comigo em ${room.name}!`
        : `Come listen with me in ${room.name}!`,
      {
        roomId: room.id,
        roomName: room.name,
        inviteCode: room.inviteCode,
      }
    );
    setInviteRoomId('');
    addToast(language === 'pt' ? 'Convite enviado na conversa!' : 'Room invite sent!', 'success');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="flex-1 grid lg:grid-cols-12 bg-[#18181B] border border-white/10 rounded-2xl overflow-hidden min-h-0">
        {/* Threads Sidebar */}
        <div className="lg:col-span-4 border-r border-white/10 flex flex-col min-h-0">
          <div className="p-4 border-b border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-white">
                {t(language, 'messages')}
              </h2>
              <button
                type="button"
                onClick={() => setGroupModal(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#8B5CF6] hover:bg-[#7C3AED] text-xs font-semibold text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t(language, 'newGroup')}</span>
              </button>
            </div>

            <div className="flex gap-2">
              <select
                value={newDmTargetUid}
                onChange={(e) => handleStartDm(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#09090B] border border-white/10 text-xs text-zinc-200"
              >
                <option value="">
                  {language === 'pt' ? '+ Nova conversa privada...' : '+ Start direct message...'}
                </option>
                {users
                  .filter((u) => u.uid !== publicProfile.uid)
                  .map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.displayName} (@{u.username})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {threads.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-8">
                {language === 'pt'
                  ? 'Escolhe um utilizador acima para conversar ou cria um grupo.'
                  : 'Select a user above to chat or create a group.'}
              </p>
            ) : (
              threads.map((th) => {
                const active = selectedThread?.id === th.id;
                return (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => openDmThread(th.id)}
                    className={`w-full p-3 rounded-xl flex items-center gap-3 text-left transition-colors ${
                      active ? 'bg-[#8B5CF6]/20 border border-[#8B5CF6]/40' : 'hover:bg-white/5'
                    }`}
                  >
                    {th.isGroup ? (
                      <div className="w-9 h-9 rounded-full bg-[#3B82F6]/20 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4 text-[#3B82F6]" />
                      </div>
                    ) : (
                      <CoverImage
                        src={getThreadAvatar(th)}
                        alt={getThreadTitle(th)}
                        className="w-9 h-9 rounded-full object-cover shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">
                        {getThreadTitle(th)}
                      </p>
                      <p className="text-xs text-zinc-400 truncate">
                        {th.lastMessage ||
                          (th.isGroup
                            ? `${th.participants.length} membros`
                            : 'Conversa direta')}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Active Conversation */}
        <div className="lg:col-span-8 flex flex-col min-h-0 bg-[#09090B]">
          {!selectedThread ? (
            <div className="flex-1 flex items-center justify-center text-sm text-zinc-500 p-6">
              {language === 'pt'
                ? 'Seleciona uma conversa para ver as mensagens.'
                : 'Select a conversation to view messages.'}
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-[#18181B]">
                <div className="flex items-center gap-2.5">
                  <span className="font-display font-semibold text-white">
                    {getThreadTitle(selectedThread)}
                  </span>
                  {selectedThread.isGroup && (
                    <span className="text-xs text-zinc-400 font-mono-tabular">
                      · {selectedThread.participants.length}
                    </span>
                  )}
                </div>

                {rooms.length > 0 && (
                  <div className="flex items-center gap-2">
                    <select
                      value={inviteRoomId}
                      onChange={(e) => setInviteRoomId(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#09090B] border border-white/10 text-xs text-zinc-200 max-w-[180px]"
                    >
                      <option value="">
                        {language === 'pt' ? 'Convidar para sala...' : 'Invite to room...'}
                      </option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!inviteRoomId}
                      onClick={handleSendInvite}
                      className="px-3 py-1.5 rounded-lg bg-[#3B82F6] disabled:opacity-40 text-xs font-semibold text-white"
                    >
                      {language === 'pt' ? 'Enviar' : 'Send'}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m) => {
                  const mine = m.senderUid === publicProfile.uid;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                    >
                      <span className="text-[11px] text-zinc-500 mb-1">{m.senderName}</span>
                      <div
                        className={`max-w-md px-4 py-2.5 rounded-2xl text-sm space-y-2 ${
                          mine
                            ? 'bg-[#8B5CF6] text-white'
                            : 'bg-[#18181B] border border-white/10 text-zinc-100'
                        }`}
                      >
                        <p className="break-words">{m.text}</p>
                        {m.inviteRoomId && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await joinRoom(
                                  m.inviteRoomId!,
                                  publicProfile,
                                  m.inviteCode || ''
                                );
                                openRoom(m.inviteRoomId!);
                              } catch (err) {
                                addToast(
                                  err instanceof Error ? err.message : 'Sala indisponível.',
                                  'error'
                                );
                              }
                            }}
                            className="w-full py-1.5 px-3 rounded-lg bg-black/30 hover:bg-black/50 text-xs font-semibold text-white"
                          >
                            {t(language, 'joinRoom')}: {m.inviteRoomName}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={handleSend}
                className="p-3.5 border-t border-white/10 flex items-center gap-2 bg-[#18181B]"
              >
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    language === 'pt' ? 'Escreve uma mensagem...' : 'Write a message...'
                  }
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                />
                <button
                  type="submit"
                  className="p-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white"
                  aria-label="Send"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Create Friend Group Modal */}
      {groupModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateGroup}
            className="w-full max-w-md bg-[#18181B] border border-white/10 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                {t(language, 'newGroup')}
              </h3>
              <button type="button" onClick={() => setGroupModal(false)}>
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            <input
              type="text"
              required
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={language === 'pt' ? 'Nome do grupo' : 'Group name'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white"
            />
            <div className="max-h-48 overflow-y-auto space-y-1.5">
              {users
                .filter((u) => u.uid !== publicProfile.uid)
                .map((u) => {
                  const checked = selectedMemberUids.includes(u.uid);
                  return (
                    <label
                      key={u.uid}
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/5 cursor-pointer text-xs text-zinc-200"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedMemberUids((prev) =>
                            checked ? prev.filter((id) => id !== u.uid) : [...prev, u.uid]
                          )
                        }
                      />
                      <span>
                        {u.displayName} (@{u.username})
                      </span>
                    </label>
                  );
                })}
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-sm font-semibold text-white"
            >
              {t(language, 'newGroup')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
