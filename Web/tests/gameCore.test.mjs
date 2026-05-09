import assert from 'node:assert/strict';
import {
  buildReadout,
  createMage,
  damageForSpell,
  getElementMultiplier,
  predictAiChoice,
  resolveTurn,
} from '../src/gameCore.mjs';

assert.equal(getElementMultiplier('Fire', 'Ice'), 1.5);
assert.equal(getElementMultiplier('Ice', 'Fire'), 0.5);
assert.equal(damageForSpell('Fire', 'Ice'), 30);

const player = createMage('PLAYER');
const enemy = createMage('CPU');
let result = resolveTurn(
  player,
  enemy,
  { action: 'attack', direction: 'Up', magic: 'Fire', feint: false, ultimate: false },
  { action: 'defend', direction: 'Up', magic: 'Ice', feint: false, ultimate: false },
);
assert.equal(result.events[0].hit, true);
assert.equal(enemy.hp, 70);
assert.equal(player.history.length, 1);
assert.match(buildReadout(player.history), /↑方向が最多/);

result = resolveTurn(
  player,
  enemy,
  { action: 'defend', direction: 'Left', magic: 'Ice', feint: false, ultimate: false },
  { action: 'attack', direction: 'Right', magic: 'Dark', feint: false, ultimate: false },
);
assert.equal(result.events[0].blocked, true);
assert.equal(player.hp, 100);

const aiChoice = predictAiChoice(player.history, enemy, 3);
assert.ok(['attack', 'defend'].includes(aiChoice.action));
assert.ok(['Up', 'Down', 'Left', 'Right'].includes(aiChoice.direction));
console.log('gameCore tests passed');
