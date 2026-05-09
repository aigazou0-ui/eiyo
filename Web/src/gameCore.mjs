export const RpsChoices = Object.freeze(['Rock', 'Scissors', 'Paper']);
export const MagicTypes = Object.freeze(['Fire', 'Ice', 'Thunder', 'Dark', 'Light']);

export const RpsConfig = Object.freeze({
  Rock: { label: 'グー', icon: '✊' },
  Scissors: { label: 'チョキ', icon: '✌️' },
  Paper: { label: 'パー', icon: '✋' },
});

export const MagicConfig = Object.freeze({
  Fire: { label: '火', color: '#ff6b35', secondary: '#ffd166', damage: 24, ultimateDamage: 62 },
  Ice: { label: '氷', color: '#7bdff2', secondary: '#e0fbfc', damage: 20, ultimateDamage: 54 },
  Thunder: { label: '雷', color: '#f9f871', secondary: '#a78bfa', damage: 22, ultimateDamage: 58 },
  Dark: { label: '闇', color: '#8b5cf6', secondary: '#111827', damage: 23, ultimateDamage: 60 },
  Light: { label: '光', color: '#fff7ad', secondary: '#fbbf24', damage: 21, ultimateDamage: 56 },
});

export const StartingMage = Object.freeze({
  hp: 100,
  wins: 0,
  damagePassed: 0,
});

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createMage(name) {
  return {
    name,
    hp: StartingMage.hp,
    wins: StartingMage.wins,
    damagePassed: StartingMage.damagePassed,
    history: [],
    rpsHistory: [],
  };
}

export function resetForRound(mage) {
  mage.hp = StartingMage.hp;
  mage.damagePassed = StartingMage.damagePassed;
  mage.history = [];
  mage.rpsHistory = [];
}

export function compareRps(playerChoice, enemyChoice) {
  if (playerChoice === enemyChoice) return 'draw';
  const wins = (
    (playerChoice === 'Rock' && enemyChoice === 'Scissors')
    || (playerChoice === 'Scissors' && enemyChoice === 'Paper')
    || (playerChoice === 'Paper' && enemyChoice === 'Rock')
  );
  return wins ? 'player' : 'enemy';
}

export function roleFromRpsWinner(winner) {
  if (winner === 'player') return { playerRole: 'attack', enemyRole: 'defend' };
  if (winner === 'enemy') return { playerRole: 'defend', enemyRole: 'attack' };
  return { playerRole: 'none', enemyRole: 'none' };
}

export function canUseUltimate(mage) {
  return mage.damagePassed >= 3;
}

export function recordMagic(mage, record) {
  mage.history.push({ ...record });
  if (mage.history.length > 24) mage.history.shift();
}

export function mostFrequentMagic(history) {
  if (!history.length) return 'Fire';
  const counts = Object.fromEntries(MagicTypes.map((magic) => [magic, 0]));
  for (const item of history) {
    counts[item.magic] += 1;
  }
  return MagicTypes.reduce((best, magic) => (counts[magic] > counts[best] ? magic : best), 'Fire');
}

export function buildReadout(history) {
  if (!history.length) return 'まだ読み合いデータなし';
  const topMagic = mostFrequentMagic(history);
  const attacks = history.filter((item) => item.role === 'attack').length;
  const blocks = history.filter((item) => item.blocked).length;
  const ultimates = history.filter((item) => item.ultimate).length;
  const attackRate = Math.round((attacks / history.length) * 100);
  const blockRate = Math.round((blocks / history.length) * 100);
  return `${MagicConfig[topMagic].label}が最多 / 攻撃率${attackRate}% / 属性ガード率${blockRate}% / 必殺${ultimates}回`;
}

export function predictAiRps(playerRpsHistory, turnNumber) {
  if (!playerRpsHistory.length) return RpsChoices[turnNumber % RpsChoices.length];
  const lastRps = playerRpsHistory.at(-1);
  const counter = { Rock: 'Paper', Scissors: 'Rock', Paper: 'Scissors' };
  return counter[lastRps] ?? RpsChoices[turnNumber % RpsChoices.length];
}

export function predictAiMagic(playerHistory, aiMage, role, turnNumber) {
  if (role === 'defend') {
    return mostFrequentMagic(playerHistory.filter((item) => item.role === 'attack'));
  }
  if (canUseUltimate(aiMage)) {
    return MagicTypes[(turnNumber + 2) % MagicTypes.length];
  }
  return MagicTypes[(turnNumber + aiMage.history.length) % MagicTypes.length];
}

export function resolveMagicExchange({ attacker, defender, attackerMagic, defenderMagic, useUltimate = false }) {
  const ultimate = useUltimate && canUseUltimate(attacker);
  const blocked = !ultimate && attackerMagic === defenderMagic;

  recordMagic(attacker, { role: 'attack', magic: attackerMagic, blocked, ultimate });
  recordMagic(defender, { role: 'defend', magic: defenderMagic, blocked, ultimate: false });

  if (blocked) {
    return {
      hit: false,
      blocked: true,
      ultimate: false,
      damage: 0,
      text: `${defender.name}が${MagicConfig[defenderMagic].label}属性を合わせた！ ダメージなし。`,
    };
  }

  const damage = ultimate ? MagicConfig[attackerMagic].ultimateDamage : MagicConfig[attackerMagic].damage;
  defender.hp = clamp(defender.hp - damage, 0, 100);

  if (ultimate) {
    attacker.damagePassed = 0;
  } else {
    attacker.damagePassed = clamp(attacker.damagePassed + 1, 0, 3);
  }

  return {
    hit: true,
    blocked: false,
    ultimate,
    damage,
    text: ultimate
      ? `${attacker.name}の必殺技！ ${MagicConfig[attackerMagic].label}奥義はガード不可、${damage}ダメージ！`
      : `${attacker.name}の${MagicConfig[attackerMagic].label}属性が通った！ ${damage}ダメージ。必殺カウント ${attacker.damagePassed}/3`,
  };
}

export function matchWinner(player, enemy) {
  if (player.hp <= 0 && enemy.hp <= 0) return 'draw';
  if (player.hp <= 0) return 'enemy';
  if (enemy.hp <= 0) return 'player';
  return null;
}
