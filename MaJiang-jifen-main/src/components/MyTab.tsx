import React, { useState, useEffect, useRef } from 'react';
import { 
  auth, 
  db, 
  handleFirestoreError, 
  OperationType,
  signInWithEmailAndPassword,
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  onSnapshot,
  doc,
  writeBatch
} from '../firebase';
import { UserProfile, GameHistoryRecord, Achievement, MAHJONG_HANDS, MahjongHand } from '../types';
import { compressImageToBase64, slice3x3GridToAvatars } from '../utils/imageCompressor';
import { 
  Trophy, 
  History, 
  Award, 
  LogOut, 
  Calendar, 
  ArrowRight, 
  ChevronRight, 
  X, 
  User, 
  Image as ImageIcon,
  Lock,
  Unlock,
  Sparkles,
  BookOpen,
  Upload,
  Camera,
  Loader2
} from 'lucide-react';

const getMahjongTileInfo = (handName: string) => {
  switch (handName) {
    case '碰碰胡':
      return { char: '碰', color: 'text-rose-500' };
    case '混一色':
      return { char: '混', color: 'text-indigo-400' };
    case '七小对':
      return { char: '对', color: 'text-purple-500' };
    case '清一色':
      return { char: '清', color: 'text-emerald-500' };
    case '一条龙':
      return { char: '龙', color: 'text-amber-500' };
    case '混一条龙':
      return { char: '条', color: 'text-orange-500' };
    case '豪华七对':
      return { char: '豪', color: 'text-yellow-500' };
    case '双豪七对':
      return { char: '双', color: 'text-pink-500' };
    case '三豪七对':
      return { char: '至', color: 'text-red-500' };
    case '小三元':
      return { char: '元', color: 'text-rose-400' };
    case '幺九':
      return { char: '幺', color: 'text-cyan-500' };
    case '清幺九':
      return { char: '九', color: 'text-emerald-600' };
    case '四暗刻':
      return { char: '暗', color: 'text-slate-500' };
    case '十三幺':
      return { char: '国', color: 'text-amber-500' };
    case '小四喜':
      return { char: '喜', color: 'text-cyan-400' };
    case '大三元':
      return { char: '中', color: 'text-red-600' };
    case '红孔雀':
      return { char: '雀', color: 'text-rose-600' };
    case '蓝一色':
      return { char: '蓝', color: 'text-blue-500' };
    case '绿一色':
      return { char: '发', color: 'text-emerald-600' };
    case '字一色':
      return { char: '字', color: 'text-sky-500' };
    case '大四喜':
      return { char: '风', color: 'text-red-500' };
    case '十八罗汉':
      return { char: '罗', color: 'text-yellow-600' };
    case '九莲宝灯':
      return { char: '灯', color: 'text-teal-400' };
    case '七星':
      return { char: '星', color: 'text-yellow-500' };
    case '地胡':
      return { char: '地', color: 'text-violet-500' };
    case '天胡':
      return { char: '天', color: 'text-amber-500' };
    default:
      return { char: '中', color: 'text-emerald-550' };
  }
};

interface MyTabProps {
  user: UserProfile;
  allUsers: UserProfile[];
  onLogout: () => void;
}

const DEFAULT_AVATARS = [
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Pepper',     // 活力冒险家
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Cookie',     // 睿智冒险少女
  'https://api.dicebear.com/7.x/lorelei/svg?seed=Aria',         // 甜美幸运少女
  'https://api.dicebear.com/7.x/lorelei/svg?seed=Coco',         // 酷帅策略酷哥
  'https://api.dicebear.com/7.x/bottts/svg?seed=Gizmo',         // 萌宠算账机器人
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Peanut',     // 快乐雀神表情
  'https://api.dicebear.com/7.x/big-smile/svg?seed=Sashi',       // 开怀大笑福星
  'https://api.dicebear.com/7.x/pixel-art/svg?seed=Lucky',       // 复古像素像素猫
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Midnight'     // 潮玩雀坛精英
];

export default function MyTab({ user, allUsers, onLogout }: MyTabProps) {
  const [history, setHistory] = useState<GameHistoryRecord[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [activeSubView, setActiveSubView] = useState<'main' | 'history' | 'achievements'>('main');
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [selectedLockedHand, setSelectedLockedHand] = useState<MahjongHand | null>(null);
  const [achievementFilter, setAchievementFilter] = useState<'all' | 'unlocked' | 'locked'>('all');

  // Other user inspection states (Task 2)
  const [clickedProfileUser, setClickedProfileUser] = useState<UserProfile | null>(null);
  const [clickedUserAchievements, setClickedUserAchievements] = useState<Achievement[]>([]);
  const [loadingClickedUserAchievements, setLoadingClickedUserAchievements] = useState(false);

  // Edit profile states (Task 4 & 5)
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editUsername, setEditUsername] = useState(user.username);
  const [editAvatar, setEditAvatar] = useState(user.avatar_url);
  const [mergePassword, setMergePassword] = useState('');
  const [needPasswordForMerge, setNeedPasswordForMerge] = useState(false);
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [slicedEditAvatars, setSlicedEditAvatars] = useState<string[]>([]);

  const editFileInputRef = useRef<HTMLInputElement>(null);
  const editGridFileRef = useRef<HTMLInputElement>(null);

  // Sync edits if global user shifts
  useEffect(() => {
    if (user) {
      setEditUsername(user.username);
      setEditAvatar(user.avatar_url);
    }
  }, [user]);

  // Handle default avatar loading and slicing
  const handleEditGridSlicing = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setEditLoading(true);
      setEditError('');
      const slices = await slice3x3GridToAvatars(file);
      setSlicedEditAvatars(slices);
      setEditAvatar(slices[0]);
    } catch (err) {
      console.error(err);
      setEditError('九宫格切分图加载失败，请确保格式正确！');
    } finally {
      setEditLoading(false);
    }
  };

  const processEditImageFile = async (file: File) => {
    try {
      setEditLoading(true);
      setEditError('');
      const compressed = await compressImageToBase64(file, 200, 600);
      setEditAvatar(compressed);
    } catch (err) {
      console.error(err);
      setEditError('图片压缩或加载失败，请换张图片试试！');
    } finally {
      setEditLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!editUsername.trim()) {
      setEditError('用户名不可以为空！');
      return;
    }
    setEditError('');
    setEditLoading(true);

    try {
      const cleanedNewName = editUsername.trim();
      const existingUser = allUsers.find(
        u => u.username.toLowerCase() === cleanedNewName.toLowerCase() && u.id !== user.id
      );

      if (existingUser) {
        if (!needPasswordForMerge) {
          setNeedPasswordForMerge(true);
          setEditLoading(false);
          setEditError(`用户名 "${cleanedNewName}" 已被其他玩家占用！重新输入该账户的密码作为凭据即可将两个账户的积分与成就数据完全合并！`);
          return;
        }

        if (!mergePassword) {
          setEditError('请输入目标账号的核验密码！');
          setEditLoading(false);
          return;
        }

        const targetEmail = `${cleanedNewName.toLowerCase()}@mahjong-app.com`;
        let credentialB;
        try {
          credentialB = await signInWithEmailAndPassword(auth, targetEmail, mergePassword);
        } catch (authErr) {
          console.error(authErr);
          setEditError('密码不正确或合并验证失败，请重新核验');
          setEditLoading(false);
          return;
        }

        const uidB = credentialB.user.uid;
        const uidA = user.id;

        if (uidA === uidB) {
          setEditError('不能与当前正在登录的账号完全一致！');
          setEditLoading(false);
          return;
        }

        const mergedScore = (existingUser.total_score || 0) + (user.total_score || 0);

        const achQuery = query(collection(db, 'achievements'), where('user_id', '==', uidA));
        const historyQuery = query(collection(db, 'game_history'), where('user_id', '==', uidA));

        const [achSnap, histSnap] = await Promise.all([
          getDocs(achQuery),
          getDocs(historyQuery)
        ]);

        const batch = writeBatch(db);

        // Update target user
        const userDocB = doc(db, 'users', uidB);
        batch.update(userDocB, {
          total_score: mergedScore,
          avatar_url: editAvatar
        });

        // Delete legacy profile
        const userDocA = doc(db, 'users', uidA);
        batch.delete(userDocA);

        // Migrate achievements
        achSnap.forEach((docItem) => {
          batch.update(docItem.ref, {
            user_id: uidB
          });
        });

        // Migrate history elements
        histSnap.forEach((docItem) => {
          batch.update(docItem.ref, {
            user_id: uidB
          });
        });

        await batch.commit();

        alert(`合并成功！账号 ${user.username} 的积分和成就已全部合并合并到 ${cleanedNewName} 下，合意大圆满！系统现已切换该登录。`);
        setShowEditProfileModal(false);
        window.location.reload();

      } else {
        const userDocRef = doc(db, 'users', user.id);
        const batch = writeBatch(db);
        batch.update(userDocRef, {
          username: cleanedNewName,
          avatar_url: editAvatar
        });
        await batch.commit();

        setShowEditProfileModal(false);
        setEditError('');
        alert('个人信息已成功更新！');
      }
    } catch (err: any) {
      console.error(err);
      setEditError(err.message || '更新个人资料失败，请重试');
    } finally {
      setEditLoading(false);
    }
  };

  useEffect(() => {
    if (!clickedProfileUser) {
      setClickedUserAchievements([]);
      return;
    }
    setLoadingClickedUserAchievements(true);
    const q = query(
      collection(db, 'achievements'),
      where('user_id', '==', clickedProfileUser.id),
      orderBy('unlocked_at', 'desc')
    );
    getDocs(q).then((snap) => {
      const list: Achievement[] = [];
      snap.forEach((d) => {
        list.push(d.data() as Achievement);
      });
      setClickedUserAchievements(list);
      setLoadingClickedUserAchievements(false);
    }).catch((err) => {
      console.error(err);
      setLoadingClickedUserAchievements(false);
    });
  }, [clickedProfileUser]);

  // 1. Fetch History records
  useEffect(() => {
    const q = query(
      collection(db, 'game_history'),
      where('user_id', '==', user.id),
      orderBy('ended_at', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docsList: GameHistoryRecord[] = [];
      snapshot.forEach((doc) => {
        docsList.push({ id: doc.id, ...doc.data() } as GameHistoryRecord);
      });
      setHistory(docsList);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'game_history');
    });

    return () => unsubscribe();
  }, [user.id]);

  // 2. Fetch Achievements
  useEffect(() => {
    const q = query(
      collection(db, 'achievements'),
      where('user_id', '==', user.id),
      orderBy('unlocked_at', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Achievement[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Achievement);
      });
      setAchievements(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'achievements');
    });

    return () => unsubscribe();
  }, [user.id]);

  // 3. Compute Mini adjacent Leaderboard
  // Sort all users by total score descending to get ranks
  const sortedUsers = [...allUsers].sort((a, b) => b.total_score - a.total_score);
  const myIndex = sortedUsers.findIndex(u => u.id === user.id);
  
  let adjacentUsers: { rank: number; profile: UserProfile }[] = [];
  if (myIndex !== -1) {
    // Generate rank indices
    const startIdx = Math.max(0, myIndex - 1);
    const endIdx = Math.min(sortedUsers.length - 1, myIndex + 1);
    
    // Ensure we try to show 3 rows where possible
    let adjustedStart = startIdx;
    let adjustedEnd = endIdx;
    if (myIndex === 0 && sortedUsers.length > 2) {
      adjustedEnd = 2;
    } else if (myIndex === sortedUsers.length - 1 && sortedUsers.length > 2) {
      adjustedStart = sortedUsers.length - 3;
    }

    for (let i = adjustedStart; i <= adjustedEnd; i++) {
      if (sortedUsers[i]) {
        adjacentUsers.push({ rank: i + 1, profile: sortedUsers[i] });
      }
    }
  }

  const formatTimestamp = (ts: any) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('zh-CN', { 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="space-y-6">
      {/* -------------------- MAIN SUBVIEW -------------------- */}
      {activeSubView === 'main' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Detailed Account Stats Header */}
          <div className="bg-slate-800 rounded-3xl p-6 border border-slate-705/50 shadow-lg flex flex-col items-center text-center relative overflow-hidden">
            <button 
              onClick={onLogout}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-300 bg-slate-900/40 hover:bg-slate-900/60 p-2.5 rounded-full transition-all text-xs flex items-center gap-1"
              title="退出登录"
            >
              <LogOut className="w-4 h-4 text-slate-400" />
            </button>

            <div className="w-20 h-20 rounded-full border-4 border-slate-700 overflow-hidden shadow-md">
              <img 
                src={user.avatar_url} 
                alt={user.username} 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
              />
            </div>

            <h2 className="text-xl font-bold text-white mt-3">{user.username}</h2>
            <p className="text-xs text-slate-500 mt-0.5">普通雀友 • 已登录</p>

            <button 
              onClick={() => {
                setEditUsername(user.username);
                setEditAvatar(user.avatar_url);
                setNeedPasswordForMerge(false);
                setMergePassword('');
                setEditError('');
                setShowEditProfileModal(true);
              }}
              className="mt-3 px-4 py-1.5 bg-slate-700/50 hover:bg-slate-700 hover:text-emerald-400 border border-slate-600/40 hover:border-emerald-500/30 text-xs text-slate-350 font-bold rounded-full transition-all duration-200 cursor-pointer shadow-sm active:scale-95"
            >
              修改个人信息
            </button>

            <div className="grid grid-cols-3 gap-3 w-full mt-6 pt-6 border-t border-slate-700/50">
              <div className="text-center">
                <span className="text-2xl font-black text-emerald-400 font-mono block">
                  {user.total_score}
                </span>
                <span className="text-[10px] text-slate-400 tracking-wider">总积分</span>
              </div>
              <div className="text-center border-x border-slate-700/40">
                <span className="text-2xl font-black text-cyan-400 font-mono block">
                  {history.length}
                </span>
                <span className="text-[10px] text-slate-400 tracking-wider">总对局</span>
              </div>
              <div className="text-center">
                <span className="text-2xl font-black text-amber-400 font-mono block">
                  {achievements.length}
                </span>
                <span className="text-[10px] text-slate-400 tracking-wider">成就数</span>
              </div>
            </div>
          </div>

          {/* Adjacent Leaderboard widget */}
          <div className="bg-slate-800 rounded-3xl p-5 border border-slate-700/50 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-200">全服积分相邻榜</h3>
            </div>
            
            <div className="space-y-2.5">
              {adjacentUsers.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-2">暂无排名数据</p>
              ) : (
                adjacentUsers.map((item) => {
                  const isMe = item.profile.id === user.id;
                  return (
                    <div 
                      key={item.profile.id}
                      onClick={() => {
                        if (!isMe) {
                          setClickedProfileUser(item.profile);
                        }
                      }}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                        isMe 
                          ? 'bg-emerald-950/40 border-emerald-500/30 ring-1 ring-emerald-500/20' 
                          : 'bg-slate-900/40 border-slate-800/40 hover:bg-slate-850 hover:border-slate-700 text-slate-355 hover:text-slate-150 cursor-pointer active:scale-[0.99] font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-6 text-center font-mono text-sm font-extrabold ${
                          item.rank === 1 ? 'text-amber-400' : item.rank === 2 ? 'text-slate-300' : item.rank === 3 ? 'text-amber-700' : 'text-slate-500'
                        }`}>
                          {item.rank}
                        </span>
                        <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-slate-700">
                          <img src={item.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                        </div>
                        <span className={`text-sm font-semibold truncate ${isMe ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {item.profile.username} {isMe && '(我)'}
                        </span>
                      </div>
                      <span className={`font-mono font-bold text-sm ${isMe ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {item.profile.total_score >= 0 ? `+${item.profile.total_score}` : item.profile.total_score}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setActiveSubView('history')}
              id="shortcut-history"
              className="bg-slate-800 hover:bg-slate-750 border border-slate-700/50 p-5 rounded-2xl text-left shadow-md flex flex-col justify-between h-28 relative group transition-all duration-200"
            >
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <History className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex items-end justify-between mt-auto">
                <div>
                  <span className="text-sm font-bold text-slate-100 block">历史牌局</span>
                  <span className="text-[10px] text-slate-500">{history.length}个记录</span>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            <button
              onClick={() => setActiveSubView('achievements')}
              id="shortcut-achievements"
              className="bg-slate-800 hover:bg-slate-750 border border-slate-700/50 p-5 rounded-2xl text-left shadow-md flex flex-col justify-between h-28 relative group transition-all duration-200"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Award className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex items-end justify-between mt-auto">
                <div>
                  <span className="text-sm font-bold text-slate-100 block">解锁成就</span>
                  <span className="text-[10px] text-slate-500">{achievements.length}块勋章</span>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          </div>

          {/* Logout button container */}
          <div className="pt-2">
            <button
              onClick={onLogout}
              className="w-full bg-slate-800 hover:bg-rose-950/20 border border-slate-705/50 hover:border-rose-500/30 text-rose-400 font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.99]"
            >
              <LogOut className="w-4 h-4 text-rose-500" />
              <span>退出当前账号登录</span>
            </button>
          </div>
        </div>
      )}

      {/* -------------------- HISTORY DETAILS SUBVIEW -------------------- */}
      {activeSubView === 'history' && (
        <div className="space-y-4 animate-slideUp">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-bold text-white">历史牌局记录</h2>
            </div>
            <button
              onClick={() => setActiveSubView('main')}
              className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-full text-slate-400 transition-colors"
            >
              返回我的
            </button>
          </div>

          <div className="space-y-3.5">
            {history.length === 0 ? (
              <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700/50 text-center text-slate-500 text-sm">
                您还没有完成的牌局记录，赶紧开一局吧！
              </div>
            ) : (
              history.map((record) => {
                const isWinner = record.score > 0;
                return (
                  <div 
                    key={record.id}
                    className="bg-slate-800 rounded-2xl p-4 border border-slate-700/40 shadow-md space-y-3"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-700/30">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatTimestamp(record.ended_at)}</span>
                        <span className="bg-slate-700 px-1.5 py-0.5 rounded font-mono">
                          房号: {record.game_code || '----'}
                        </span>
                      </div>
                      <span className={`text-sm font-bold font-mono px-2.5 py-0.5 rounded-full ${
                        isWinner 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : record.score < 0 
                            ? 'bg-rose-500/10 text-rose-400' 
                            : 'bg-slate-700 text-slate-400'
                      }`}>
                        {record.score >= 0 ? `+${record.score}` : record.score}
                      </span>
                    </div>

                    {/* Opponents and teammates final scores */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                        同桌结算明细
                      </p>
                      
                      <div className="grid grid-cols-2 gap-2">
                        {record.players && record.players.map((p, idx) => {
                          const isSelf = p.username === user.username;
                          return (
                            <div 
                              key={idx}
                              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs ${
                                isSelf ? 'bg-emerald-950/20 border border-emerald-900/30' : 'bg-slate-900/40'
                              }`}
                            >
                              <span className={`truncate mr-2 ${isSelf ? 'text-emerald-400 font-bold' : 'text-slate-300'}`}>
                                {p.username}
                              </span>
                              <span className={`font-mono font-bold shrink-0 ${
                                p.score > 0 ? 'text-emerald-400' : p.score < 0 ? 'text-rose-400' : 'text-slate-400'
                              }`}>
                                {p.score >= 0 ? `+${p.score}` : p.score}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* -------------------- ACHIEVEMENTS SUBVIEW -------------------- */}
      {activeSubView === 'achievements' && (() => {
        const unlockedCount = MAHJONG_HANDS.reduce((acc, hand) => {
          return acc + (achievements.some(ach => ach.achievement_name === hand.name) ? 1 : 0);
        }, 0);

        const filteredHands = MAHJONG_HANDS.filter(hand => {
          const isUnlocked = achievements.some(ach => ach.achievement_name === hand.name);
          if (achievementFilter === 'unlocked') return isUnlocked;
          if (achievementFilter === 'locked') return !isUnlocked;
          return true;
        });

        return (
          <div className="space-y-5 animate-slideUp">
            {/* Header controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-extrabold text-white">高光荣誉成就墙</h2>
              </div>
              <button
                onClick={() => setActiveSubView('main')}
                className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-full text-slate-400 transition-colors"
              >
                返回我的
              </button>
            </div>

            {/* Stats Dashboard Card */}
            <div className="bg-slate-800 rounded-3xl p-5 border border-slate-700/50 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between mb-3.5">
                <div>
                  <span className="text-[10px] text-slate-500 block font-semibold uppercase tracking-wider">勋章收集进度</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-2xl font-black text-amber-400 font-mono">{unlockedCount}</span>
                    <span className="text-slate-500 text-xs">/ {MAHJONG_HANDS.length} 个已解锁</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block font-semibold">收集率</span>
                  <span className="text-sm font-bold text-emerald-400 font-mono">{Math.round((unlockedCount / MAHJONG_HANDS.length) * 100)}%</span>
                </div>
              </div>
              {/* Progress Bar Container */}
              <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${(unlockedCount / MAHJONG_HANDS.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Filter pills */}
            <div className="flex gap-2 p-1 bg-slate-900/60 border border-slate-850 rounded-2xl">
              {(['all', 'unlocked', 'locked'] as const).map((filter) => {
                const isActive = achievementFilter === filter;
                const label = filter === 'all' 
                  ? '全部' 
                  : filter === 'unlocked' 
                    ? '已获得' 
                    : '探索未锁';
                const count = filter === 'all'
                  ? MAHJONG_HANDS.length
                  : filter === 'unlocked'
                    ? unlockedCount
                    : MAHJONG_HANDS.length - unlockedCount;

                return (
                  <button
                    key={filter}
                    onClick={() => setAchievementFilter(filter)}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                      isActive 
                        ? 'bg-slate-805 text-amber-400 shadow-md border border-slate-700/40' 
                        : 'text-slate-400 hover:text-slate-350'
                    }`}
                  >
                    <span>{label}</span>
                    <span className="text-[10px] opacity-70 font-mono ml-1">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Grid display list of 26 medals */}
            <div className="grid grid-cols-2 gap-3.5 pb-8">
              {filteredHands.map((hand) => {
                const matchingAchievement = achievements.find(ach => ach.achievement_name === hand.name);
                const isUnlocked = !!matchingAchievement;
                const tileInfo = getMahjongTileInfo(hand.name);

                return (
                  <div 
                    key={hand.name}
                    onClick={() => {
                      if (isUnlocked && matchingAchievement) {
                        setSelectedAchievement(matchingAchievement);
                      } else {
                        setSelectedLockedHand(hand);
                      }
                    }}
                    className={`relative rounded-3xl border p-4 flex flex-col items-center text-center transition-all duration-300 cursor-pointer select-none group ${
                      isUnlocked 
                        ? 'bg-gradient-to-b from-slate-800 to-slate-850 border-emerald-500/30 shadow-[0_4px_12px_rgba(16,185,129,0.06)] hover:border-emerald-500/50 hover:shadow-[0_8px_24px_rgba(16,185,129,0.12)] hover:scale-[1.03]' 
                        : 'bg-slate-900/40 border-slate-850/80 hover:border-slate-800 opacity-60 hover:opacity-85 hover:scale-[1.02]'
                    }`}
                  >
                    {/* Lock unlock corner badge */}
                    <div className="absolute top-3 right-3">
                      {isUnlocked ? (
                        <span className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                          <Unlock className="w-2.5 h-2.5" />
                        </span>
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-slate-850 flex items-center justify-center border border-slate-800 text-slate-650">
                          <Lock className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>

                    {/* 3D Mahjong Tile Design */}
                    <div className="relative my-2.5 pt-1 shrink-0">
                      {isUnlocked && (
                        <div className="absolute inset-0 bg-emerald-500/15 rounded-xl blur-md scale-110" />
                      )}
                      
                      <div className={`w-11 h-15 bg-slate-10 border-t border-l border-slate-200/90 rounded-lg shadow-[1.5px_2px_0_#059669,3px_4px_0_#10b981] flex flex-col items-center justify-center relative select-none transform transition-transform group-hover:rotate-6 duration-300 ${
                        !isUnlocked ? 'grayscale brightness-[0.6] opacity-50 shadow-[1.5px_2px_0_#475569,3px_4px_0_#64748b] bg-slate-800' : 'bg-slate-50'
                      }`}>
                        <span className={`font-serif text-xl font-extrabold ${isUnlocked ? tileInfo.color : 'text-slate-500'}`}>
                          {tileInfo.char}
                        </span>
                      </div>
                    </div>

                    {/* Multiplier Tag badge */}
                    <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full mt-1.5 border ${
                      isUnlocked 
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                        : 'bg-slate-850 text-slate-500 border-slate-800/80'
                    }`}>
                      {hand.multiplier}倍番
                    </span>

                    {/* Title and rules */}
                    <h4 className={`text-xs font-extrabold mt-3 truncate w-full ${isUnlocked ? 'text-slate-150' : 'text-slate-500'}`}>
                      {hand.name}
                    </h4>
                    
                    <p className={`text-[9px] leading-relaxed mt-1 line-clamp-2 w-full max-w-[120px] ${isUnlocked ? 'text-slate-400' : 'text-slate-600'}`}>
                      {hand.description}
                    </p>

                    {/* Footer text */}
                    <div className="mt-3.5 pt-2.5 border-t border-slate-805 w-full flex items-center justify-center text-[9px] font-medium">
                      {isUnlocked && matchingAchievement ? (
                        <span className="text-emerald-450 font-bold flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5 text-emerald-400 animate-spin" />
                          <span>点击查看手牌照片</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 flex items-center gap-0.5 group-hover:text-amber-400 transition-colors">
                          <BookOpen className="w-2.5 h-2.5 text-slate-650" />
                          <span>查看胡牌攻略</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* -------------------- LIGHTBOX DIALOG CARD FOR SELECTED ACHIEVEMENT -------------------- */}
      {selectedAchievement && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-850 bg-gradient-to-b from-slate-800 to-slate-900 w-full max-w-sm rounded-[24px] border border-slate-700/80 shadow-2xl overflow-hidden relative animate-zoomIn flex flex-col">
            
            {/* Top decorative badge */}
            <div className="bg-amber-550/95 py-1 flex items-center justify-center text-[10px] font-bold text-slate-950 uppercase tracking-widest">
              ★ 雀神至尊荣誉卡 ★
            </div>

            {/* Main content body */}
            <div className="p-6 flex-1 flex flex-col space-y-6">
              {/* Photo Background frame */}
              <div id="capture-achievement-badge" className="relative h-64 rounded-xl overflow-hidden shadow-inner border border-slate-700/60 bg-black flex items-center justify-center">
                {selectedAchievement.photo_url ? (
                  <img 
                    src={selectedAchievement.photo_url} 
                    alt="Achievement real file" 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <ImageIcon className="w-12 h-12 text-slate-700" />
                )}
                
                {/* Visual card badge label in center bottom */}
                <div className="absolute bottom-4 left-4 right-4 bg-slate-950/70 backdrop-blur" style={{ padding: '12px 16px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-amber-500/30">
                      <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="font-extrabold text-[13px] text-amber-400">
                        {selectedAchievement.achievement_name}
                      </div>
                      <div className="text-[10px] text-slate-300 font-medium">
                        雀友 {user.username} 自豪解锁
                      </div>
                    </div>
                    <div className="ml-auto text-right">
                      <div className="text-[10px] text-slate-400 font-mono">
                        倍数: x{selectedAchievement.multiplier || 3}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Back card info list */}
              <div className="space-y-3 bg-slate-900/50 p-4 rounded-xl border border-slate-800 text-xs text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">解锁牌局：</span>
                  <span className="font-semibold text-slate-300">线下雀林争霸场</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">解锁日期：</span>
                  <span className="font-mono text-slate-300">{formatTimestamp(selectedAchievement.unlocked_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">荣耀描述：</span>
                  <span className="text-amber-400 font-semibold">自证极品胡牌，雀神之神！</span>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="p-4 bg-slate-900/40 border-t border-slate-800 flex justify-center">
              <button
                type="button"
                onClick={() => setSelectedAchievement(null)}
                className="w-full bg-slate-700 hover:bg-slate-650 text-white font-semibold py-3 rounded-xl text-sm transition-colors cursor-pointer"
              >
                收下荣誉
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedLockedHand && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 w-full max-w-sm rounded-[24px] border border-slate-700/85 shadow-2xl overflow-hidden relative animate-zoomIn flex flex-col">
            
            {/* Top decorative badge */}
            <div className="bg-slate-700 py-1.5 flex items-center justify-center text-[10px] font-extrabold text-slate-300 uppercase tracking-widest gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>番种极品图鉴 • 未锁定解锁</span>
            </div>

            {/* Main content body */}
            <div className="p-6 flex-1 flex flex-col space-y-5 items-center text-center">
              
              {/* 3D Mahjong tile mockup in center */}
              <div className="relative py-4">
                <div className="absolute inset-0 bg-slate-500/10 rounded-xl blur-lg scale-125" />
                <div className="w-16 h-22 bg-slate-50 border-t border-l border-slate-200 rounded-xl shadow-[3px_3.5px_0_#475569,6px_7px_0_#64748b] flex flex-col items-center justify-center relative select-none transform rotate-3">
                  <span className={`font-serif text-3.5xl font-black ${getMahjongTileInfo(selectedLockedHand.name).color} opacity-75`}>
                    {getMahjongTileInfo(selectedLockedHand.name).char}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="font-extrabold text-xl text-slate-200">
                  {selectedLockedHand.name}
                </h3>
                <span className="inline-block bg-slate-800/80 border border-slate-700/55 text-amber-400 px-3 py-1 rounded-full text-xs font-bold font-mono">
                  结算倍数: x{selectedLockedHand.multiplier} 倍
                </span>
              </div>

              {/* Description and rules */}
              <div className="w-full bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 text-xs space-y-4 text-left">
                <div>
                  <h5 className="font-bold text-amber-500 mb-1">番种规则</h5>
                  <p className="text-slate-300 leading-relaxed text-[11px] bg-slate-950/40 p-2.5 rounded-lg border border-slate-850">
                    {selectedLockedHand.description}
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-emerald-400 mb-1">如何达成解锁？</h5>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    在实时拼杀的牌桌上，打出或自摸符合该番型的胡牌。本局雀友合评一致后，在牌局界面点击对应玩家右上角 <span className="text-amber-400 font-bold">🏆 认证</span> 标签，实地拍下手牌靓照并点击认定，即可在这里高光点亮，并永久载入排行榜荣耀史册！
                  </p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="p-4 bg-slate-900/40 border-t border-slate-800 flex justify-center">
              <button
                type="button"
                onClick={() => setSelectedLockedHand(null)}
                className="w-full bg-slate-700 hover:bg-slate-650 text-white font-semibold py-3 rounded-xl text-sm transition-colors cursor-pointer"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- OTHER PLAYER PROFILE MODAL -------------------- */}
      {clickedProfileUser && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 w-full max-w-sm rounded-[24px] border border-slate-700/85 shadow-2xl overflow-hidden relative animate-zoomIn flex flex-col h-[85vh]">
            
            {/* Modal Header */}
            <div className="p-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-slate-200">
                <Trophy className="w-5 h-5 text-amber-500 animate-pulse" />
                <span className="font-bold text-sm">雀友主页</span>
              </div>
              <button 
                type="button"
                onClick={() => setClickedProfileUser(null)}
                className="text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-900/60 p-2 rounded-full transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Profile Detail Block */}
            <div className="p-6 flex flex-col items-center border-b border-slate-800/80 bg-slate-850/50 shrink-0">
              <div className="w-20 h-20 rounded-full border-4 border-slate-705 overflow-hidden shadow-md">
                <img 
                  src={clickedProfileUser.avatar_url || ''} 
                  alt={clickedProfileUser.username} 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                />
              </div>
              <h3 className="text-lg font-black text-slate-100 mt-3">{clickedProfileUser.username}</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">雀林群豪 • 单独查看</p>

              <div className="mt-4 bg-slate-950/80 px-4 py-2 border border-slate-800/80 rounded-2xl flex items-center gap-2 shadow-inner">
                <span className="text-[10px] uppercase text-slate-500 tracking-wider font-bold">总积分阶梯</span>
                <span className="font-mono font-black text-emerald-450 text-sm">
                  {clickedProfileUser.total_score >= 0 ? `+${clickedProfileUser.total_score}` : clickedProfileUser.total_score}
                </span>
              </div>
            </div>

            {/* Achievements List Scrolling Container */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4 bg-slate-900/20">
              <h4 className="text-xs font-bold text-slate-450 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                <Award className="w-4 h-4 text-amber-500 animate-spin" style={{ animationDuration: '6s' }} />
                <span>已亮勋章 ({clickedUserAchievements.length})</span>
              </h4>

              {loadingClickedUserAchievements ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                  <span className="text-[10px] font-bold text-slate-500">飞鸽传书获取雀谱勋章中...</span>
                </div>
              ) : clickedUserAchievements.length === 0 ? (
                <div className="text-center py-10 bg-slate-900/60 border border-slate-850 rounded-2xl p-4 flex flex-col items-center">
                  <span className="text-3xl filter grayscale">🀄</span>
                  <p className="text-[10px] text-slate-500 mt-2.5 leading-relaxed max-w-[200px]">该雀友十分低调，暂无在新版对局上斩获任何极品认证手牌。来日方长！</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 pb-4">
                  {clickedUserAchievements.map((ach) => {
                    const tileInfo = getMahjongTileInfo(ach.achievement_name);
                    const handInfo = MAHJONG_HANDS.find(h => h.name === ach.achievement_name);
                    return (
                      <div 
                        key={ach.id}
                        onClick={() => setSelectedAchievement(ach)}
                        className="p-3.5 bg-slate-850 hover:bg-slate-800 border border-emerald-500/10 hover:border-emerald-500/30 rounded-2xl flex flex-col items-center text-center transition-all cursor-pointer group active:scale-[0.97] shadow-sm hover:shadow-md"
                      >
                        <div className="w-9 h-12 bg-slate-50 rounded-lg shadow-[1.5px_2px_0_#10b981] border-l border-t border-slate-200 flex flex-col items-center justify-center relative transform transition-transform group-hover:rotate-6">
                          <span className={`font-serif text-sm font-extrabold ${tileInfo.color}`}>
                            {tileInfo.char}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-100 mt-2 truncate w-full">{ach.achievement_name}</span>
                        <span className="text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full mt-1.5 font-mono">
                          x{ach.multiplier}倍番
                        </span>
                        <p className="text-[8px] text-slate-500 mt-1.5 line-clamp-1 w-full">{handInfo?.description}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Back action */}
            <div className="p-4 bg-slate-950/40 border-t border-slate-800/80 flex justify-center shrink-0">
              <button
                type="button"
                onClick={() => setClickedProfileUser(null)}
                className="w-full bg-slate-700 hover:bg-slate-650 text-white font-semibold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
              >
                关闭返回
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- EDIT PROFILE & MERGER MODAL -------------------- */}
      {showEditProfileModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 w-full max-w-sm rounded-[24px] border border-slate-700/85 shadow-2xl overflow-hidden relative animate-zoomIn flex flex-col h-[85vh]">
            
            {/* Modal Header */}
            <div className="p-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-slate-200">
                <User className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm">修改个人信息</span>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setShowEditProfileModal(false);
                  setNeedPasswordForMerge(false);
                  setMergePassword('');
                  setEditError('');
                }}
                className="text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-900/60 p-2 rounded-full transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body Scroll */}
            <div className="p-6 flex-1 overflow-y-auto space-y-5 bg-slate-900/10">
              
              {/* Profile Photo Display & Upload Trigger */}
              <div className="flex flex-col items-center">
                <div className="relative w-20 h-20 rounded-full border-4 border-slate-700 overflow-hidden shadow-md group">
                  <img 
                    src={editAvatar} 
                    alt="Edit preview" 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all text-[10px] text-white font-medium cursor-pointer"
                    onClick={() => editFileInputRef.current?.click()}
                  >
                    <Camera className="w-4 h-4 mb-1" />
                    <span>自定义上传</span>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => editFileInputRef.current?.click()}
                  className="text-[10px] text-slate-400 hover:text-emerald-450 underline mt-2 font-bold cursor-pointer transition-colors"
                >
                  更换自定义头像
                </button>
                <input 
                  type="file"
                  ref={editFileInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) processEditImageFile(file);
                  }}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              {/* Default Avatars & 3x3 Slicer inside Edit Modal */}
              <div className="bg-slate-950/65 p-3 rounded-2xl border border-slate-800/40 flex flex-col gap-2 shadow-inner">
                <div className="flex items-center justify-between w-full px-1">
                  <span className="text-[10px] text-slate-400 font-bold">选用默认/切图头像:</span>
                  <button
                    type="button"
                    onClick={() => editGridFileRef.current?.click()}
                    className="text-[9px] bg-slate-800 hover:bg-slate-750 text-emerald-450 border border-emerald-500/30 px-2 py-0.5 rounded transition-all cursor-pointer font-extrabold shadow-sm"
                    title="如果您有一张3x3头像合照图，可以点击这里实现一键自动切分成9张独立靓图选择！"
                  >
                    ⚡ 导入九宫格切图
                  </button>
                  <input 
                    type="file"
                    ref={editGridFileRef}
                    onChange={handleEditGridSlicing}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
                <div className="grid grid-cols-5 gap-2 w-full mt-1">
                  {(slicedEditAvatars.length > 0 ? slicedEditAvatars : DEFAULT_AVATARS).map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setEditAvatar(url)}
                      className={`w-8 h-8 rounded-xl overflow-hidden border-2 transition-all hover:scale-110 shrink-0 ${
                        editAvatar === url ? 'border-emerald-400 scale-105 shadow-md shadow-emerald-500/20' : 'border-slate-850 hover:border-slate-700'
                      }`}
                    >
                      <img src={url} alt="preset avatar" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Username field */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">用户名（登入口令）</label>
                <input 
                  type="text"
                  value={editUsername}
                  onChange={(e) => {
                    setEditUsername(e.target.value);
                    if (needPasswordForMerge) {
                      setNeedPasswordForMerge(false);
                      setMergePassword('');
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-emerald-505/55 focus:ring-1 focus:ring-emerald-500/30 transition-all font-semibold"
                  placeholder="修改您的登入口令"
                />
              </div>

              {/* Account merger prompt */}
              {needPasswordForMerge && (
                <div className="bg-amber-950/20 border border-amber-500/30 p-4 rounded-xl space-y-3 animate-fadeIn">
                  <p className="text-[10px] leading-relaxed text-amber-300 font-medium">
                    ⚠️ <strong>麻将馆合籍提示</strong><br />
                    检测到雀友 <strong>{editUsername.trim()}</strong> 口令已被他人使用。<br />
                    输入该人设置的密码进行身份认证。合流将把 <strong>您自己当前的积分和成就，百分百完整融入到目标账号</strong> 下。合流后，这架分身会被回收销毁，并退出当前。
                  </p>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400">请输入旧主的认证密码：</label>
                    <input 
                      type="password"
                      value={mergePassword}
                      onChange={(e) => setMergePassword(e.target.value)}
                      className="w-full bg-slate-950 border border-amber-500/20 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500/60 transition-all font-mono"
                      placeholder="验证密码执行账册合并"
                    />
                  </div>
                </div>
              )}

              {/* Errors Block */}
              {editError && (
                <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded-xl text-[10px] text-rose-300 leading-relaxed font-bold">
                  {editError}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-900/60 border-t border-slate-800 flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowEditProfileModal(false);
                  setNeedPasswordForMerge(false);
                  setMergePassword('');
                  setEditError('');
                }}
                disabled={editLoading}
                className="flex-1 py-3 text-xs bg-slate-805 hover:bg-slate-750 text-slate-400 border border-slate-750 rounded-xl font-bold transition-all hover:text-slate-250 cursor-pointer disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={editLoading}
                className="flex-1 py-3 text-xs bg-gradient-to-r from-emerald-500 to-teal-550 hover:from-emerald-450 hover:to-teal-500 text-white rounded-xl font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-950/50 disabled:opacity-50"
              >
                {editLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />}
                <span>{needPasswordForMerge ? '确认合体合并' : '确认修改'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
