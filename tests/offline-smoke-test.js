const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");

const root = path.resolve(__dirname, "..");
const context = {
  console,
  performance,
  window: {},
  self: {}
};
context.window = context;
context.self = context;
vm.createContext(context);

function loadScript(file) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  vm.runInContext(code, context, { filename: file });
}

[
  "js/pieces.js",
  "js/board.js",
  "js/rules.js",
  "js/evaluation.js",
  "js/opening-book.js",
  "js/opening.js",
  "js/ai.js",
  "js/ai-test.js"
].forEach(loadScript);

function assert(name, condition, details = "") {
  if (!condition) {
    throw new Error(`${name} failed${details ? `: ${details}` : ""}`);
  }
}

function moveKey(move) {
  if (!move) return "";
  if (move.drop) return `D${move.piece}${move.to.r}${move.to.c}`;
  return `${move.from.r}${move.from.c}${move.to.r}${move.to.c}${move.promote ? "+" : ""}`;
}

function runScriptTests() {
  const results = context.ShogiAiTest.runAllTests();
  const failures = results.filter(result => !result.ok);
  assert("ShogiAiTest.runAllTests", failures.length === 0, JSON.stringify(failures));
  return results.length;
}

function runSelfPlay({ level, plies, maxMs }) {
  let state = context.ShogiBoard.newState();
  const timings = [];
  for (let ply = 0; ply < plies; ply += 1) {
    const legal = context.ShogiRules.legalMoves(state, state.turn);
    if (!legal.length) break;
    const started = performance.now();
    const result = context.ShogiAI.searchRoot(state, level, { mobile: true });
    const elapsed = performance.now() - started;
    const move = result.bestMove;
    assert(`selfPlay legal ply ${ply + 1}`, context.ShogiRules.isLegalMove(state, move, state.turn), moveKey(move));
    assert(`selfPlay time ply ${ply + 1}`, elapsed <= maxMs, `${Math.round(elapsed)}ms ${moveKey(move)}`);
    state = context.ShogiBoard.applyMove(state, move);
    timings.push(elapsed);
  }
  return {
    plies: timings.length,
    maxMs: Math.round(Math.max(...timings)),
    avgMs: Math.round(timings.reduce((sum, item) => sum + item, 0) / timings.length)
  };
}

function endgameState() {
  return {
    board: [
      [null, null, null, { type: "G", owner: "w", promoted: false }, { type: "K", owner: "w", promoted: false }, null, null, null, null],
      [null, null, null, null, { type: "S", owner: "w", promoted: false }, null, null, null, null],
      [null, null, null, null, null, null, { type: "P", owner: "w", promoted: false }, null, null],
      [null, null, null, null, null, { type: "B", owner: "b", promoted: true }, null, null, null],
      [null, null, null, null, null, null, null, null, null],
      [null, null, null, { type: "R", owner: "b", promoted: false }, null, null, null, null, null],
      [null, null, { type: "P", owner: "b", promoted: false }, null, null, null, null, null, null],
      [null, null, null, null, { type: "G", owner: "b", promoted: false }, null, null, null, null],
      [null, null, null, null, { type: "K", owner: "b", promoted: false }, null, null, null, null]
    ],
    hands: {
      b: { R: 0, B: 0, G: 1, S: 1, N: 1, L: 0, P: 3 },
      w: { R: 1, B: 0, G: 0, S: 1, N: 1, L: 1, P: 4 }
    },
    turn: "b",
    history: Array.from({ length: 82 }, (_, i) => ({ drop: true, piece: "P", to: { r: i % 9, c: Math.floor(i / 9) % 9 } })),
    evalHistory: [50],
    gameOver: false
  };
}

function runEndgamePerformance() {
  let state = endgameState();
  const timings = [];
  for (let ply = 0; ply < 10; ply += 1) {
    const legal = context.ShogiRules.legalMoves(state, state.turn);
    if (!legal.length) break;
    const started = performance.now();
    const result = context.ShogiAI.searchRoot(state, 10, { mobile: true });
    const elapsed = performance.now() - started;
    assert(`endgame legal ply ${ply + 1}`, context.ShogiRules.isLegalMove(state, result.bestMove, state.turn), moveKey(result.bestMove));
    assert(`endgame time ply ${ply + 1}`, elapsed <= 2200, `${Math.round(elapsed)}ms ${moveKey(result.bestMove)}`);
    state = context.ShogiBoard.applyMove(state, result.bestMove);
    timings.push(elapsed);
  }
  return {
    plies: timings.length,
    maxMs: Math.round(Math.max(...timings)),
    avgMs: Math.round(timings.reduce((sum, item) => sum + item, 0) / timings.length)
  };
}

const scriptTestCount = runScriptTests();
const normal = runSelfPlay({ level: 5, plies: 24, maxMs: 1200 });
const strong = runSelfPlay({ level: 10, plies: 24, maxMs: 2200 });
const endgame = runEndgamePerformance();

console.log(JSON.stringify({
  ok: true,
  scriptTestCount,
  normal,
  strong,
  endgame
}, null, 2));
