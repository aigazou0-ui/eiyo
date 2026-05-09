import {
  MagicConfig,
  RpsConfig,
  buildReadout,
  canUseUltimate,
  compareRps,
  createMage,
  matchWinner,
  predictAiMagic,
  predictAiRps,
  resetForRound,
  resolveMagicExchange,
  roleFromRpsWinner,
} from './gameCore.mjs';

const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d');
const log = document.querySelector('#battleLog');
const banner = document.querySelector('#banner');

const ui = {
  playerHp: document.querySelector('#playerHp'),
  playerUlt: document.querySelector('#playerUlt'),
  playerUltText: document.querySelector('#playerUltText'),
  enemyHp: document.querySelector('#enemyHp'),
  enemyUlt: document.querySelector('#enemyUlt'),
  enemyUltText: document.querySelector('#enemyUltText'),
  playerWins: document.querySelector('#playerWins'),
  enemyWins: document.querySelector('#enemyWins'),
  roundText: document.querySelector('#roundText'),
  turnText: document.querySelector('#turnText'),
  timerText: document.querySelector('#timerText'),
  playerReadout: document.querySelector('#playerReadout'),
  enemyReadout: document.querySelector('#enemyReadout'),
  startButton: document.querySelector('#startButton'),
  confirmButton: document.querySelector('#confirmButton'),
  ultimateButton: document.querySelector('#ultimateButton'),
};

const state = {
  player: createMage('PLAYER'),
  enemy: createMage('CPU'),
  round: 1,
  turn: 1,
  phase: 'title',
  selectedRps: 'Rock',
  selectedMagic: 'Fire',
  playerRole: 'none',
  enemyRole: 'none',
  enemyRps: null,
  enemyMagic: null,
  useUltimate: false,
  lastMessage: 'Press Start',
  particles: [],
  beams: [],
  shake: 0,
  freezeUntil: 0,
};

function addLog(message) {
  const item = document.createElement('li');
  item.textContent = message;
  log.prepend(item);
  while (log.children.length > 10) log.lastElementChild.remove();
}

function flashBanner(message, ms = 1000) {
  banner.textContent = message;
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), ms);
}

function setPhase(phase, message) {
  state.phase = phase;
  state.lastMessage = message;
  updateHud();
}

function updateSelectedButtons() {
  document.querySelectorAll('[data-rps]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.rps === state.selectedRps);
    button.disabled = state.phase !== 'janken';
  });

  document.querySelectorAll('[data-magic]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.magic === state.selectedMagic);
    button.disabled = state.phase !== 'magic';
  });

  const ultimateReady = state.playerRole === 'attack' && canUseUltimate(state.player);
  ui.ultimateButton.classList.toggle('toggled', state.useUltimate && ultimateReady);
  ui.ultimateButton.classList.toggle('disabled', !ultimateReady || state.phase !== 'magic');
  ui.ultimateButton.disabled = !ultimateReady || state.phase !== 'magic';
  ui.confirmButton.disabled = !['janken', 'magic'].includes(state.phase);
}

function updateHud() {
  ui.playerHp.value = state.player.hp;
  ui.playerUlt.value = state.player.damagePassed;
  ui.playerUltText.textContent = `${state.player.damagePassed}/3 ダメージ成功${canUseUltimate(state.player) ? ' - 必殺可能' : ''}`;
  ui.enemyHp.value = state.enemy.hp;
  ui.enemyUlt.value = state.enemy.damagePassed;
  ui.enemyUltText.textContent = `${state.enemy.damagePassed}/3 ダメージ成功${canUseUltimate(state.enemy) ? ' - 必殺可能' : ''}`;
  ui.playerWins.textContent = `${state.player.wins} Wins`;
  ui.enemyWins.textContent = `${state.enemy.wins} Wins`;
  ui.roundText.textContent = `Round ${state.round}`;
  ui.turnText.textContent = `Turn ${state.turn}`;
  ui.timerText.textContent = state.lastMessage;
  ui.playerReadout.textContent = buildReadout(state.player.history);
  ui.enemyReadout.textContent = buildReadout(state.enemy.history);

  if (state.phase === 'janken') {
    ui.confirmButton.textContent = 'じゃんけん確定 Space';
  } else if (state.phase === 'magic') {
    ui.confirmButton.textContent = `${state.playerRole === 'attack' ? '攻撃属性' : '防御属性'}を確定 Space`;
  } else {
    ui.confirmButton.textContent = '選択を確定 Space';
  }

  updateSelectedButtons();
}

function startGame() {
  state.player = createMage('PLAYER');
  state.enemy = createMage('CPU');
  state.round = 1;
  state.turn = 1;
  state.selectedRps = 'Rock';
  state.selectedMagic = 'Fire';
  state.playerRole = 'none';
  state.enemyRole = 'none';
  state.enemyRps = null;
  state.enemyMagic = null;
  state.useUltimate = false;
  state.particles = [];
  state.beams = [];
  log.innerHTML = '';
  addLog('戦闘開始！ まずはじゃんけんで攻防を決めろ。');
  flashBanner('じゃんけん！', 900);
  setPhase('janken', '戦闘スタート: じゃんけんを選んで Space');
}

function commitCurrentPhase() {
  if (state.phase === 'janken') {
    commitJanken();
  } else if (state.phase === 'magic') {
    commitMagic();
  }
}

function commitJanken() {
  state.enemyRps = predictAiRps(state.player.rpsHistory, state.turn);
  const winner = compareRps(state.selectedRps, state.enemyRps);
  state.player.rpsHistory.push(state.selectedRps);
  state.enemy.rpsHistory.push(state.enemyRps);
  addLog(`じゃんけん: PLAYER ${RpsConfig[state.selectedRps].label} vs CPU ${RpsConfig[state.enemyRps].label}`);

  if (winner === 'draw') {
    flashBanner('あいこ！', 750);
    setPhase('janken', 'あいこ。もう一度じゃんけん！');
    return;
  }

  const roles = roleFromRpsWinner(winner);
  state.playerRole = roles.playerRole;
  state.enemyRole = roles.enemyRole;
  state.enemyMagic = predictAiMagic(state.player.history, state.enemy, state.enemyRole, state.turn);
  state.useUltimate = false;

  const message = winner === 'player'
    ? '勝ち！ あっちむいてほい: 攻撃属性をクリック'
    : '負け！ あっちむいてほい: 防御属性をクリック';
  addLog(winner === 'player' ? 'PLAYERが攻撃、CPUが防御。' : 'CPUが攻撃、PLAYERが防御。');
  flashBanner('あっちむいて…ほい！', 950);
  setPhase('magic', message);
}

function commitMagic() {
  const playerIsAttacker = state.playerRole === 'attack';
  const attacker = playerIsAttacker ? state.player : state.enemy;
  const defender = playerIsAttacker ? state.enemy : state.player;
  const attackerMagic = playerIsAttacker ? state.selectedMagic : state.enemyMagic;
  const defenderMagic = playerIsAttacker ? state.enemyMagic : state.selectedMagic;
  const useUltimate = playerIsAttacker ? state.useUltimate : canUseUltimate(state.enemy);

  const result = resolveMagicExchange({ attacker, defender, attackerMagic, defenderMagic, useUltimate });
  addLog(result.text);
  spawnBeam(playerIsAttacker ? 300 : 980, playerIsAttacker ? 360 : 300, playerIsAttacker ? 980 : 300, playerIsAttacker ? 340 : 360, attackerMagic, result.hit, result.ultimate);

  if (result.blocked) {
    flashBanner('属性ガード！', 900);
  } else if (result.ultimate) {
    flashBanner('ガード不可 必殺技！', 1200);
  } else {
    flashBanner('ダメージ成功！', 900);
  }

  const winner = matchWinner(state.player, state.enemy);
  if (winner) {
    finishRound(winner);
    updateHud();
    return;
  }

  state.turn += 1;
  state.playerRole = 'none';
  state.enemyRole = 'none';
  state.enemyRps = null;
  state.enemyMagic = null;
  state.useUltimate = false;
  setPhase('janken', '次の戦闘スタート: じゃんけんを選んで Space');
}

function finishRound(winner) {
  state.phase = 'roundOver';
  if (winner === 'player') {
    state.player.wins += 1;
    state.lastMessage = 'PLAYER ROUND!';
  } else if (winner === 'enemy') {
    state.enemy.wins += 1;
    state.lastMessage = 'CPU ROUND!';
  } else {
    state.lastMessage = 'DOUBLE KO!';
  }
  flashBanner(state.lastMessage, 1400);
  addLog(state.lastMessage);

  if (state.player.wins >= 2 || state.enemy.wins >= 2) {
    const message = state.player.wins > state.enemy.wins ? 'PLAYER WINS MATCH!' : 'CPU WINS MATCH!';
    state.phase = 'gameOver';
    state.lastMessage = message;
    flashBanner(message, 2200);
    addLog(message);
    return;
  }

  setTimeout(() => {
    state.round += 1;
    state.turn = 1;
    resetForRound(state.player);
    resetForRound(state.enemy);
    state.useUltimate = false;
    flashBanner(`ROUND ${state.round}`, 900);
    setPhase('janken', '新ラウンド: じゃんけんを選んで Space');
  }, 1500);
}

function spawnParticles(x, y, magic, amount = 44, burst = 1) {
  const config = MagicConfig[magic];
  for (let i = 0; i < amount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (1.2 + Math.random() * 5.5) * burst;
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

function spawnBeam(fromX, fromY, toX, toY, magic, hit, ultimate = false) {
  state.beams.push({ fromX, fromY, toX, toY, magic, life: ultimate ? 42 : hit ? 28 : 18, maxLife: ultimate ? 42 : hit ? 28 : 18, hit, ultimate });
  spawnParticles(toX, toY, magic, ultimate ? 120 : hit ? 72 : 32, ultimate ? 1.8 : hit ? 1.25 : 0.75);
  if (hit) {
    state.shake = ultimate ? 34 : 20;
    state.freezeUntil = performance.now() + (ultimate ? 140 : 80);
  }
}

function drawMage(x, y, side, mage, color) {
  const bob = Math.sin(performance.now() / 360 + x) * 5;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(side === 'left' ? 1 : -1, 1);

  const gradient = ctx.createRadialGradient(0, -60, 10, 0, -60, 112);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(15,23,42,0.05)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, -55, 112, 0, Math.PI * 2);
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

  ctx.scale(side === 'left' ? 1 : -1, 1);
  ctx.fillStyle = '#fff7ad';
  ctx.font = '900 38px sans-serif';
  ctx.textAlign = 'center';
  const role = side === 'left' ? state.playerRole : state.enemyRole;
  const rps = side === 'left' ? state.selectedRps : state.enemyRps;
  const roleText = role === 'attack' ? '攻撃' : role === 'defend' ? '防御' : rps ? RpsConfig[rps].icon : '待機';
  ctx.fillText(roleText, 0, -145);
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
  ctx.fillText('中央結界 - 属性読み合い', width / 2, 72);

  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  ctx.font = '900 26px sans-serif';
  ctx.fillText(state.phase === 'janken' ? 'じゃんけん！' : state.phase === 'magic' ? 'あっちむいて…ほい！' : state.lastMessage, width / 2, 585);

  drawMage(300, 430, 'left', state.player, '#22d3ee');
  drawMage(980, 410, 'right', state.enemy, '#a78bfa');
}

function drawEffects() {
  for (const beam of state.beams) {
    const config = MagicConfig[beam.magic];
    const alpha = beam.life / beam.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = config.color;
    ctx.shadowColor = config.color;
    ctx.shadowBlur = beam.ultimate ? 46 : beam.hit ? 26 : 14;
    ctx.lineWidth = beam.ultimate ? 24 : beam.hit ? 12 : 7;
    ctx.beginPath();
    ctx.moveTo(beam.fromX, beam.fromY);
    const midX = (beam.fromX + beam.toX) / 2;
    ctx.quadraticCurveTo(midX, beam.fromY - 110, beam.toX, beam.toY);
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

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.rps && state.phase === 'janken') state.selectedRps = target.dataset.rps;
  if (target.dataset.magic && state.phase === 'magic') state.selectedMagic = target.dataset.magic;
  if (target.id === 'ultimateButton' && state.phase === 'magic' && state.playerRole === 'attack' && canUseUltimate(state.player)) {
    state.useUltimate = !state.useUltimate;
  }
  updateHud();
});

ui.startButton.addEventListener('click', startGame);
ui.confirmButton.addEventListener('click', commitCurrentPhase);

document.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  if (key === 'enter') startGame();
  if (state.phase === 'janken') {
    if (key === '1') state.selectedRps = 'Rock';
    if (key === '2') state.selectedRps = 'Scissors';
    if (key === '3') state.selectedRps = 'Paper';
  }
  if (state.phase === 'magic') {
    if (key === 'j') state.selectedMagic = 'Fire';
    if (key === 'k') state.selectedMagic = 'Ice';
    if (key === 'l') state.selectedMagic = 'Thunder';
    if (key === ';') state.selectedMagic = 'Dark';
    if (key === "'") state.selectedMagic = 'Light';
    if (key === 'u' && state.playerRole === 'attack' && canUseUltimate(state.player)) state.useUltimate = !state.useUltimate;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    commitCurrentPhase();
  }
  updateHud();
});

updateHud();
requestAnimationFrame(loop);
