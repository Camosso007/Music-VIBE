import { useState } from 'react';
import {
  Bell,
  Calendar,
  Compass,
  Home,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Settings,
  Trophy,
  User as UserIcon,
  X,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase.ts';
import { joinRoom, markNotificationRead, updatePublicProfile } from '../lib/firestoreService.ts';
import { t } from '../lib/i18n.ts';
import { realtimeClient } from '../lib/realtimeClient.ts';
import { useAppStore } from '../store/useAppStore.ts';
import { AppView } from '../types/index.ts';
import { CoverImage } from './CoverImage.tsx';

interface AppShellProps {
  onOpenCreateRoom: () => void;
  children: React.ReactNode;
}

export function AppShell({ onOpenCreateRoom, children }: AppShellProps) {
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const publicProfile = useAppStore((s) => s.publicProfile);
  const notifications = useAppStore((s) => s.notifications);
  const globalOnlineUsers = useAppStore((s) => s.globalOnlineUsers);
  const activeRoomId = useAppStore((s) => s.activeRoomId);
  const openRoom = useAppStore((s) => s.openRoom);
  const openUserProfile = useAppStore((s) => s.openUserProfile);
  const addToast = useAppStore((s) => s.addToast);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const navItems: { id: AppView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: t(language, 'dashboard'), icon: Home },
    { id: 'explore', label: t(language, 'explore'), icon: Compass },
    { id: 'messages', label: t(language, 'messages'), icon: MessageCircle },
    { id: 'events', label: t(language, 'events'), icon: Calendar },
    { id: 'ranking', label: t(language, 'ranking'), icon: Trophy },
    { id: 'profile', label: t(language, 'profile'), icon: UserIcon },
    { id: 'settings', label: t(language, 'settings'), icon: Settings },
  ];

  const handleNav = (view: AppView) => {
    if (view === 'profile' && publicProfile) {
      openUserProfile(publicProfile.uid);
    } else {
      setActiveView(view);
    }
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    if (publicProfile) {
      await updatePublicProfile(publicProfile.uid, {
        isOnline: false,
        currentRoomId: '',
        currentRoomName: '',
        currentTrackTitle: '',
      }).catch(() => {});
    }
    realtimeClient.disconnect();
    await signOut(auth);
  };

  const handleNotificationClick = async (n: (typeof notifications)[number]) => {
    await markNotificationRead(n.id);
    setNotifOpen(false);
    if (n.roomId && publicProfile) {
      try {
        const { room } = await joinRoom(n.roomId, publicProfile, n.inviteCode || '');
        openRoom(room.id);
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Sala indisponível.', 'error');
      }
    } else if (n.type === 'friend_request') {
      openUserProfile(n.senderUid);
    }
  };

  const onlinePeers = globalOnlineUsers.filter((u) => u.uid !== publicProfile?.uid).slice(0, 6);

  const SidebarContent = (
    <div className="flex flex-col h-full p-4 justify-between">
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <button
            type="button"
            onClick={() => handleNav('dashboard')}
            className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            VIBE ROOM
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1 text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setMobileMenuOpen(false);
            onOpenCreateRoom();
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-sm font-semibold transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>{t(language, 'createRoom')}</span>
        </button>

        {activeRoomId && (
          <button
            type="button"
            onClick={() => handleNav('room')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
              activeView === 'room'
                ? 'bg-[#EC4899]/15 border-[#EC4899]/40 text-white'
                : 'bg-[#18181B] border-white/10 text-zinc-300 hover:text-white'
            }`}
          >
            <span className="truncate">
              {language === 'pt' ? 'Voltar à Sala Ativa' : 'Return to Active Room'}
            </span>
            <span className="text-[#EC4899] shrink-0">AO VIVO</span>
          </button>
        )}

        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#8B5CF6]' : ''}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {onlinePeers.length > 0 && (
          <div className="pt-4 border-t border-white/10 space-y-2.5">
            <p className="px-2 text-xs font-medium text-zinc-500">
              {language === 'pt' ? 'Comunidade Online' : 'Online Now'}
            </p>
            <div className="space-y-1.5">
              {onlinePeers.map((peer) => (
                <button
                  key={peer.uid}
                  type="button"
                  onClick={() => openUserProfile(peer.uid)}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 text-left transition-colors"
                >
                  <CoverImage
                    src={peer.avatarUrl}
                    alt={peer.displayName}
                    className="w-7 h-7 rounded-full object-cover shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-zinc-200 truncate">{peer.displayName}</p>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {peer.roomName ? peer.roomName : `@${peer.username}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-white/10 space-y-2">
        {publicProfile && (
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <CoverImage
              src={publicProfile.avatarUrl}
              alt={publicProfile.displayName}
              className="w-8 h-8 rounded-full object-cover shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">
                {publicProfile.displayName}
              </p>
              <p className="text-[11px] text-zinc-400 truncate font-mono-tabular">
                @{publicProfile.username} · {publicProfile.points} pts
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-rose-400 hover:bg-white/5 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>{t(language, 'logout')}</span>
        </button>
      </div>
    </div>
  );

  const pageTitles: Record<AppView, string> = {
    dashboard: t(language, 'dashboard'),
    explore: t(language, 'explore'),
    room: language === 'pt' ? 'Sala Musical' : 'Music Room',
    messages: t(language, 'messages'),
    events: t(language, 'events'),
    ranking: t(language, 'ranking'),
    profile: t(language, 'profile'),
    settings: t(language, 'settings'),
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[260px] shrink-0 border-r border-white/10 bg-[#09090B] sticky top-0 h-screen overflow-y-auto">
        {SidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#09090B] border-r border-white/10 h-full overflow-y-auto z-10">
            {SidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 border-b border-white/10 bg-[#09090B]/85 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5"
              aria-label="Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display text-base font-semibold text-white truncate">
              {pageTitles[activeView]}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setLanguage(language === 'pt' ? 'en' : 'pt')}
              className="px-2.5 py-1 rounded-lg bg-[#18181B] border border-white/10 text-xs font-medium text-zinc-300 hover:text-white transition-colors"
            >
              {language === 'pt' ? 'PT' : 'EN'}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                className="relative p-2 rounded-lg bg-[#18181B] border border-white/10 text-zinc-300 hover:text-white transition-colors"
                aria-label={t(language, 'notifications')}
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#EC4899] text-[10px] font-bold text-white flex items-center justify-center font-mono-tabular">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-[#18181B] border border-white/10 rounded-2xl shadow-2xl p-3 space-y-2 z-50">
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-xs font-semibold text-white">
                      {t(language, 'notifications')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="text-zinc-500 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-zinc-500 px-2 py-4 text-center">
                      {t(language, 'noNotifications')}
                    </p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto space-y-1">
                      {notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleNotificationClick(n)}
                          className={`w-full text-left p-2.5 rounded-xl transition-colors ${
                            n.read ? 'hover:bg-white/5 opacity-75' : 'bg-[#8B5CF6]/10 hover:bg-[#8B5CF6]/20'
                          }`}
                        >
                          <p className="text-xs font-semibold text-white">{n.title}</p>
                          <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">{n.body}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
