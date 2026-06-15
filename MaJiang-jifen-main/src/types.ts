export interface UserProfile {
  id: string;
  username: string;
  avatar_url: string;
  total_score: number;
  created_at: any; // Firestore Timestamp
}

export interface GameRoom {
  id: string;
  room_code: string; // 4-digit numeric code
  owner_id: string; // UID of the room owner
  status: 'active' | 'ended';
  created_at: any; // Firestore Timestamp
}

export interface GamePlayer {
  user_id: string;
  username: string;
  avatar_url: string;
  current_score: number;
}

export interface GameHistoryRecord {
  id: string;
  game_id: string;
  user_id: string;
  score: number;
  ended_at: any; // Firestore Timestamp
  game_code: string;
  players: {
    username: string;
    score: number;
  }[];
}

export interface Achievement {
  id: string;
  user_id: string;
  achievement_name: string;
  photo_url: string;
  unlocked_at: any; // Firestore Timestamp
  game_id?: string;
  multiplier: number;
}

export interface MahjongHand {
  name: string;
  multiplier: number;
  description: string;
}

export const MAHJONG_HANDS: MahjongHand[] = [
  { name: '碰碰胡', multiplier: 3, description: '由四个刻子（或杠）加一对将牌组成的胡牌牌型。' },
  { name: '混一色', multiplier: 3, description: '由一种花色的序数牌及字牌组成的胡牌牌型。' },
  { name: '七小对', multiplier: 4, description: '胡牌时牌型由任意七个对子组成。' },
  { name: '清一色', multiplier: 6, description: '全副牌由同一种花色的序数牌组成。' },
  { name: '一条龙', multiplier: 9, description: '同一花色一至九的序数牌齐全的胡牌牌型。' },
  { name: '混一条龙', multiplier: 6, description: '混有字牌的一条龙胡牌牌型。' },
  { name: '豪华七对', multiplier: 8, description: '在七对子的基础上，有四个相同的牌充当两个对子（未开杠）。' },
  { name: '双豪七对', multiplier: 16, description: '在七对子的基础上，有两个暗刻子充当相同的四个对子。' },
  { name: '三豪七对', multiplier: 32, description: '有三组相同的四个对子。' },
  { name: '小三元', multiplier: 9, description: '中发白其中两组为刻子，另一组为对子。' },
  { name: '幺九', multiplier: 9, description: '整副牌皆由一、九或者字牌构成。' },
  { name: '清幺九', multiplier: 20, description: '全副牌纯由一和九的序数牌组成。' },
  { name: '四暗刻', multiplier: 10, description: '手牌中有四个非碰出来的暗刻（或暗杠）。' },
  { name: '十三幺', multiplier: 13, description: '由三种花色的一九牌、中发白、东南西北，加其中任意一张组成的牌型。' },
  { name: '小四喜', multiplier: 13, description: '东南西北其中三个写成刻子，另一个编写成对子。' },
  { name: '大三元', multiplier: 16, description: '中发白三组均写成刻子。' },
  { name: '红孔雀', multiplier: 16, description: '整副牌完全由条子中的中国红雕像（红中、条字绿红等）组合。' },
  { name: '蓝一色', multiplier: 16, description: '整幅牌全部由青色或蓝色字牌和特定条子构成。' },
  { name: '绿一色', multiplier: 16, description: '由二、三、四、六、八条以及“发”字组成的胡牌牌型。' },
  { name: '字一色', multiplier: 20, description: '整副手牌全部由字牌（东南西北中发白）组成。' },
  { name: '大四喜', multiplier: 24, description: '东南西北四个风牌写成刻子（或杠）。' },
  { name: '十八罗汉', multiplier: 24, description: '胡牌时完成四组杠牌，拥有18张牌的牌型。' },
  { name: '九莲宝灯', multiplier: 24, description: '清一色同花色中含 1112345678999 的特定牌型。' },
  { name: '七星', multiplier: 24, description: '字一色的基础上含有全部七种不同的字牌对子。' },
  { name: '地胡', multiplier: 50, description: '庄家打出第一张牌即被闲家胡牌。' },
  { name: '天胡', multiplier: 50, description: '庄家起手即自摸胡牌。' }
];
