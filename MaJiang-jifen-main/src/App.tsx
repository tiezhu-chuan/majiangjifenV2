import React, { useState, useEffect } from 'react';
import { 
  auth, 
  db, 
  handleFirestoreError, 
  OperationType,
  onAuthStateChanged, 
  signOut,
  doc, 
  getDoc, 
  onSnapshot, 
  collection, 
  query, 
  where,
  orderBy,
  limit
} from './firebase';
import { autoSettleStaleGame } from './utils/gameSettle';
import { UserProfile } from './types';
import LoginScreen from './components/LoginScreen';
import HomeTab from './components/HomeTab';
import MyTab from './components/MyTab';
import GameRoomView from './components/GameRoomView';
import { Home, User as UserIcon, Loader2 } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'my'>('home');
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [realTimeActiveGameId, setRealTimeActiveGameId] = useState<string | null>(null);
  const [manuallyExitedGameId, setManuallyExitedGameId] = useState<string | null>(null);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [globalAchievements, setGlobalAchievements] = useState<any[]>([]);

  // 1. Listen to Firebase Client Authentication State
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setUserProfile(null);
        setCurrentGameId(null);
        setGlobalLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Listen to authenticated User's Specific Profile in Firestore
  useEffect(() => {
    if (!currentUser) return;

    const userDocRef = doc(db, 'users', currentUser.uid);
    const unsubscribeProfile = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        setUserProfile(snap.data() as UserProfile);
      } else {
        setUserProfile(null);
      }
      setGlobalLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`);
    });

    return () => unsubscribeProfile();
  }, [currentUser]);

  // 3. Keep standard real-time feed of ALL users to auto-compute global ranking and leaderboard alignment
  useEffect(() => {
    if (!currentUser) return;

    const usersQuery = collection(db, 'users');
    const unsubscribeAllUsers = onSnapshot(usersQuery, (snap) => {
      const list: UserProfile[] = [];
      snap.forEach((d) => {
        list.push(d.data() as UserProfile);
      });
      setAllUsers(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
    });

    return () => unsubscribeAllUsers();
  }, [currentUser]);

  // 4. Continuous real-time check to see if the current user belongs to ANY active games
  // This allows persistent "reconnect/当前牌局" buttons and direct state resume on reload.
  useEffect(() => {
    if (!currentUser) {
      setRealTimeActiveGameId(null);
      setManuallyExitedGameId(null);
      return;
    }

    // Scan for games where state is active
    const activeGamesQuery = query(
      collection(db, 'games'),
      where('status', '==', 'active')
    );

    const unsubscribeActiveGamesCheck = onSnapshot(activeGamesQuery, async (snapshot) => {
      let foundActiveGameId: string | null = null;
      
      // For each active game, check if this user is in their players subcollection
      for (const gameDoc of snapshot.docs) {
        const gameData = gameDoc.data() as any;
        const lastTime = gameData.last_action_at?.toDate 
          ? gameData.last_action_at.toDate() 
          : (gameData.created_at?.toDate ? gameData.created_at.toDate() : new Date(gameData.created_at || Date.now()));
        
        const fourHoursMs = 4 * 60 * 60 * 1000;
        const isStale = (Date.now() - lastTime.getTime()) > fourHoursMs;

        if (isStale) {
          // Automatic settlement for stale active room in background
          autoSettleStaleGame(gameDoc.id, gameData.room_code || '');
          continue;
        }

        const playerSnap = await getDoc(
          doc(db, 'games', gameDoc.id, 'players', currentUser.uid)
        );
        if (playerSnap.exists()) {
          foundActiveGameId = gameDoc.id;
          break; // Stop querying once we discover active game presence
        }
      }
      
      setRealTimeActiveGameId(foundActiveGameId);

      // Only auto-route to the active game if the user hasn't manually exited from it
      if (foundActiveGameId) {
        if (foundActiveGameId !== manuallyExitedGameId) {
          setCurrentGameId(foundActiveGameId);
        }
      } else {
        // If there's no active game at all, reset the exit lock
        setManuallyExitedGameId(null);
        // Do not force-clear currentGameId if the user is currently inside a game room.
        // This allows them to stay in the room and see the final settlement screen.
      }
    }, (err) => {
      console.error('Active game subscription err: ', err);
    });

    return () => unsubscribeActiveGamesCheck();
  }, [currentUser, manuallyExitedGameId]);

  // 5. Real-time subscription to all global achievements for the bento view
  useEffect(() => {
    if (!currentUser) return;

    const achievementsQuery = collection(db, 'achievements');
    const unsubscribeAchievements = onSnapshot(achievementsQuery, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setGlobalAchievements(list);
    }, (err) => {
      console.error('Achievements subscription err: ', err);
    });

    return () => unsubscribeAchievements();
  }, [currentUser]);

  const handleLoginSuccess = (userData: UserProfile) => {
    setUserProfile(userData);
  };

  const handleLogout = async () => {
    const confirmOut = window.confirm('您确定要退出当前账号登录吗？');
    if (confirmOut) {
      await signOut(auth);
    }
  };

  // Calculate user Rank based on all available users sorted by score descending
  const getRankAndCount = () => {
    if (!userProfile) return { rank: 1, count: 1 };
    const sorted = [...allUsers].sort((a, b) => b.total_score - a.total_score);
    const myIndex = sorted.findIndex(u => u.id === userProfile.id);
    return {
      rank: myIndex !== -1 ? myIndex + 1 : 1,
      count: allUsers.length || 1
    };
  };

  // Loading Indicator display
  if (globalLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mb-4" />
        <p className="text-sm font-semibold">正在进入麻将世界...</p>
      </div>
    );
  }

  // Auth Guard
  if (!currentUser || !userProfile) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const { rank: userRank, count: totalUsersCount } = getRankAndCount();

  const getAchievementUser = (userId: string) => {
    const match = allUsers.find(u => u.id === userId);
    return match || {
      username: '雀友',
      avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&h=120&q=80'
    };
  };

  const sortedGlobalAchievements = [...globalAchievements]
    .sort((a, b) => {
      const dateA = a.unlocked_at?.toDate ? a.unlocked_at.toDate() : new Date(a.unlocked_at || 0);
      const dateB = b.unlocked_at?.toDate ? b.unlocked_at.toDate() : new Date(b.unlocked_at || 0);
      return dateB.getTime() - dateA.getTime();
    })
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex items-center justify-center p-0 lg:p-6">
      <div className="w-full lg:max-w-7xl lg:grid lg:grid-cols-[280px_1fr_320px] lg:gap-8 lg:items-stretch">
        
        {/* Left Column: Leaders List (Only visible on lg and above) */}
        <div className="hidden lg:flex lg:flex-col bg-slate-900 border border-slate-800/80 rounded-[28px] p-6 shadow-2xl relative overflow-hidden h-[760px]">
          <div className="absolute -top-12 -left-12 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl" />
          
          <div className="relative z-10 mb-4 pb-4 border-b border-slate-800/60">
            <h3 className="text-lg font-extrabold text-emerald-450 tracking-tight">我的排行榜</h3>
            <p className="text-xs text-slate-500 mt-1 flex items-center justify-between">
              <span>当前全服排名:</span>
              <span className="text-white font-black underline decoration-emerald-500/50">第 {userRank > 0 ? userRank : '--'} 名</span>
            </p>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto pr-1 relative z-10">
            {[...allUsers]
              .sort((a, b) => b.total_score - a.total_score)
              .map((u, idx) => {
                const isMe = u.id === userProfile.id;
                const rankNum = idx + 1;
                return (
                  <div 
                    key={u.id}
                    className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                      isMe 
                        ? 'bg-emerald-950/40 border-emerald-500/30 ring-1 ring-emerald-500/20' 
                        : 'bg-slate-800/40 border-transparent hover:border-slate-800/80'
                    }`}
                  >
                    <span className={`w-6 text-center font-mono text-sm font-extrabold ${
                      rankNum === 1 ? 'text-amber-400' : rankNum === 2 ? 'text-slate-300' : rankNum === 3 ? 'text-amber-700' : 'text-slate-500'
                    }`}>
                      {rankNum}
                    </span>
                    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-slate-700/80">
                      <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-bold truncate ${isMe ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {u.username} {isMe && '(我)'}
                      </div>
                      <div className="text-[10px] font-bold text-emerald-500 font-mono mt-0.5">
                        {u.total_score >= 0 ? `+${u.total_score}` : u.total_score} pts
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Center Column: Simulated Phone Frame Container (Collapses and scales gracefully) */}
        <div className="w-full max-w-md mx-auto bg-slate-900 min-h-screen lg:min-h-[760px] lg:h-[760px] flex flex-col shadow-2xl relative border-x border-slate-800/50 lg:rounded-[40px] lg:border-[12px] lg:border-slate-800 lg:overflow-hidden">
          
          {/* Simulated top speaker & notch for premium mobile feel */}
          <div className="hidden lg:flex h-5 bg-slate-800 items-center justify-center relative select-none">
            <div className="w-24 h-4 bg-slate-900 rounded-b-xl absolute top-0" />
          </div>

          {/* Top Header of applet */}
          <header className="px-6 py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-serif text-lg font-extrabold text-white">
                中
              </span>
              <div>
                <h1 className="text-base font-extrabold text-white tracking-wide">
                  麻将记分辅助
                </h1>
                <p className="text-[10px] text-slate-500">
                  {currentGameId ? '牌桌对冲算账中 • 实时同步' : '雀友大厅'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider">
                ONLINE
              </span>
            </div>
          </header>

          {/* Core Main dynamic view area */}
          <main className="flex-1 px-5 py-6 overflow-y-auto bg-slate-900/40">
            {currentGameId ? (
              <GameRoomView 
                gameId={currentGameId} 
                user={userProfile} 
                onExitGame={() => {
                  setManuallyExitedGameId(currentGameId);
                  setCurrentGameId(null);
                }} 
              />
            ) : activeTab === 'home' ? (
              <HomeTab 
                user={userProfile} 
                totalUsersCount={totalUsersCount} 
                userRank={userRank} 
                onEnterGame={(id) => {
                  if (id) {
                    setManuallyExitedGameId(null);
                  }
                  setCurrentGameId(id);
                }}
                activeGameId={realTimeActiveGameId}
              />
            ) : (
              <MyTab 
                user={userProfile} 
                allUsers={allUsers} 
                onLogout={handleLogout} 
              />
            )}
          </main>

          {/* Dynamic Navigation panel bottom (Render ONLY when not in an active game room) */}
          {!currentGameId && (
            <nav className="border-t border-slate-800/80 bg-slate-900/95 sticky bottom-0 z-30 px-6 py-3 flex items-center justify-around shadow-inner">
              <button
                onClick={() => setActiveTab('home')}
                className={`flex flex-col items-center gap-1.5 py-1 text-xs font-bold transition-all ${
                  activeTab === 'home' ? 'text-emerald-400 scale-105' : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <Home className={`w-5.5 h-5.5 transition-transform ${activeTab === 'home' ? 'text-emerald-500 scale-110' : 'text-slate-400'}`} />
                <span>大厅主页</span>
              </button>

              <button
                onClick={() => setActiveTab('my')}
                className={`flex flex-col items-center gap-1.5 py-1 text-xs font-bold transition-all ${
                  activeTab === 'my' ? 'text-emerald-400 scale-105' : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <UserIcon className={`w-5.5 h-5.5 transition-transform ${activeTab === 'my' ? 'text-emerald-500 scale-110' : 'text-slate-400'}`} />
                <span>我的荣誉</span>
              </button>
            </nav>
          )}
        </div>

        {/* Right Column: Latest Achievements Locked (Only visible on lg and above) */}
        <div className="hidden lg:flex lg:flex-col bg-slate-900 border border-slate-800/80 rounded-[28px] p-6 shadow-2xl relative overflow-hidden h-[760px]">
          <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl" />
          
          <div className="relative z-10 mb-4 pb-4 border-b border-slate-800/60">
            <h3 className="text-lg font-extrabold text-amber-500 tracking-tight">最新成就解锁</h3>
            <p className="text-xs text-slate-500 mt-1">本服全员实牌认证实录</p>
          </div>

          <div className="space-y-4 flex-1 overflow-y-auto pr-1 relative z-10 scrollbar-thin">
            {sortedGlobalAchievements.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 text-xs text-center p-4 border border-dashed border-slate-850 rounded-2xl">
                <span>暂无解锁成就</span>
                <span className="text-[10px] text-slate-700 mt-1">在牌局中拍照认证大胡极品牌型！</span>
              </div>
            ) : (
              sortedGlobalAchievements.map((item) => {
                const achUser = getAchievementUser(item.user_id);
                const dateVal = item.unlocked_at?.toDate ? item.unlocked_at.toDate() : new Date(item.unlocked_at || 0);
                const formattedDate = dateVal.toLocaleString('zh-CN', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div key={item.id} className="bg-slate-850 border border-slate-800/60 rounded-2xl p-4 shadow-md space-y-3 hover:border-slate-700 transition-all duration-200">
                    <div className="flex items-center justify-between">
                      <span className="bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 font-bold text-[9px] px-2 py-0.5 rounded-full">
                        {item.achievement_name} ({item.multiplier || 3}倍)
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {formattedDate}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full overflow-hidden border border-slate-700">
                        <img src={achUser.avatar_url} alt="" className="w-full h-full object-cover" />
                      </div>
                      <span className="text-xs text-slate-300 font-semibold truncate flex-1">{achUser.username}</span>
                    </div>

                    {item.photo_url ? (
                      <div className="h-28 w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 relative group/pic">
                        <img src={item.photo_url} alt="" className="w-full h-full object-cover group-hover/pic:scale-110 transition-transform duration-300" />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 to-transparent" />
                      </div>
                    ) : (
                      <div className="h-20 w-full bg-slate-950/40 rounded-xl flex items-center justify-center text-[10px] text-slate-600 border border-dashed border-slate-800">
                        无实拍预览
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
