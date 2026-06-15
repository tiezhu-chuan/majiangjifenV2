import React, { useState, useEffect, useRef } from 'react';
import { 
  db, 
  handleFirestoreError, 
  OperationType,
  collection, 
  doc, 
  onSnapshot, 
  writeBatch, 
  getDocs, 
  setDoc,
  getDoc,
  orderBy,
  query,
  where
} from '../firebase';
import { UserProfile, GameRoom, GamePlayer, MAHJONG_HANDS, MahjongHand } from '../types';
import { compressImageToBase64 } from '../utils/imageCompressor';
import { autoSettleStaleGame } from '../utils/gameSettle';
import { 
  Users, 
  ArrowLeftRight, 
  Award, 
  X, 
  Check, 
  Camera, 
  Upload, 
  LogOut, 
  Sparkles, 
  AlertCircle, 
  Loader2 
} from 'lucide-react';

interface GameRoomViewProps {
  gameId: string;
  user: UserProfile;
  onExitGame: () => void;
}

export default function GameRoomView({ gameId, user, onExitGame }: GameRoomViewProps) {
  const [game, setGame] = useState<GameRoom | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettlementScreen, setShowSettlementScreen] = useState(false);
  
  // Scoring P2P Transfer Modal State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferFrom, setTransferFrom] = useState<GamePlayer | null>(null);
  const [transferTo, setTransferTo] = useState<GamePlayer | null>(null);
  const [transferAmountInput, setTransferAmountInput] = useState('10');
  const [transferError, setTransferError] = useState('');
  const [transferSuccess, setTransferSuccess] = useState(false);

  // Achievements unlock state
  const [showAchievementModal, setShowAchievementModal] = useState(false);
  const [achievementTargetUser, setAchievementTargetUser] = useState<GamePlayer | null>(null);
  const [selectedHand, setSelectedHand] = useState<MahjongHand>(MAHJONG_HANDS[0]);
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null);
  const [achievementLoading, setAchievementLoading] = useState(false);
  const [achievementError, setAchievementError] = useState('');
  
  // Unlocked celebration state (for the card modal pop animation)
  const [celebrationData, setCelebrationData] = useState<{
    user: GamePlayer;
    hand: MahjongHand;
    photo: string;
    unlockedAt: Date;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Subscribe to the Game Details
  useEffect(() => {
    const gameDocRef = doc(db, 'games', gameId);
    const unsubscribeGame = onSnapshot(gameDocRef, (snap) => {
      if (snap.exists()) {
        const gameData = snap.data() as GameRoom;
        setGame(gameData);
        
        // If the game has ended, show settlement screen instead of automatically exiting
        if (gameData.status === 'ended') {
          setShowSettlementScreen(true);
        }
      } else {
        alert('该牌局已被房主销毁');
        onExitGame();
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `games/${gameId}`);
    });

    return () => unsubscribeGame();
  }, [gameId, onExitGame]);

  // 1.1 Local state active stale checking (every 30 seconds)
  useEffect(() => {
    if (!game || game.status !== 'active') return;

    const checkStale = () => {
      const lastTime = (game as any).last_action_at?.toDate 
        ? (game as any).last_action_at.toDate() 
        : (game.created_at?.toDate ? game.created_at.toDate() : new Date(game.created_at || Date.now()));
      
      const fourHoursMs = 4 * 60 * 60 * 1000;
      if (Date.now() - lastTime.getTime() > fourHoursMs) {
        console.log('Detected stale game room inside active view. Triggering auto settle...');
        autoSettleStaleGame(gameId, game.room_code || '');
      }
    };

    checkStale();
    const interval = setInterval(checkStale, 30000);
    return () => clearInterval(interval);
  }, [game, gameId]);

  // 2. Subscribe to the Players inside Game Subcollection Group
  useEffect(() => {
    const playersColRef = collection(db, 'games', gameId, 'players');
    const unsubscribePlayers = onSnapshot(playersColRef, (snap) => {
      const list: GamePlayer[] = [];
      snap.forEach((doc) => {
        list.push(doc.data() as GamePlayer);
      });
      setPlayers(list);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `games/${gameId}/players`);
    });

    return () => unsubscribePlayers();
  }, [gameId]);

  // Handle Score transfer (Point-to-Point transfer)
  const executePointsTransfer = async () => {
    if (!transferFrom || !transferTo) return;
    setTransferError('');
    const amt = parseInt(transferAmountInput);
    
    if (isNaN(amt) || amt <= 0) {
      setTransferError('请输正确的、大于 0 的支付分值');
      return;
    }

    try {
      const batch = writeBatch(db);
      
      // Debit from account
      const fromDocRef = doc(db, 'games', gameId, 'players', transferFrom.user_id);
      batch.update(fromDocRef, {
        current_score: transferFrom.current_score - amt
      });

      // Credit to account
      const toDocRef = doc(db, 'games', gameId, 'players', transferTo.user_id);
      batch.update(toDocRef, {
        current_score: transferTo.current_score + amt
      });

      // Update game last activity timestamp
      batch.update(doc(db, 'games', gameId), {
        last_action_at: new Date()
      });

      await batch.commit();
      
      setTransferSuccess(true);
      setTimeout(() => {
        setShowTransferModal(false);
        setTransferSuccess(false);
        setTransferFrom(null);
        setTransferTo(null);
        setTransferAmountInput('10');
      }, 1000);

    } catch (err) {
      console.error(err);
      setTransferError('分值记账失败，请重试');
    }
  };

  // Handle image upload and compression
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAchievementLoading(true);
      setAchievementError('');
      // Compress to high-quality low-byte base64 image (<180KB to fit Firestore comfort safely)
      const base64 = await compressImageToBase64(file, 180, 500);
      setUploadedPhoto(base64);
    } catch (err) {
      setAchievementError('照片压缩处理失败，请重试');
    } finally {
      setAchievementLoading(false);
    }
  };

  // Unlock Achievement inside room
  const handleUnlockAchievement = async () => {
    if (!achievementTargetUser) return;
    setAchievementError('');

    if (!uploadedPhoto) {
      setAchievementError('解锁极品胡牌，请先自拍现场实拍照片/手牌佐证！');
      return;
    }

    setAchievementLoading(true);
    try {
      const achievementId = doc(collection(db, 'achievements')).id;
      const achievementRef = doc(db, 'achievements', achievementId);
      
      const achRecord = {
        id: achievementId,
        user_id: achievementTargetUser.user_id,
        achievement_name: selectedHand.name,
        photo_url: uploadedPhoto,
        unlocked_at: new Date(),
        game_id: gameId,
        multiplier: selectedHand.multiplier
      };

      const batch = writeBatch(db);
      batch.set(achievementRef, achRecord);
      batch.update(doc(db, 'games', gameId), {
        last_action_at: new Date()
      });
      await batch.commit();

      // Trigger high-contrast celebration card layout
      setCelebrationData({
        user: achievementTargetUser,
        hand: selectedHand,
        photo: uploadedPhoto,
        unlockedAt: new Date()
      });

      // Close inputs
      setShowAchievementModal(false);
      setUploadedPhoto(null);
    } catch (err) {
      console.error(err);
      setAchievementError('解锁失败，请稍后重试');
    } finally {
      setAchievementLoading(false);
    }
  };

  // Room Owner Function: End Game Room
  const handleEndGameRoom = async () => {
    if (!game || game.owner_id !== user.id) return;
    const confirmEnd = window.confirm('您确定要结束此剧并进行终极积分汇总结算吗？该操作不可逆，将立刻清空该牌局。');
    if (!confirmEnd) return;

    setLoading(true);
    try {
      // 1. Check double sum verification
      const totalSum = players.reduce((sum, p) => sum + p.current_score, 0);
      if (totalSum !== 0) {
        alert(`牌局总分当前不等于 0 (当前总计为 ${totalSum} 分)，请核对转账分值无误后再点击结束`);
        setLoading(false);
        return;
      }

      // 2. Setup Firestore writeBatch to atomic save
      const batch = writeBatch(db);

      // We need to fetch and read all players' global profile scores sequentially to combine them cleanly
      // Note: A database update is required for each user.
      for (const p of players) {
        const userDocRef = doc(db, 'users', p.user_id);
        const userSnap = await getDoc(userDocRef);
        
        if (userSnap.exists()) {
          const oldProfile = userSnap.data() as UserProfile;
          const freshTotal = (oldProfile.total_score || 0) + p.current_score;
          batch.update(userDocRef, {
            total_score: freshTotal
          });
        }
      }

      // 3. Create independent History records for each user who played
      // and display competitors' relative points
      const playersListSummary = players.map(p => ({
        username: p.username,
        score: p.current_score
      }));

      for (const p of players) {
        const historyId = doc(collection(db, 'game_history')).id;
        const historyDocRef = doc(db, 'game_history', historyId);
        
        batch.set(historyDocRef, {
          id: historyId,
          game_id: gameId,
          user_id: p.user_id,
          score: p.current_score,
          ended_at: new Date(),
          game_code: game.room_code,
          players: playersListSummary
        });
      }

      // 4. Update Game status to ended
      const gameDocRef = doc(db, 'games', gameId);
      batch.update(gameDocRef, {
        status: 'ended'
      });

      // 5. Commit atomic transaction
      await batch.commit();
      
      // Auto redirects via Snap status update
    } catch (err) {
      console.error('End Game Error: ', err);
      alert('结算历史过程中出错，请联系支持。' + err);
    } finally {
      setLoading(false);
    }
  };

  const isOwner = game?.owner_id === user.id;

  if (showSettlementScreen) {
    // Sort players in this specific completed game to determine rank on the podium!
    const sortedSquad = [...players].sort((a, b) => b.current_score - a.current_score);
    const maxScore = sortedSquad[0]?.current_score || 0;

    return (
      <div className="space-y-6 animate-fadeIn pb-12 text-center">
        {/* Settlement Card Header with Sparkly Cup design */}
        <div className="bg-gradient-to-b from-slate-900 via-slate-850 to-slate-900 rounded-[32px] p-6 border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-yellow-405 to-amber-600 animate-pulse" />
          
          <div className="flex flex-col items-center justify-center space-y-4 pt-4">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/30 text-amber-400 animate-bounce relative">
              <Sparkles className="w-4 h-4 text-yellow-300 absolute -top-1 -right-1 animate-pulse" />
              <Award className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-2xl font-black text-white tracking-wide">牌局终极记分结算</h2>
              <p className="text-[11px] text-slate-400 mt-1">
                房间号 <span className="font-mono font-bold text-amber-400">{game?.room_code || '----'}</span> • 积分结算圆满完成
              </p>
            </div>
          </div>

          {/* Sorted leader ranks list */}
          <div className="space-y-3 mt-6">
            {sortedSquad.map((p, idx) => {
              const isBestWinner = p.current_score === maxScore && maxScore > 0;
              const isMe = p.user_id === user.id;

              return (
                <div 
                  key={p.user_id}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                    isBestWinner 
                      ? 'bg-amber-950/20 border-amber-500/40 shadow-[0_4px_12px_rgba(245,158,11,0.06)] scale-[1.01]' 
                      : isMe 
                        ? 'bg-emerald-950/20 border-emerald-500/35' 
                        : 'bg-slate-900/50 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Rank Badge */}
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-black shrink-0 ${
                      idx === 0 
                        ? 'bg-amber-500 text-slate-950 shadow' 
                        : idx === 1 
                          ? 'bg-slate-300 text-slate-900' 
                          : idx === 2 
                            ? 'bg-amber-700 text-white' 
                            : 'bg-slate-800 text-slate-400'
                    }`}>
                      {idx + 1}
                    </div>

                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full overflow-hidden border border-slate-705 shrink-0">
                      <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                    </div>

                    {/* Username */}
                    <div className="text-left">
                      <div className="flex items-center gap-1">
                        <span className={`text-xs font-bold leading-none ${isMe ? 'text-emerald-400' : 'text-slate-200'}`}>
                          {p.username}
                        </span>
                        {isMe && <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1 py-0.2 rounded font-semibold font-sans">我</span>}
                        {isBestWinner && <span className="text-[9px] bg-amber-500/15 text-amber-400 px-1 py-0.2 rounded font-black flex items-center gap-0.5 animate-pulse">👑 雀神</span>}
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1 block">本场结算</span>
                    </div>
                  </div>

                  {/* Net score changed */}
                  <div className="text-right">
                    <span className={`font-mono text-sm font-black tracking-tight ${
                      p.current_score > 0 
                        ? 'text-emerald-400' 
                        : p.current_score < 0 
                          ? 'text-rose-400' 
                          : 'text-slate-450'
                    }`}>
                      {p.current_score > 0 ? `+${p.current_score}` : p.current_score} pts
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8">
            <button
              onClick={() => onExitGame()}
              className="w-full py-4 px-6 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-extrabold rounded-2xl text-sm transition-all shadow-lg active:scale-[0.98] cursor-pointer animate-pulse"
            >
              我知道了，返回主页
            </button>
          </div>
        </div>

        <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-800/80 text-slate-400 text-xs leading-relaxed space-y-1.5 text-left">
          <p className="font-semibold text-slate-300">💡 记分贴心提示：</p>
          <p>房主已经为您一键结束该牌局，该局分值已累加并汇总至您的全区排行榜总积分中，永久记录功勋。快去开启新一局的竞技吧！</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header Room and Players Count */}
      <div className="bg-slate-800 rounded-3xl p-5 border border-slate-700/50 shadow-lg flex items-center justify-between relative overflow-hidden">
        <div>
          <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-widest block">
            ROOM CODE • 进行中
          </span>
          <h2 className="text-3xl font-extrabold text-white tracking-widest font-mono select-all mt-0.5">
            {game?.room_code || '----'}
          </h2>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-500 block font-semibold">
            房内玩家数
          </span>
          <span className="text-lg font-bold text-slate-300 font-mono">
            {players.length} / 20人
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-3" />
          <p className="text-sm">正在实时连线牌局...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Players Score Cards Grid */}
          <div className="grid grid-cols-2 gap-4">
            {players.map((item) => {
              const isSelf = item.user_id === user.id;
              return (
                <div 
                  key={item.user_id}
                  className={`relative bg-slate-800 rounded-2xl p-4.5 border transition-all text-center flex flex-col justify-between select-none ${
                    isSelf 
                      ? 'border-emerald-500 shadow-md ring-1 ring-emerald-500/20' 
                      : 'border-slate-700/50 hover:border-slate-600'
                  }`}
                >
                  <label htmlFor={`player-card-${item.user_id}`} className="sr-only">
                    玩家 {item.username}，当前得分 {item.current_score} 点
                  </label>
                  {/* Action buttons inside card */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
                    {/* Unlock achievement badge */}
                    <button
                      onClick={() => {
                        setAchievementTargetUser(item);
                        setSelectedHand(MAHJONG_HANDS[0]);
                        setUploadedPhoto(null);
                        setAchievementError('');
                        setShowAchievementModal(true);
                      }}
                      className="p-1 rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-colors"
                      title="为该选手解锁极品牌型成就"
                    >
                      <Award className="w-4 h-4" />
                    </button>
                  </div>

                  <div 
                    id={`player-card-${item.user_id}`}
                    onClick={() => {
                      // Trigger score transfer if not clicking self (you pay points to others)
                      if (!isSelf) {
                        setTransferFrom(players.find(p => p.user_id === user.id) || null);
                        setTransferTo(item);
                        setTransferAmountInput('10');
                        setTransferError('');
                        setShowTransferModal(true);
                      } else {
                        alert('如需记分，请点击其他选手的头像，进行“点对点给分支付”！');
                      }
                    }}
                    className="cursor-pointer flex flex-col items-center flex-1 py-1"
                  >
                    <div className="w-14 h-14 rounded-full overflow-hidden border border-slate-700 shadow-md transform hover:scale-105 transition-all">
                      <img src={item.avatar_url} alt="" className="w-full h-full object-cover" />
                    </div>

                    <h3 className="text-sm font-bold text-slate-200 mt-2.5 flex items-center justify-center gap-1">
                      {item.username}
                      {isSelf && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 rounded">我</span>}
                    </h3>
                    
                    {/* Live score indicator */}
                    <p className={`text-xl font-extrabold font-mono mt-1.5 ${
                      item.current_score > 0 
                        ? 'text-emerald-400' 
                        : item.current_score < 0 
                          ? 'text-rose-500' 
                          : 'text-slate-400'
                    }`}>
                      {item.current_score >= 0 ? `+${item.current_score}` : item.current_score}
                    </p>
                    <span className="text-[9px] text-slate-500 block mt-1 hover:text-slate-400">
                      {!isSelf ? '点击头像付分给ta' : '其他选手点击你可付分'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Point integrity sum checker */}
          <div className="bg-slate-900/50 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              各玩家实时总分平衡校验：
            </span>
            <div className="flex items-center gap-2 font-mono text-xs font-bold">
              <span className="text-slate-450 text-right">
                {players.reduce((sum, p) => sum + p.current_score, 0)} 点
              </span>
              <span className="bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider scale-90">
                恒等 0
              </span>
            </div>
          </div>

          {/* Action panels buttons */}
          <div className="flex flex-col gap-3">
            {/* 🏆 Lock/Unlock Prominent Achievement Button */}
            <button
              onClick={() => {
                const selfPlayer = players.find(p => p.user_id === user.id) || players[0] || null;
                setAchievementTargetUser(selfPlayer);
                setSelectedHand(MAHJONG_HANDS[0]);
                setUploadedPhoto(null);
                setAchievementError('');
                setShowAchievementModal(true);
              }}
              className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-extrabold py-3.5 rounded-xl shadow-lg hover:shadow-amber-500/10 active:scale-95 transition-all text-sm flex items-center justify-center gap-1.5 cursor-pointer leading-none"
            >
              <Award className="w-5 h-5 text-slate-950 animate-pulse" />
              <span>🏆 解锁高光牌型成就</span>
            </button>

            {isOwner ? (
              <button
                onClick={handleEndGameRoom}
                className="w-full bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white font-extrabold py-3.5 rounded-xl shadow-lg hover:shadow-emerald-500/10 active:scale-95 transition-all text-sm block"
              >
                结束该结算牌局（房主专享）
              </button>
            ) : (
              <div className="text-center text-xs text-slate-500 leading-relaxed bg-slate-900/30 p-3.5 rounded-xl border border-slate-800/40">
                您不是房主。当前房主为{' '}
                <span className="text-slate-300 font-semibold">
                  {players.find(p => p.user_id === game?.owner_id)?.username || '房主选手'}
                </span>
                。当房主结束此局时，整牌积分将会汇总进入您的个人主账户中。
              </div>
            )}

            {/* Direct exit for testing button */}
            <button
              onClick={() => {
                const confEx = window.confirm('仅中途退出房间，不取消牌局？退出后可在主页通过“当前牌局”重连返回。确认退出吗？');
                if (confEx) onExitGame();
              }}
              className="w-full bg-slate-800 hover:bg-slate-755 border border-slate-700/50 text-slate-400 font-semibold py-3 rounded-xl hover:text-slate-300 text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>中途退出（可重连）</span>
            </button>
          </div>
        </div>
      )}


      {/* ----------------- CORE scoring P2P payout MODAL ----------------- */}
      {showTransferModal && transferFrom && transferTo && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 w-full max-w-sm rounded-2xl border border-slate-700 shadow-2xl p-6 relative animate-slideUp">
            <button
              onClick={() => setShowTransferModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white text-center mb-5 flex items-center justify-center gap-1.5">
              <ArrowLeftRight className="w-5 h-5 text-emerald-400" />
              <span>点对点支付记分</span>
            </h3>

            {transferSuccess ? (
              <div className="text-center py-6 text-emerald-400 font-semibold text-lg flex flex-col items-center gap-2 animate-zoomIn">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/40">
                  <Check className="w-6 h-6" />
                </div>
                <span>记分完成！</span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Transfer summary description details representation */}
                <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-750">
                  <div className="text-center w-5/12">
                    <img src={transferFrom.avatar_url} className="w-9 h-9 rounded-full mx-auto object-cover" alt="" />
                    <span className="text-[11px] text-slate-400 font-semibold block truncate mt-1">{transferFrom.username}</span>
                  </div>
                  <div className="text-slate-600 font-bold">付分给</div>
                  <div className="text-center w-5/12">
                    <img src={transferTo.avatar_url} className="w-9 h-9 rounded-full mx-auto object-cover" alt="" />
                    <span className="text-[11px] text-slate-400 font-semibold block truncate mt-1">{transferTo.username}</span>
                  </div>
                </div>

                {transferError && (
                  <div className="p-2.5 bg-rose-950/40 border border-rose-500/20 text-rose-300 text-xs rounded-lg flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-450" />
                    <span>{transferError}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 block" htmlFor="transfer-score">
                    输减/支付积分是多少点？
                  </label>
                  <input
                    id="transfer-score"
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={transferAmountInput}
                    onChange={(e) => setTransferAmountInput(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 px-4 text-center text-2xl font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />
                  
                  {/* Handy preset values */}
                  <div className="flex gap-2.5 justify-center mt-3">
                    {['3', '5', '8', '16', '32', '50'].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTransferAmountInput(val)}
                        className="bg-slate-700/60 hover:bg-slate-700 border border-slate-655 text-slate-300 font-mono text-xs font-semibold px-3 py-1.5 rounded-lg active:scale-90 transition-all"
                      >
                        +{val}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowTransferModal(false)}
                    className="flex-1 bg-slate-705 text-slate-300 font-semibold py-3 rounded-xl text-sm hover:bg-slate-700 transition"
                  >
                    取消
                  </button>
                  <button
                    onClick={executePointsTransfer}
                    className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-3 rounded-xl text-sm shadow-md hover:from-emerald-400 hover:to-teal-450 transition"
                  >
                    确认扣付记账
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ----------------- UNLOCK ACHIEVEMENT SELECTION MODAL ----------------- */}
      {showAchievementModal && achievementTargetUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 w-full max-w-sm rounded-2xl border border-slate-700 shadow-2xl p-6 relative animate-slideUp max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setShowAchievementModal(false);
                setUploadedPhoto(null);
                setAchievementError('');
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors z-20"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white text-center mb-4 flex items-center justify-center gap-1.5">
              <Award className="w-5 h-5 text-amber-500 animate-pulse" />
              <span>解锁雀神高光成就</span>
            </h3>

            {achievementError && (
              <div className="mb-4 p-2.5 bg-rose-950/30 border border-rose-500/20 text-rose-350 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{achievementError}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* Highlight user target details & selection drop-down */}
              <div className="space-y-1.5 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <img src={achievementTargetUser.avatar_url} className="w-7 h-7 rounded-full object-cover shrink-0" alt="" />
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                    获授荣誉选手：
                  </span>
                </div>
                <div className="relative mt-2">
                  <select
                    id="achievement-player-select"
                    value={achievementTargetUser.user_id}
                    onChange={(e) => {
                      const found = players.find(p => p.user_id === e.target.value);
                      if (found) {
                        setAchievementTargetUser(found);
                      }
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-semibold cursor-pointer appearance-none"
                  >
                    {players.map((p) => (
                      <option key={p.user_id} value={p.user_id} className="bg-slate-800 text-slate-200">
                        {p.username} {p.user_id === user.id ? '(我)' : ''}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
                    <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                      <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Photo Input (Camera selection) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 block">
                  1. 自拍现场手牌/或真人照片(3MB以内)
                </label>
                
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed border-slate-700 rounded-xl h-28 flex flex-col items-center justify-center cursor-pointer hover:border-slate-550 hover:bg-slate-900/20 transition relative overflow-hidden bg-slate-900/40`}
                >
                  {uploadedPhoto ? (
                    <>
                      <img 
                        src={uploadedPhoto} 
                        alt="Uploaded preview" 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 flex items-center justify-center text-xs text-white gap-1 transition-all">
                        <Camera className="w-4 h-4" />
                        <span>重新拍摄/选择</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-center p-3">
                      {achievementLoading ? (
                        <Loader2 className="w-6 h-6 animate-spin text-amber-500 mx-auto mb-1.5" />
                      ) : (
                        <Camera className="w-6 h-6 text-slate-505 mx-auto mb-1.5" />
                      )}
                      <span className="text-xs text-slate-450 block font-semibold">自拍手牌 / 拍照记牌</span>
                      <span className="text-[10px] text-slate-600 block mt-0.5">支持 Drag and Drop</span>
                    </div>
                  )}
                  
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handlePhotoUpload}
                    accept="image/*"
                    capture="environment" // direct camera pop trigger on phone!
                    className="hidden"
                  />
                </div>
              </div>

              {/* Hand styling select list */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 block" htmlFor="mahjong-hand-select">
                  2. 授封成就牌型 (倍数加成)
                </label>
                
                <div className="relative">
                  <select
                    id="mahjong-hand-select"
                    value={selectedHand.name}
                    onChange={(e) => {
                      const found = MAHJONG_HANDS.find(h => h.name === e.target.value);
                      if (found) setSelectedHand(found);
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 px-3 text-sm text-slate-300 focus:outline-none focus:border-amber-500 appearance-none font-semibold cursor-pointer"
                  >
                    {MAHJONG_HANDS.map((hand) => (
                      <option key={hand.name} value={hand.name} className="bg-slate-800 text-slate-200">
                        {hand.name} (x{hand.multiplier}倍)
                      </option>
                    ))}
                  </select>
                </div>
                
                <p className="text-[10px] text-slate-500 bg-slate-905/60 p-2.5 rounded-lg border border-slate-750">
                  {selectedHand.description}
                </p>
              </div>

              {/* Action columns list */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAchievementModal(false);
                    setUploadedPhoto(null);
                    setAchievementError('');
                  }}
                  className="flex-1 bg-slate-700 text-slate-300 font-semibold py-3 rounded-xl text-xs hover:bg-slate-650 transition"
                >
                  取消
                </button>
                <button
                  onClick={handleUnlockAchievement}
                  disabled={achievementLoading || !uploadedPhoto}
                  className="flex-1 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 font-extrabold py-3 rounded-xl text-xs shadow-md shadow-amber-500/10 hover:shadow-amber-550/20 active:scale-95 transition disabled:opacity-40"
                >
                  {achievementLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950 mx-auto" />
                  ) : (
                    <span>立即认证解锁</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* --------------- HIGH-CONTRAST ACHIEVEMENT UNLOCKED POPUP PANEL --------------- */}
      {celebrationData && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md flex items-center justify-center z-50 p-4">
          {/* Confetti decoration */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
            <div className="absolute top-1/4 left-1/4 w-3 h-3 bg-red-500 rounded-full animate-ping delay-75" />
            <div className="absolute top-1/3 right-1/4 w-2 h-2 bg-yellow-400 rounded-full animate-ping delay-200" />
            <div className="absolute bottom-1/3 left-10 w-4 h-4 bg-emerald-400 rounded-full animate-ping delay-500" />
            <div className="absolute bottom-1/4 right-10 w-3 h-3 bg-cyan-400 rounded-full animate-ping" />
          </div>

          <div className="bg-slate-85 w-full max-w-sm rounded-[28px] border border-slate-700/80 shadow-2xl overflow-hidden relative animate-zoomIn flex flex-col">
            
            {/* Celebration ribbon */}
            <div className="bg-amber-400 py-1.5 flex items-center justify-center text-[10px] font-black text-slate-950 uppercase tracking-widest gap-1">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              <span>恭喜解锁雀神高光成就！</span>
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
            </div>

            {/* Main content body */}
            <div className="p-6 flex-1 flex flex-col space-y-5">
              
              {/* Photo Frame containing player background card info */}
              <div className="relative h-64 rounded-xl overflow-hidden border-2 border-amber-500 shadow-xl bg-black">
                {celebrationData.photo ? (
                  <img src={celebrationData.photo} alt="Record Hand" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                    <Award className="w-12 h-12 text-slate-800" />
                  </div>
                )}
                
                {/* Visual card badge label in center bottom */}
                <div className="absolute bottom-4 left-4 right-4 bg-slate-950/70 backdrop-blur" style={{ padding: '12px 16px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-amber-500">
                      <img src={celebrationData.user.avatar_url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="font-extrabold text-[13px] text-amber-400 font-sans tracking-wide">
                        {celebrationData.hand.name}
                      </div>
                      <div className="text-[10px] text-slate-300 font-medium">
                        雀友 {celebrationData.user.username} 自传解锁
                      </div>
                    </div>
                    <div className="ml-auto text-right">
                      <div className="text-[10px] text-amber-400 font-mono font-bold">
                        x{celebrationData.hand.multiplier}倍
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Success celebration details notes */}
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-1.5 text-xs text-slate-300">
                <p className="font-semibold text-amber-400 text-center">
                  “全桌合鉴，神级胡牌。勋章已登载入个人总成就墙！”
                </p>
                <p className="text-[10px] text-slate-500 leading-relaxed text-center">
                  认证时间: {new Date().toLocaleString('zh-CN')}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="p-4 bg-slate-900/40 border-t border-slate-800 flex justify-center">
              <button
                onClick={() => setCelebrationData(null)}
                className="w-full bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-450 text-slate-950 font-extrabold py-3 rounded-xl text-sm transition-all shadow-md active:scale-95"
              >
                载入成就墙 🌟
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
