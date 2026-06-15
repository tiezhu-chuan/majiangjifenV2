import React, { useState, useEffect } from 'react';
import { 
  db, 
  auth, 
  handleFirestoreError, 
  OperationType,
  collection, 
  query, 
  where, 
  getDocs, 
  setDoc, 
  doc, 
  getDoc,
  onSnapshot,
  orderBy
} from '../firebase';
import { UserProfile, GameRoom, GamePlayer } from '../types';
import { 
  Play, 
  LogIn, 
  Activity, 
  Trophy, 
  ArrowRight, 
  X, 
  Loader2, 
  AlertCircle 
} from 'lucide-react';

interface HomeTabProps {
  user: UserProfile;
  totalUsersCount: number;
  userRank: number;
  onEnterGame: (gameId: string) => void;
  activeGameId: string | null;
}

export default function HomeTab({ 
  user, 
  totalUsersCount, 
  userRank, 
  onEnterGame, 
  activeGameId 
}: HomeTabProps) {
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  // Generate a random 4-digit room code and verify its uniqueness among active rooms
  const generateUniqueRoomCode = async (): Promise<string> => {
    let attempts = 0;
    while (attempts < 20) {
      const candidateCode = Math.floor(1000 + Math.random() * 9000).toString();
      
      // Check if this code is already used by an active game row
      const q = query(
        collection(db, 'games'), 
        where('room_code', '==', candidateCode),
        where('status', '==', 'active')
      );
      
      let snap;
      try {
        snap = await getDocs(q);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'games');
      }

      if (snap && snap.empty) {
        return candidateCode;
      }
      attempts++;
    }
    return Math.floor(1000 + Math.random() * 9000).toString(); // fallback
  };

  const handleCreateRoom = async () => {
    if (createLoading) return;
    setCreateLoading(true);
    try {
      const freshCode = await generateUniqueRoomCode();
      const newGameId = doc(collection(db, 'games')).id;

      // 1. Create Game Document
      const gameRef = doc(db, 'games', newGameId);
      const gameData: GameRoom = {
        id: newGameId,
        room_code: freshCode,
        owner_id: user.id,
        status: 'active',
        created_at: new Date()
      };
      
      await setDoc(gameRef, gameData);

      // 2. Add creator to default players Subcollection
      const playerRef = doc(db, 'games', newGameId, 'players', user.id);
      const playerData: GamePlayer = {
        user_id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
        current_score: 0
      };

      await setDoc(playerRef, playerData);

      // 3. Move to game room page
      onEnterGame(newGameId);
    } catch (err) {
      console.error('Create room err: ', err);
      alert('开房失败，请重试');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    const typedCode = roomCodeInput.trim();
    if (typedCode.length !== 4 || isNaN(Number(typedCode))) {
      setModalError('请输入正确的4位数字房间号');
      return;
    }

    setModalLoading(true);
    try {
      // Find the active game matching this room code
      const gamesQuery = query(
        collection(db, 'games'), 
        where('room_code', '==', typedCode),
        where('status', '==', 'active')
      );
      
      let gamesSnap;
      try {
        gamesSnap = await getDocs(gamesQuery);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'games');
      }

      if (!gamesSnap || gamesSnap.empty) {
        setModalError('房间不存在或已结束，请核对房间号');
        setModalLoading(false);
        return;
      }

      const activeGameDoc = gamesSnap.docs[0];
      const gameId = activeGameDoc.id;

      // Check if user is already a player in this room
      const playerDocRef = doc(db, 'games', gameId, 'players', user.id);
      const playerSnap = await getDoc(playerDocRef);

      if (!playerSnap.exists()) {
        // If not in, verify is there room left? (Limit is usually 4 in standard Mahjong, but we support dynamic join)
        // Add user as player with 0 current score
        const playerData: GamePlayer = {
          user_id: user.id,
          username: user.username,
          avatar_url: user.avatar_url,
          current_score: 0
        };
        await setDoc(playerDocRef, playerData);
      }

      // Dismiss modal and join game
      setShowJoinModal(false);
      setRoomCodeInput('');
      onEnterGame(gameId);
    } catch (err) {
      console.error(err);
      setModalError('加入牌局出错，请重试');
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Player Info */}
      <div className="bg-slate-800 rounded-3xl p-6 border border-slate-700/50 shadow-lg relative overflow-hidden">
        {/* Abstract pattern */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl" />
        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl" />

        <div className="flex items-center gap-4 relative">
          <div className="w-16 h-16 rounded-full border-2 border-emerald-500 overflow-hidden shrink-0 shadow-inner">
            <img 
              src={user.avatar_url} 
              alt={user.username} 
              className="w-full h-full object-cover" 
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white truncate">{user.username}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold font-mono">
                总积分: {user.total_score}
              </span>
              <span className="text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5" />
                全区排名: 第 {userRank > 0 ? userRank : '--'} 名
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Action Buttons */}
      <div className="grid grid-cols-1 gap-4">
        {/* 1. 我要开局 */}
        <button
          onClick={handleCreateRoom}
          disabled={createLoading}
          id="btn-create-game"
          className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white rounded-2xl p-6 shadow-md transition-all active:scale-[0.98] text-left relative overflow-hidden group flex items-center justify-between"
        >
          <div className="relative z-10 space-y-1">
            <span className="text-sm text-emerald-100 font-medium block">创建一桌全新牌局</span>
            <span className="text-xl font-bold block">我要开局</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center relative z-10">
            {createLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            ) : (
              <Play className="w-6 h-6 text-white group-hover:translate-x-0.5 transition-transform" />
            )}
          </div>
          {/* Tile Deco background */}
          <div className="absolute right-14 bottom-[-10px] text-emerald-700/20 text-7xl font-sans block select-none pointer-events-none font-bold">
            中
          </div>
        </button>

        {/* 2. 进入牌局 */}
        <button
          onClick={() => {
            setModalError('');
            setShowJoinModal(true);
          }}
          id="btn-join-game"
          className="bg-slate-800 hover:bg-slate-750 text-white rounded-2xl p-6 border border-slate-700/50 shadow-md transition-all active:scale-[0.98] text-left flex items-center justify-between group"
        >
          <div className="space-y-1">
            <span className="text-sm text-slate-400 font-medium block">输入房间号加入好友牌局</span>
            <span className="text-xl font-bold block">进入已建牌局</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-700 flex items-center justify-center">
            <LogIn className="w-6 h-6 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>

        {/* 3. 当前牌局 */}
        <button
          onClick={() => activeGameId && onEnterGame(activeGameId)}
          disabled={!activeGameId}
          id="btn-active-game"
          className={`rounded-2xl p-6 border transition-all active:scale-[0.98] text-left flex items-center justify-between group ${
            activeGameId 
              ? 'bg-cyan-950/40 hover:bg-cyan-950/60 text-cyan-200 border-cyan-800/60 shadow-lg glow-cyan shadow-cyan-950/20' 
              : 'bg-slate-800 bg-opacity-40 text-slate-500 border-slate-800 cursor-not-allowed select-none'
          }`}
        >
          <div className="space-y-1">
            <span className="text-sm text-slate-400 font-medium block">
              {activeGameId ? '检测到您当前有未完结的牌桌' : '由于没有进行中的房间，此项暂时置灰'}
            </span>
            <span className="text-xl font-bold block flex items-center gap-2">
              当前进行中牌局
              {activeGameId && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
              )}
            </span>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            activeGameId ? 'bg-cyan-900/60 text-cyan-400' : 'bg-slate-800 text-slate-600'
          }`}>
            <Activity className="w-6 h-6 text-current group-hover:scale-105 transition-transform" />
          </div>
        </button>
      </div>

      {/* Mahjong etiquette card */}
      <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-800 text-slate-400 text-xs leading-relaxed space-y-1.5">
        <p className="font-semibold text-slate-300">💡 记分小常识：</p>
        <p>1. 所有选手初始积分为零。整个房间内所有人的积分总和将恒等保持为 0，只有互相支付转移才能产生牌分。</p>
        <p>2. 胡牌玩家只需点击放铳或给分选手的头像，在弹窗中选择或输入相应牌型/倍数即可瞬间支付记账。</p>
        <p>3. 房主一键点击“结束牌局”完成结算，积分将会自动永久汇总进入对应选手的个人总积分账户。</p>
      </div>

      {/* JOIN ROOM CODE POPUP MODAL */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 w-full max-w-sm rounded-2xl border border-slate-700 shadow-2xl p-6 relative animate-slideUp">
            <button
              onClick={() => {
                setShowJoinModal(false);
                setRoomCodeInput('');
                setModalError('');
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white text-center mb-4">加入牌局房间</h3>
            
            {modalError && (
              <div className="mb-4 p-3 bg-red-950/50 border border-red-500/30 rounded-xl text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div className="space-y-1.5 text-center">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  请输入 4 位数房间码
                </label>
                <input
                  type="text"
                  maxLength={4}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="如 8439"
                  required
                  autoFocus
                  className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl py-4 text-center text-3xl font-bold tracking-widest text-emerald-400 focus:outline-none focus:border-emerald-500 transition-all font-mono"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinModal(false);
                    setRoomCodeInput('');
                    setModalError('');
                  }}
                  className="flex-1 bg-slate-700 hover:bg-slate-650 text-slate-300 font-semibold py-3 rounded-xl text-sm transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/10 disabled:opacity-50"
                >
                  {modalLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <>
                      <span>验证进入</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
