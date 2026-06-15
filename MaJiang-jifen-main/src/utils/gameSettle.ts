import { db, doc, collection, getDocs, runTransaction, serverTimestamp } from '../firebase';
import { UserProfile } from '../types';

/**
 * Automates the atomic, thread-safe settlement of a stale game (inactive >4 hours)
 * summing player scores to overall total scores, issuing game history items, and updating game status.
 */
export const autoSettleStaleGame = async (gameId: string, roomCode: string) => {
  try {
    // 1. Fetch current game players from players subcollection
    const playersQuery = collection(db, 'games', gameId, 'players');
    const playersSnap = await getDocs(playersQuery);
    if (playersSnap.empty) {
      return;
    }
    
    const players = playersSnap.docs.map(d => d.data());
    
    // 2. Perform safe updates utilizing state transaction isolation
    await runTransaction(db, async (transaction) => {
      const gameRef = doc(db, 'games', gameId);
      const gameSnap = await transaction.get(gameRef);
      
      if (!gameSnap.exists()) return;
      const gameData = gameSnap.data();
      if (gameData.status !== 'active') {
        // Someone already ended or processed this room
        return;
      }
      
      const userUpdates: { ref: any; freshScore: number }[] = [];
      for (const p of players) {
        if (!p.user_id) continue;
        const userDocRef = doc(db, 'users', p.user_id);
        const userSnap = await transaction.get(userDocRef);
        if (userSnap.exists()) {
          const oldProfile = userSnap.data() as UserProfile;
          const freshTotal = (oldProfile.total_score || 0) + (p.current_score || 0);
          userUpdates.push({ ref: userDocRef, freshScore: freshTotal });
        }
      }
      
      // Update player scores
      for (const update of userUpdates) {
        transaction.update(update.ref, {
          total_score: update.freshScore
        });
      }
      
      // Create Game History entry for each participant
      const playersListSummary = players.map(p => ({
        username: p.username || '未知选手',
        score: p.current_score || 0
      }));
      
      for (const p of players) {
        if (!p.user_id) continue;
        const historyId = doc(collection(db, 'game_history')).id;
        const historyDocRef = doc(db, 'game_history', historyId);
        transaction.set(historyDocRef, {
          id: historyId,
          game_id: gameId,
          user_id: p.user_id,
          score: p.current_score || 0,
          ended_at: new Date(),
          game_code: roomCode,
          players: playersListSummary
        });
      }
      
      // Update main game status to ended
      transaction.update(gameRef, {
        status: 'ended',
        auto_settled: true,
        last_action_at: serverTimestamp()
      });
    });
    
    console.log(`Auto-settled stale game ${gameId} with code ${roomCode}.`);
  } catch (error) {
    console.error(`Failed to handle auto-settling of stale game ${gameId}:`, error);
  }
};
