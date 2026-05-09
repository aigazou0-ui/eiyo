import {
  DirectionArrows,
  Directions,
  MagicConfig,
  MagicTypes,
  buildReadout,
  createMage,
  predictAiChoice,
  resetForRound,
  resolveTurn,
} from './gameCore.mjs';

const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d');
const log = document.querySelector('#battleLog');
const banner = document.querySelector('#banner');

const ui = {
  playerHp: document.querySelector('#playerHp'),
  playerMana: document.querySelector('#playerMana'),
  playerUlt: document.querySelector('#playerUlt'),
  enemyHp: document.querySelector('#enemyHp'),
  enemyMana: document.querySelector('#enemyMana'),
  enemyUlt: document.querySelector('#enemyUlt'),
  playerWins: document.querySelector('#playerWins'),
  enemyWins: document.querySelector('#enemyWins'),
  roundText: document.querySelector('#roundText'),
  turnText: document.querySelector('#turnText'),
  timerText: document.querySelector('#timerText'),
  playerReadout: document.querySelector('#playerReadout'),
  enemyReadout: document.querySelector('#enemyReadout'),
  startButton: document.querySelector('#startButton'),
  feintButton: document.querySelector('#feintButton'),
  ultimateButton: document.querySelector('#ultimateButton'),
};

const state = {
  player: createMage('PLAYER'),
  enemy: createMage('CPU'),
  round: 1,
  turn: 1,
  phase: 'title',
  currentChoice: {
    action: 'attack',
    direction: 'Up',
    magic: 'Fire',
    feint: false,
    ultimate: false,
  },
  lastPlayerChoice: null,
  lastEnemyChoice: null,
  particles: [],
  beams: [],
  shake: 0,
  freezeUntil: 0,
  roundMessage: 'Press Start',
};

function addLog(message) {
  const item = document.createElement('li');
  item.textContent = message;
  log.prepend(item);
  while (log.children.length > 9) log.lastElementChild.remove();
}

function flashBanner(message, ms = 1100) {
  banner.textContent = message;
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), ms);
}

function updateSelectedButtons() {
  document.querySelectorAll('[data-action]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.action === state.currentChoice.action);
  });
  document.querySelectorAll('[data-direction]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.direction === state.currentChoice.direction);
  });
  document.querySelectorAll('[data-magic]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.magic === state.currentChoice.magic);
  });
  ui.feintButton.classList.toggle('toggled', state.currentChoice.feint);
  ui.ultimateButton.classList.toggle('toggled', state.currentChoice.ultimate);
  ui.ultimateButton.classList.toggle('disabled', state.player.ultimate < 100);
}

function updateHud() {
  ui.playerHp.value = state.player.hp;
  ui.playerMana.value = state.player.mana;
  ui.playerUlt.value = state.player.ultimate;
  ui.enemyHp.value = state.enemy.hp;
  ui.enemyMana.value = state.enemy.mana;
  ui.enemyUlt.value = state.enemy.ultimate;
  ui.playerWins.textContent = `${state.player.wins} Wins`;
  ui.enemyWins.textContent = `${state.enemy.wins} Wins`;
  ui.roundText.textContent = `Round ${state.round}`;
  ui.turnText.textContent = `Turn ${state.turn}`;
  ui.timerText.textContent = state.phase === 'playing' ? 'Space: 攻撃 / Shift: 防御' : state.roundMessage;
  ui.playerReadout.textContent = buildReadout(state.player.history);
  ui.enemyReadout.textContent = buildReadout(state.enemy.history);
  updateSelectedButtons();
}

function spawnParticles(x, y, magic, amount = 36, burst = 1) {
  const config = MagicConfig[magic];
  for (let i = 0; i < amount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (1.5 + Math.random() * 5) * burst;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 5,
      life: 28 + Math.random() * 34,
      maxLife: 62,
      color: Math.random() > 0.5 ? config.color : config.secondary,
    });
  }
}

function spawnBeam(fromX, fromY, toX, toY, magic, hit) {
  state.beams.push({ fromX, fromY, toX, toY, magic, life: hit ? 28 : 18, maxLife: hit ? 28 : 18, hit });
  spawnParticles(toX, toY, magic, hit ? 72 : 28, hit ? 1.25 : 0.75);
  if (hit) {
    state.shake = 20;
    state.freezeUntil = performance.now() + 80;
  }
}

function commit(action) {
  if (state.phase !== 'playing') return;
  state.currentChoice.action = action;
  const playerChoice = { ...state.currentChoice };
  if (playerChoice.ultimate && state.player.ultimate < 100) {
    playerChoice.ultimate = false;
    addLog('必殺ゲージ不足。通常魔法として発動。');
  }

  const enemyChoice = predictAiChoice(state.player.history, state.enemy, state.turn);
  state.lastPlayerChoice = playerChoice;
  state.lastEnemyChoice = enemyChoice;
  const result = resolveTurn(state.player, state.enemy, playerChoice, enemyChoice);

  for (const event of result.events) {
    addLog(event.text);
    if (event.magic) {
      const playerCasts = playerChoice.action === 'attack';
      const enemyCasts = enemyChoice.action === 'attack';
      if (playerCasts) spawnBeam(300, 360, event.hit ? 980 : 640, event.hit ? 340 : 300, playerChoice.magic, event.hit);
      if (enemyCasts) spawnBeam(980, 300, event.hit && !playerCasts ? 300 : 640, event.hit && !playerCasts ? 360 : 300, enemyChoice.magic, event.hit && !playerCasts);
    }
  }

  if (result.winner) {
    finishRound(result.winner);
  } else {
    state.turn += 1;
    state.currentChoice.feint = false;
    state.currentChoice.ultimate = false;
  }
  updateHud();
}

function finishRound(winner) {
  state.phase = 'roundOver';
  if (winner === 'player') {
    state.player.wins += 1;
    state.roundMessage = 'PLAYER ROUND!';
  } else if (winner === 'enemy') {
    state.enemy.wins += 1;
    state.roundMessage = 'CPU ROUND!';
  } else {
    state.roundMessage = 'DOUBLE KO!';
  }
  flashBanner(state.roundMessage, 1400);
  addLog(state.roundMessage);

  if (state.player.wins >= 2 || state.enemy.wins >= 2) {
    state.phase = 'gameOver';
    const message = state.player.wins > state.enemy.wins ? 'PLAYER WINS MATCH!' : 'CPU WINS MATCH!';
    state.roundMessage = message;
    flashBanner(message, 2200);
    addLog(message);
    updateHud();
    return;
  }

  setTimeout(() => {
    state.round += 1;
    state.turn = 1;
    resetForRound(state.player);
    resetForRound(state.enemy);
    state.phase = 'playing';
    state.roundMessage = '入力待ち';
    flashBanner(`ROUND ${state.round}`, 900);
    updateHud();
  }, 1500);
}

function startGame() {
  state.player = createMage('PLAYER');
  state.enemy = createMage('CPU');
  state.round = 1;
  state.turn = 1;
  state.phase = 'playing';
  state.roundMessage = '入力待ち';
  state.currentChoice = { action: 'attack', direction: 'Up', magic: 'Fire', feint: false, ultimate: false };
  state.particles = [];
  state.beams = [];
  log.innerHTML = '';
  addLog('魔法決闘開始。方向を読み、同じ方向を刺せ！');
  flashBanner('BATTLE START', 1000);
  updateHud();
}

function drawMage(x, y, side, mage, choice, color) {
  const bob = Math.sin(performance.now() / 360 + x) * 5;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(side === 'left' ? 1 : -1, 1);

  const gradient = ctx.createRadialGradient(0, -60, 10, 0, -60, 105);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(15,23,42,0.05)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, -55, 105, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#111827';
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-48, 78);
  ctx.lineTo(-22, -34);
  ctx.quadraticCurveTo(0, -70, 26, -34);
  ctx.lineTo(52, 78);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(0, -82, 25, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(28, -26);
  ctx.lineTo(78, -58);
  ctx.stroke();

  const selected = choice?.direction ?? 'Up';
  ctx.scale(side === 'left' ? 1 : -1, 1);
  ctx.fillStyle = '#fff7ad';
  ctx.font = '900 46px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(DirectionArrows[selected], side === 'left' ? 0 : 0, -145);
  ctx.font = '700 18px sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(mage.name, 0, 110);
  ctx.restore();
}

function drawArena() {
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const grd = ctx.createLinearGradient(0, 0, width, height);
  grd.addColorStop(0, '#050711');
  grd.addColorStop(0.5, '#111827');
  grd.addColorStop(1, '#180a20');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 0; y < height; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }

  ctx.save();
  ctx.translate(width / 2, height / 2 + 20);
  const pulse = 0.5 + Math.sin(performance.now() / 260) * 0.5;
  ctx.strokeStyle = `rgba(34, 211, 238, ${0.35 + pulse * 0.25})`;
  ctx.lineWidth = 5;
  for (let r = 54; r <= 172; r += 38) {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.rotate(performance.now() / 2400);
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI * 2 * i) / 6;
    const x = Math.cos(a) * 145;
    const y = Math.sin(a) * 145;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = 'rgba(34, 211, 238, 0.08)';
  ctx.fillRect(width / 2 - 16, 60, 32, height - 120);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.8)';
  ctx.font = '800 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('中央結界 - 侵入不可', width / 2, 72);

  drawMage(300, 430, 'left', state.player, state.currentChoice, '#22d3ee');
  drawMage(980, 410, 'right', state.enemy, state.lastEnemyChoice, '#a78bfa');
}

function drawEffects() {
  for (const beam of state.beams) {
    const config = MagicConfig[beam.magic];
    const alpha = beam.life / beam.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = config.color;
    ctx.shadowColor = config.color;
    ctx.shadowBlur = beam.hit ? 26 : 14;
    ctx.lineWidth = beam.hit ? 12 : 7;
    ctx.beginPath();
    ctx.moveTo(beam.fromX, beam.fromY);
    const midX = (beam.fromX + beam.toX) / 2;
    ctx.quadraticCurveTo(midX, beam.fromY - 90, beam.toX, beam.toY);
    ctx.stroke();
    ctx.restore();
  }

  for (const p of state.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function tickEffects() {
  state.beams = state.beams.filter((beam) => {
    beam.life -= 1;
    return beam.life > 0;
  });
  state.particles = state.particles.filter((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.06;
    p.life -= 1;
    return p.life > 0;
  });
  state.shake = Math.max(0, state.shake - 1);
}

function loop(now) {
  requestAnimationFrame(loop);
  if (now < state.freezeUntil) return;

  ctx.save();
  if (state.shake > 0) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }
  drawArena();
  drawEffects();
  ctx.restore();
  tickEffects();
}

function cycleDirection(delta) {
  const index = Directions.indexOf(state.currentChoice.direction);
  state.currentChoice.direction = Directions[(index + delta + Directions.length) % Directions.length];
  updateHud();
}

function cycleMagic(delta) {
  const index = MagicTypes.indexOf(state.currentChoice.magic);
  state.currentChoice.magic = MagicTypes[(index + delta + MagicTypes.length) % MagicTypes.length];
  updateHud();
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.action) state.currentChoice.action = target.dataset.action;
  if (target.dataset.direction) state.currentChoice.direction = target.dataset.direction;
  if (target.dataset.magic) state.currentChoice.magic = target.dataset.magic;
  if (target.id === 'feintButton') state.currentChoice.feint = !state.currentChoice.feint;
  if (target.id === 'ultimateButton' && state.player.ultimate >= 100) state.currentChoice.ultimate = !state.currentChoice.ultimate;
  updateHud();
});

ui.startButton.addEventListener('click', startGame);

document.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  if (key === 'enter') startGame();
  if (key === 'w') state.currentChoice.direction = 'Up';
  if (key === 's') state.currentChoice.direction = 'Down';
  if (key === 'a') state.currentChoice.direction = 'Left';
  if (key === 'd') state.currentChoice.direction = 'Right';
  if (key === 'arrowup') cycleDirection(-1);
  if (key === 'arrowdown') cycleDirection(1);
  if (key === 'j') state.currentChoice.magic = 'Fire';
  if (key === 'k') state.currentChoice.magic = 'Ice';
  if (key === 'l') state.currentChoice.magic = 'Thunder';
  if (key === ';') state.currentChoice.magic = 'Dark';
  if (key === "'") state.currentChoice.magic = 'Light';
  if (key === 'arrowleft') cycleMagic(-1);
  if (key === 'arrowright') cycleMagic(1);
  if (key === 'f') state.currentChoice.feint = !state.currentChoice.feint;
  if (key === 'u' && state.player.ultimate >= 100) state.currentChoice.ultimate = !state.currentChoice.ultimate;
  if (event.code === 'Space') {
    event.preventDefault();
    commit('attack');
  }
  if (event.key === 'Shift') commit('defend');
  updateHud();
});

updateHud();
requestAnimationFrame(loop);
