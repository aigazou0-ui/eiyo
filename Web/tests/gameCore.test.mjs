import assert from 'node:assert/strict';
import {
  buildReadout,
  canUseUltimate,
  compareRps,
  createMage,
  matchWinner,
  predictAiMagic,
  predictAiRps,
  resolveMagicExchange,
  roleFromRpsWinner,
} from '../src/gameCore.mjs';

assert.equal(compareRps('Rock', 'Scissors'), 'player');
assert.equal(compareRps('Scissors', 'Rock'), 'enemy');
assert.equal(compareRps('Paper', 'Paper'), 'draw');
assert.deepEqual(roleFromRpsWinner('player'), { playerRole: 'attack', enemyRole: 'defend' });

const player = createMage('PLAYER');
const enemy = createMage('CPU');
let result = resolveMagicExchange({
  attacker: player,
  defender: enemy,
  attackerMagic: 'Fire',
  defenderMagic: 'Fire',
});
assert.equal(result.blocked, true);
assert.equal(enemy.hp, 100);
assert.equal(player.damagePassed, 0);

for (const magic of ['Fire', 'Ice', 'Thunder']) {
  result = resolveMagicExchange({ attacker: player, defender: enemy, attackerMagic: magic, defenderMagic: 'Light' });
  assert.equal(result.hit, true);
}
assert.equal(player.damagePassed, 3);
assert.equal(canUseUltimate(player), true);
assert.match(buildReadout(player.history), /攻撃率100%/);

result = resolveMagicExchange({
  attacker: player,
  defender: enemy,
  attackerMagic: 'Dark',
  defenderMagic: 'Dark',
  useUltimate: true,
});
assert.equal(result.ultimate, true);
assert.equal(result.blocked, false);
assert.equal(player.damagePassed, 0);
assert.ok(enemy.hp <= 0);
assert.equal(matchWinner(player, enemy), 'player');

assert.equal(predictAiRps(['Rock'], 2), 'Paper');
assert.equal(predictAiMagic(player.history, enemy, 'defend', 1), 'Fire');
console.log('gameCore tests passed');
