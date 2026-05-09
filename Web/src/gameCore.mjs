export const Directions = Object.freeze(['Up', 'Down', 'Left', 'Right']);
export const MagicTypes = Object.freeze(['Fire', 'Ice', 'Thunder', 'Dark', 'Light']);

export const DirectionArrows = Object.freeze({
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
});

export const MagicConfig = Object.freeze({
  Fire: { label: '火', color: '#ff6b35', secondary: '#ffd166', mana: 14, baseDamage: 20, ultimate: 16 },
  Ice: { label: '氷', color: '#7bdff2', secondary: '#e0fbfc', mana: 11, baseDamage: 16, ultimate: 12 },
  Thunder: { label: '雷', color: '#f9f871', secondary: '#a78bfa', mana: 13, baseDamage: 18, ultimate: 15 },
  Dark: { label: '闇', color: '#8b5cf6', secondary: '#111827', mana: 12, baseDamage: 17, ultimate: 18 },
  Light: { label: '光', color: '#fff7ad', secondary: '#fbbf24', mana: 12, baseDamage: 17, ultimate: 14 },
});

export const StartingMage = Object.freeze({
  hp: 100,
  mana: 100,
  ultimate: 0,
  wins: 0,
});

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createMage(name) {
  return {
    name,
    hp: StartingMage.hp,
    mana: StartingMage.mana,
    ultimate: StartingMage.ultimate,
    wins: StartingMage.wins,
    history: [],
    hitReads: 0,
    actionStreak: { attack: 0, defend: 0, feint: 0 },
  };
}

export function resetForRound(mage) {
  mage.hp = StartingMage.hp;
  mage.mana = StartingMage.mana;
  mage.ultimate = StartingMage.ultimate;
  mage.history = [];
  mage.hitReads = 0;
  mage.actionStreak = { attack: 0, defend: 0, feint: 0 };
}

export function getElementMultiplier(attackMagic, defenseMagic) {
  if (attackMagic === 'Fire' && defenseMagic === 'Ice') return 1.5;
  if (attackMagic === 'Ice' && defenseMagic === 'Fire') return 0.5;
  if (attackMagic === 'Thunder' && defenseMagic === 'Light') return 1.25;
  if (attackMagic === 'Light' && defenseMagic === 'Dark') return 1.25;
  if (attackMagic === 'Dark' && defenseMagic === 'Light') return 1.25;
  return 1;
}

export function damageForSpell(magic, defenderMagic, isUltimate = false) {
  const config = MagicConfig[magic];
  const base = isUltimate ? config.baseDamage + config.ultimate : config.baseDamage;
  return Math.round(base * getElementMultiplier(magic, defenderMagic));
}

export function manaCost(magic, isUltimate = false) {
  return MagicConfig[magic].mana + (isUltimate ? 35 : 0);
}

export function canPayMana(mage, magic, isUltimate = false) {
  return mage.mana >= manaCost(magic, isUltimate);
}

export function recordChoice(mage, choice) {
  mage.history.push({ ...choice });
  if (mage.history.length > 24) mage.history.shift();

  mage.actionStreak.attack = choice.action === 'attack' ? mage.actionStreak.attack + 1 : 0;
  mage.actionStreak.defend = choice.action === 'defend' ? mage.actionStreak.defend + 1 : 0;
  mage.actionStreak.feint = choice.feint ? mage.actionStreak.feint + 1 : 0;
}

export function mostFrequentDirection(history) {
  if (!history.length) return 'Up';
  const counts = Object.fromEntries(Directions.map((direction) => [direction, 0]));
  for (const item of history) {
    counts[item.direction] += 1;
  }
  return Directions.reduce((best, direction) => (counts[direction] > counts[best] ? direction : best), 'Up');
}

export function buildReadout(history) {
  if (!history.length) return 'まだ読み合いデータなし';
  const topDirection = mostFrequentDirection(history);
  const attacks = history.filter((item) => item.action === 'attack').length;
  const feints = history.filter((item) => item.feint).length;
  const attackRate = Math.round((attacks / history.length) * 100);
  const feintRate = Math.round((feints / history.length) * 100);
  return `${DirectionArrows[topDirection]}方向が最多 / 攻撃率${attackRate}% / フェイント率${feintRate}%`;
}

export function predictAiChoice(playerHistory, aiMage, turnNumber) {
  const predictedDirection = mostFrequentDirection(playerHistory);
  const playerAttackRate = playerHistory.length
    ? playerHistory.filter((item) => item.action === 'attack').length / playerHistory.length
    : 0.55;

  const action = playerAttackRate > 0.58 ? 'defend' : turnNumber % 3 === 0 ? 'defend' : 'attack';
  const magic = MagicTypes[(turnNumber + aiMage.history.length) % MagicTypes.length];
  const direction = action === 'defend'
    ? predictedDirection
    : Directions[(Directions.indexOf(predictedDirection) + 1 + (turnNumber % 2)) % Directions.length];
  const feint = action === 'attack' && aiMage.ultimate >= 50 && turnNumber % 4 === 0;
  const ultimate = action === 'attack' && aiMage.ultimate >= 100 && aiMage.mana >= manaCost(magic, true);

  return { action, direction, magic, feint, ultimate };
}

export function applyFeint(choice) {
  if (!choice.feint) return choice;
  const nextIndex = (Directions.indexOf(choice.direction) + 1) % Directions.length;
  return { ...choice, direction: Directions[nextIndex] };
}

function resolveAttack({ attacker, defender, attackChoice, defenseChoice }) {
  const finalAttack = applyFeint(attackChoice);
  const blocked = finalAttack.direction !== defenseChoice.direction;
  const paidMana = canPayMana(attacker, finalAttack.magic, finalAttack.ultimate);

  if (!paidMana) {
    attacker.mana = clamp(attacker.mana + 8, 0, 100);
    return {
      hit: false,
      blocked: true,
      damage: 0,
      text: `${attacker.name}はマナ不足。魔法が不発！`,
      attackDirection: finalAttack.direction,
      defenseDirection: defenseChoice.direction,
      magic: finalAttack.magic,
    };
  }

  attacker.mana = clamp(attacker.mana - manaCost(finalAttack.magic, finalAttack.ultimate), 0, 100);

  if (blocked) {
    attacker.ultimate = clamp(attacker.ultimate + 6, 0, 100);
    defender.mana = clamp(defender.mana + 8, 0, 100);
    return {
      hit: false,
      blocked: true,
      damage: 0,
      text: `${defender.name}が${DirectionArrows[defenseChoice.direction]}で読み勝ち、${attacker.name}の${MagicConfig[finalAttack.magic].label}を防いだ！`,
      attackDirection: finalAttack.direction,
      defenseDirection: defenseChoice.direction,
      magic: finalAttack.magic,
    };
  }

  const damage = damageForSpell(finalAttack.magic, defenseChoice.magic, finalAttack.ultimate);
  defender.hp = clamp(defender.hp - damage, 0, 100);
  attacker.ultimate = clamp(attacker.ultimate + (finalAttack.ultimate ? -100 : 18), 0, 100);
  defender.ultimate = clamp(defender.ultimate + 10, 0, 100);
  attacker.hitReads += 1;

  return {
    hit: true,
    blocked: false,
    damage,
    text: `${attacker.name}の${finalAttack.ultimate ? '必殺 ' : ''}${MagicConfig[finalAttack.magic].label}が${DirectionArrows[finalAttack.direction]}で的中！ ${damage}ダメージ`,
    attackDirection: finalAttack.direction,
    defenseDirection: defenseChoice.direction,
    magic: finalAttack.magic,
  };
}

export function resolveTurn(player, enemy, playerChoice, enemyChoice) {
  const pChoice = { ...playerChoice };
  const eChoice = { ...enemyChoice };
  const events = [];

  recordChoice(player, pChoice);
  recordChoice(enemy, eChoice);

  if (pChoice.action === 'attack' && eChoice.action === 'defend') {
    events.push(resolveAttack({ attacker: player, defender: enemy, attackChoice: pChoice, defenseChoice: eChoice }));
  } else if (pChoice.action === 'defend' && eChoice.action === 'attack') {
    events.push(resolveAttack({ attacker: enemy, defender: player, attackChoice: eChoice, defenseChoice: pChoice }));
  } else if (pChoice.action === 'attack' && eChoice.action === 'attack') {
    const pFinal = applyFeint(pChoice);
    const eFinal = applyFeint(eChoice);
    const pPaid = canPayMana(player, pFinal.magic, pFinal.ultimate);
    const ePaid = canPayMana(enemy, eFinal.magic, eFinal.ultimate);

    if (pPaid) player.mana = clamp(player.mana - manaCost(pFinal.magic, pFinal.ultimate), 0, 100);
    if (ePaid) enemy.mana = clamp(enemy.mana - manaCost(eFinal.magic, eFinal.ultimate), 0, 100);

    if (!pPaid && !ePaid) {
      events.push({ hit: false, blocked: true, damage: 0, text: '両者マナ不足。魔法は静かに消えた。', magic: 'Light' });
    } else if (pFinal.direction === eFinal.direction) {
      const pDamage = pPaid ? Math.round(damageForSpell(pFinal.magic, eFinal.magic, pFinal.ultimate) * 0.65) : 0;
      const eDamage = ePaid ? Math.round(damageForSpell(eFinal.magic, pFinal.magic, eFinal.ultimate) * 0.65) : 0;
      enemy.hp = clamp(enemy.hp - pDamage, 0, 100);
      player.hp = clamp(player.hp - eDamage, 0, 100);
      player.ultimate = clamp(player.ultimate + (pFinal.ultimate ? -100 : 12), 0, 100);
      enemy.ultimate = clamp(enemy.ultimate + (eFinal.ultimate ? -100 : 12), 0, 100);
      events.push({ hit: true, clash: true, damage: pDamage, text: `同方向${DirectionArrows[pFinal.direction]}で魔法衝突！ 双方に反動ダメージ`, magic: pFinal.magic });
    } else {
      player.ultimate = clamp(player.ultimate + 8, 0, 100);
      enemy.ultimate = clamp(enemy.ultimate + 8, 0, 100);
      events.push({ hit: false, clash: true, damage: 0, text: '攻撃方向が交差し、中央結界で相殺された。', magic: pFinal.magic });
    }
  } else {
    player.mana = clamp(player.mana + 12, 0, 100);
    enemy.mana = clamp(enemy.mana + 12, 0, 100);
    player.ultimate = clamp(player.ultimate + 4, 0, 100);
    enemy.ultimate = clamp(enemy.ultimate + 4, 0, 100);
    events.push({ hit: false, blocked: true, damage: 0, text: '両者防御。静かな読み合いでマナを回復。', magic: 'Ice' });
  }

  player.mana = clamp(player.mana + 4, 0, 100);
  enemy.mana = clamp(enemy.mana + 4, 0, 100);

  const winner = player.hp <= 0 && enemy.hp <= 0 ? 'draw' : player.hp <= 0 ? 'enemy' : enemy.hp <= 0 ? 'player' : null;
  return { events, winner };
}
