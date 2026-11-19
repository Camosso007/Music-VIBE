/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { Lock, X } from 'lucide-react';
import { AppShell } from './components/AppShell.tsx';
import { CreateRoomModal } from './components/CreateRoomModal.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { EventsView } from './components/EventsView.tsx';
import { ExploreView } from './components/ExploreView.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { MessagesView } from './components/MessagesView.tsx';
import { OnboardingModal } from './components/OnboardingModal.tsx';
import { ProfileView } from './components/ProfileView.tsx';
import { RankingView } from './components/RankingView.tsx';
import { RoomView } from './components/RoomView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { ToastStack } from './components/ToastStack.tsx';
import { OperationType, auth, db, googleAuthProvider, handleFirestoreError } from './lib/firebase.ts';
import {
  ensureUserProfiles,
  joinRoomByInviteCode,
  subscribeDiscoverableRooms,
  subscribeDmThreads,
  subscribeEvents,
  subscribeFriendships,
  subscribeNotifications,
  subscribePublicUsers,
} from './lib/firestoreService.ts';
import { realtimeClient } from './lib/realtimeClient.ts';
import { useAppStore } from './store/useAppStore.ts';
import {
  DmThreadDoc,
  FriendshipDoc,
  MusicEventDoc,
  RoomDoc,
  UserPrivate,
  UserPublic,
} from './types/index.ts';

function VibeRoomRoot() {
  const authReady = useAppStore((s) => s.authReady);
  const setAuthReady = useAppStore((s) => s.setAuthReady);
  const setUserUid = useAppStore((s) => s.setUserUid);
  const publicProfile = useAppStore((s) => s.publicProfile);
  const privateProfile = useAppStore((s) => s.privateProfile);
  const needsOnboarding = useAppStore((s) => s.needsOnboarding);
  const setProfiles = useAppStore((s) => s.setProfiles);
  const activeView = useAppStore((s) => s.activeView);
  const activeRoomId = useAppStore((s) => s.activeRoomId);
  const openRoom = useAppStore((s) => s.openRoom);
  const setNotifications = useAppStore((s) => s.setNotifications);
  const addToast = useAppStore((s) => s.addToast);
  const language = useAppStore((s) => s.language);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);

  const [rooms, setRooms] = useState<RoomDoc[]>([]);
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [friendships, setFriendships] = useState<FriendshipDoc[]>([]);
  const [dmThreads, setDmThreads] = useState<DmThreadDoc[]>([]);
  const [events, setEvents] = useState<MusicEventDoc[]>([]);

  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    return code ? code.trim().toUpperCase() : null;
  });
  const [invitePasswordPrompt, setInvitePasswordPrompt] = useState<string | null>(null);
  const [invitePasswordInput, setInvitePasswordInput] = useState('');
  const [joiningInvite, setJoiningInvite] = useState(false);

  const unsubsRef = useRef<Array<() => void>>([]);

  const clearSubscriptions = () => {
    unsubsRef.current.forEach((u) => {
      try {
        u();
      } catch {
        // ignore
      }
    });
    unsubsRef.current = [];
  };

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      clearSubscriptions();
      setFirebaseUser(user);
      setUserUid(user ? user.uid : null);

      if (!user) {
        realtimeClient.disconnect();
        setProfiles(null, null, false);
        setRooms([]);
        setUsers([]);
        setFriendships([]);
        setDmThreads([]);
        setEvents([]);
        setNotifications([]);
        setAuthReady(true);
        return;
      }

      try {
        const result = await ensureUserProfiles(user);
        setProfiles(result.pub, result.priv, result.needsOnboarding);
        setAuthReady(true);

        realtimeClient.connect().catch(() => {});

        const uPub = onSnapshot(
          doc(db, 'users_public', user.uid),
          (snap) => {
            if (snap.exists()) {
              const currPriv = useAppStore.getState().privateProfile;
              useAppStore
                .getState()
                .setProfiles(snap.data() as UserPublic, currPriv, !currPriv);
            }
          },
          (err) => handleFirestoreError(err, OperationType.GET, `users_public/${user.uid}`)
        );

        const uPriv = onSnapshot(
          doc(db, 'users_private', user.uid),
          (snap) => {
            if (snap.exists()) {
              const currPub = useAppStore.getState().publicProfile;
              useAppStore
                .getState()
                .setProfiles(currPub, snap.data() as UserPrivate, !currPub);
            }
          },
          (err) => handleFirestoreError(err, OperationType.GET, `users_private/${user.uid}`)
        );

        const uRooms = subscribeDiscoverableRooms(user.uid, setRooms);
        const uUsers = subscribePublicUsers(setUsers);
        const uNotifs = subscribeNotifications(user.uid, setNotifications);
        const uFriends = subscribeFriendships(user.uid, setFriendships);
        const uDms = subscribeDmThreads(user.uid, setDmThreads);
        const uEvents = subscribeEvents(setEvents);

        unsubsRef.current = [uPub, uPriv, uRooms, uUsers, uNotifs, uFriends, uDms, uEvents];
      } catch (err) {
        setAuthReady(true);
        addToast(
          err instanceof Error ? err.message : 'Erro ao iniciar sessão no VIBE ROOM.',
          'error'
        );
      }
    });

    return () => {
      unsubAuth();
      clearSubscriptions();
      realtimeClient.disconnect();
    };
  }, []);

  // Re-send global presence when publicProfile updates
  useEffect(() => {
    if (!publicProfile || !useAppStore.getState().wsConnected) return;
    realtimeClient.send({
      type: 'presence:hello',
      username: publicProfile.username,
      displayName: publicProfile.displayName,
      avatarUrl: publicProfile.avatarUrl,
      roomId: publicProfile.currentRoomId || '',
      roomName: publicProfile.currentRoomName || '',
      trackTitle: publicProfile.currentTrackTitle || '',
    });
  }, [
    publicProfile?.uid,
    publicProfile?.username,
    publicProfile?.displayName,
    publicProfile?.currentRoomId,
  ]);

  // Auto-process ?invite=CODE URL parameter once signed in and onboarded
  useEffect(() => {
    if (!pendingInviteCode || !publicProfile || needsOnboarding) return;
    const codeToJoin = pendingInviteCode;
    setPendingInviteCode(null);

    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url.toString());

    joinRoomByInviteCode(codeToJoin, '', publicProfile)
      .then((room) => {
        openRoom(room.id);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : '';
        if (message.toLowerCase().includes('palavra-passe')) {
          setInvitePasswordPrompt(codeToJoin);
        } else {
          addToast(message || 'Convite inválido.', 'error');
        }
      });
  }, [pendingInviteCode, publicProfile?.uid, needsOnboarding]);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      addToast(
        err instanceof Error
          ? err.message
          : language === 'pt'
          ? 'Não foi possível concluir o login Google.'
          : 'Google Sign-In failed.',
        'error'
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handleInvitePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitePasswordPrompt || !publicProfile) return;
    setJoiningInvite(true);
    try {
      const room = await joinRoomByInviteCode(
        invitePasswordPrompt,
        invitePasswordInput,
        publicProfile
      );
      setInvitePasswordPrompt(null);
      setInvitePasswordInput('');
      openRoom(room.id);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Palavra-passe incorreta.', 'error');
    } finally {
      setJoiningInvite(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#09090B] text-zinc-200 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-[#8B5CF6] border-t-transparent animate-spin" />
        <p className="font-display text-sm tracking-wide text-zinc-400">VIBE ROOM</p>
      </div>
    );
  }

  if (!firebaseUser) {
    return <LandingPage onSignIn={handleGoogleSignIn} signingIn={signingIn} />;
  }

  if (needsOnboarding || !publicProfile || !privateProfile) {
    return (
      <>
        <LandingPage onSignIn={handleGoogleSignIn} signingIn={signingIn} />
        <OnboardingModal firebaseUser={firebaseUser} />
      </>
    );
  }

  return (
    <>
      <AppShell onOpenCreateRoom={() => setCreateRoomOpen(true)}>
        {activeView === 'dashboard' && (
          <DashboardView
            rooms={rooms}
            users={users}
            friendships={friendships}
            onOpenCreateRoom={() => setCreateRoomOpen(true)}
          />
        )}
        {activeView === 'explore' && <ExploreView rooms={rooms} events={events} />}
        {activeView === 'room' && activeRoomId && (
          <RoomView roomId={activeRoomId} allUsers={users} />
        )}
        {activeView === 'room' && !activeRoomId && (
          <DashboardView
            rooms={rooms}
            users={users}
            friendships={friendships}
            onOpenCreateRoom={() => setCreateRoomOpen(true)}
          />
        )}
        {activeView === 'messages' && (
          <MessagesView threads={dmThreads} users={users} rooms={rooms} />
        )}
        {activeView === 'events' && <EventsView events={events} rooms={rooms} />}
        {activeView === 'ranking' && <RankingView users={users} />}
        {activeView === 'profile' && (
          <ProfileView users={users} rooms={rooms} friendships={friendships} />
        )}
        {activeView === 'settings' && <SettingsView users={users} />}
      </AppShell>

      {createRoomOpen && <CreateRoomModal onClose={() => setCreateRoomOpen(false)} />}

      {invitePasswordPrompt && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleInvitePasswordSubmit}
            className="w-full max-w-sm bg-[#18181B] border border-white/10 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-display font-bold">
                <Lock className="w-4 h-4 text-[#8B5CF6]" />
                <span>{language === 'pt' ? 'Sala Privada' : 'Private Room'}</span>
              </div>
              <button type="button" onClick={() => setInvitePasswordPrompt(null)}>
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
            <p className="text-xs text-zinc-400">
              {language === 'pt'
                ? `O convite ${invitePasswordPrompt} requer palavra-passe.`
                : `Invite ${invitePasswordPrompt} requires a password.`}
            </p>
            <input
              type="password"
              required
              autoFocus
              value={invitePasswordInput}
              onChange={(e) => setInvitePasswordInput(e.target.value)}
              placeholder={language === 'pt' ? 'Palavra-passe da sala' : 'Room password'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
            />
            <button
              type="submit"
              disabled={joiningInvite}
              className="w-full py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-sm font-semibold text-white"
            >
              {joiningInvite ? '...' : language === 'pt' ? 'Entrar na Sala' : 'Join Room'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <VibeRoomRoot />
      <ToastStack />
    </ErrorBoundary>
  );
}
