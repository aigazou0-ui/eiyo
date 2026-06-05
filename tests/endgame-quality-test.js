const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");

const root = path.resolve(__dirname, "..");
const context = { console, performance, window: {}, self: {} };
context.window = context;
context.self = context;
vm.createContext(context);

[
  "js/pieces.js",
  "js/board.js",
  "js/rules.js",
  "js/evaluation.js",
  "js/opening-book.js",
  "js/opening.js",
  "js/ai.js"
].forEach(file => {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
});

const GAMES = Math.max(1, Number(process.env.ENDGAME_GAMES || 40));
const WARMUP_PLIES = Math.max(40, Number(process.env.ENDGAME_WARMUP_PLIES || 78));
const CHECK_PLIES = Math.max(6, Number(process.env.ENDGAME_CHECK_PLIES || 18));
const LEVEL = Math.max(1, Math.min(10, Number(process.env.ENDGAME_LEVEL || 10)));
const MAX_MS = Math.max(500, Number(process.env.ENDGAME_MAX_MS || 2600));
const FAIL_SEVERITY = Math.max(3, Number(process.env.ENDGAME_FAIL_SEVERITY || 4));

const STYLES = [
  "yagura",
  "gangi",
  "right-king",
  "static-rapid",
  "ranging-mino",
  "bishop-exchange",
  "left-mino",
  "silver-crown",
  "anaguma",
  "central-file"
];

function emptyState(turn = "b") {
  return {
    board: Array.from({ length: 9 }, () => Array(9).fill(null)),
    hands: {
      b: { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 },
      w: { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 }
    },
    turn,
    history: Array.from({ length: 86 }, (_, i) => ({ drop: true, piece: "P", to: { r: i % 9, c: Math.floor(i / 9) % 9 } })),
    evalHistory: [0],
    gameOver: false
  };
}

function cloneMove(move) {
  return JSON.parse(JSON.stringify(move));
}

function moveKey(move) {
  if (!move) return "";
  if (move.drop) return `D${move.piece}${move.to.r}${move.to.c}`;
  return `${move.from.r}${move.from.c}${move.to.r}${move.to.c}${move.promote ? "+" : ""}`;
}

function usi(move) {
  const files = ["9", "8", "7", "6", "5", "4", "3", "2", "1"];
  const ranks = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
  const sq = pos => `${files[pos.c]}${ranks[pos.r]}`;
  if (!move) return "null";
  if (move.drop) return `${move.piece}*${sq(move.to)}`;
  return `${sq(move.from)}${sq(move.to)}${move.promote ? "+" : ""}`;
}

function issue(severity, type, name, state, move, details = {}) {
  return Object.assign({
    severity,
    type,
    name,
    ply: state.history.length + 1,
    side: state.turn,
    move: usi(move),
    key: moveKey(move)
  }, details);
}

function profileFor(gameIndex, side) {
  return {
    personality: "stable",
    randomness: "none",
    openingStyle: STYLES[(gameIndex + (side === "b" ? 0 : 4)) % STYLES.length]
  };
}

function choose(state, level = LEVEL) {
  const started = performance.now();
  const result = context.ShogiAI.chooseMoveWithRandomness(state, level, {
    mobile: true,
    personality: "stable",
    randomness: "none",
    openingStyle: "balanced"
  });
  return { result, elapsed: Math.round(performance.now() - started) };
}

function firstMateKey(state, side, depth) {
  const mate = context.ShogiRules.findMate(state, side, depth);
  return mate ? moveKey(mate) : "";
}

function inspectDecision(name, state, level = LEVEL) {
  const issues = [];
  const legal = context.ShogiRules.legalMoves(state, state.turn);
  if (!legal.length) return issues;

  const mate1 = firstMateKey(state, state.turn, 1);
  const mate3 = firstMateKey(state, state.turn, 3);
  const beforeCheck = context.ShogiRules.inCheck(state, state.turn);
  const { result, elapsed } = choose(state, level);
  const move = result.bestMove;

  if (!context.ShogiRules.isLegalMove(state, move, state.turn)) {
    issues.push(issue(5, "illegal-endgame-move", name, state, move));
    return issues;
  }
  if (elapsed > MAX_MS) {
    issues.push(issue(4, "slow-endgame-move", name, state, move, { elapsed, maxMs: MAX_MS }));
  }

  const key = moveKey(move);
  const next = context.ShogiBoard.applyMove(state, cloneMove(move));
  if (beforeCheck && context.ShogiRules.inCheck(next, context.ShogiBoard.opponent(next.turn))) {
    issues.push(issue(5, "failed-check-evasion", name, state, move));
  }
  if (mate1 && key !== mate1) {
    issues.push(issue(5, "missed-mate-in-one", name, state, move, { expected: mate1, expectedUsi: usi(context.ShogiRules.findMate(state, state.turn, 1)) }));
  } else if (!mate1 && mate3 && key !== mate3) {
    issues.push(issue(4, "missed-mate-in-three", name, state, move, { expected: mate3, expectedUsi: usi(context.ShogiRules.findMate(state, state.turn, 3)) }));
  }

  const enemy = next.turn;
  const enemyMate1 = firstMateKey(next, enemy, 1);
  if (enemyMate1) {
    issues.push(issue(4, "allows-next-move-mate", name, state, move, { enemyMate: enemyMate1, elapsed }));
  }
  return issues;
}

function mateInOneDropState() {
  const state = emptyState("b");
  state.board[0][4] = { type: "K", owner: "w", promoted: false };
  state.board[2][4] = { type: "R", owner: "b", promoted: false };
  state.board[8][4] = { type: "K", owner: "b", promoted: false };
  state.hands.b.G = 1;
  return state;
}

function checkEvasionState() {
  const state = emptyState("b");
  state.board[8][4] = { type: "K", owner: "b", promoted: false };
  state.board[0][4] = { type: "K", owner: "w", promoted: false };
  state.board[5][4] = { type: "R", owner: "w", promoted: false };
  state.board[7][3] = { type: "G", owner: "b", promoted: false };
  state.hands.b.G = 1;
  state.hands.b.S = 1;
  return state;
}

function mateInThreeState() {
  const state = emptyState("b");
  state.board[0][4] = { type: "K", owner: "w", promoted: false };
  state.board[1][3] = { type: "G", owner: "w", promoted: false };
  state.board[1][5] = { type: "G", owner: "w", promoted: false };
  state.board[2][4] = { type: "R", owner: "b", promoted: false };
  state.board[8][4] = { type: "K", owner: "b", promoted: false };
  state.hands.b.S = 1;
  state.hands.b.G = 1;
  state.hands.w.R = 1;
  return state;
}

function runGeneratedGame(gameIndex) {
  let state = context.ShogiBoard.newState();
  state.aiProfile = { b: profileFor(gameIndex, "b"), w: profileFor(gameIndex, "w") };
  const issues = [];
  const moves = [];

  for (let ply = 0; ply < WARMUP_PLIES + CHECK_PLIES; ply += 1) {
    const legal = context.ShogiRules.legalMoves(state, state.turn);
    if (!legal.length) break;

    if (ply >= WARMUP_PLIES) {
      issues.push(...inspectDecision(`generated-${gameIndex + 1}`, context.ShogiBoard.cloneState(state)));
    }

    const profile = state.aiProfile[state.turn];
    const started = performance.now();
    const result = context.ShogiAI.chooseMoveWithRandomness(state, LEVEL, {
      mobile: true,
      personality: profile.personality,
      randomness: profile.randomness,
      openingStyle: profile.openingStyle
    });
    const elapsed = Math.round(performance.now() - started);
    if (!context.ShogiRules.isLegalMove(state, result.bestMove, state.turn)) {
      issues.push(issue(5, "illegal-generated-move", `generated-${gameIndex + 1}`, state, result.bestMove, { elapsed }));
      break;
    }
    if (ply >= WARMUP_PLIES && elapsed > MAX_MS) {
      issues.push(issue(4, "slow-generated-move", `generated-${gameIndex + 1}`, state, result.bestMove, { elapsed, maxMs: MAX_MS }));
    }
    moves.push(usi(result.bestMove));
    state = context.ShogiBoard.applyMove(state, cloneMove(result.bestMove));
  }

  return {
    game: gameIndex + 1,
    styles: `${profileFor(gameIndex, "b").openingStyle}/${profileFor(gameIndex, "w").openingStyle}`,
    plies: moves.length,
    tail: moves.slice(-16).join(" "),
    issues
  };
}

const fixed = [
  ["mate-in-one-drop", mateInOneDropState()],
  ["check-evasion", checkEvasionState()],
  ["mate-in-three-probe", mateInThreeState()]
].map(([name, state]) => ({ name, issues: inspectDecision(name, state) }));

const generated = Array.from({ length: GAMES }, (_, i) => runGeneratedGame(i));
const allIssues = fixed.flatMap(item => item.issues)
  .concat(generated.flatMap(game => game.issues.map(item => Object.assign({ game: game.game, styles: game.styles, tail: game.tail }, item))));
const failIssues = allIssues.filter(item => item.severity >= FAIL_SEVERITY);
const typeCounts = allIssues.reduce((map, item) => {
  map[item.type] = (map[item.type] || 0) + 1;
  return map;
}, {});

const result = {
  ok: failIssues.length === 0,
  config: {
    games: GAMES,
    warmupPlies: WARMUP_PLIES,
    checkPlies: CHECK_PLIES,
    level: LEVEL,
    maxMs: MAX_MS,
    failSeverity: FAIL_SEVERITY
  },
  fixed,
  issueCount: allIssues.length,
  failCount: failIssues.length,
  typeCounts,
  failIssues: failIssues.slice(0, 40),
  generatedWithIssues: generated
    .filter(game => game.issues.length)
    .slice(0, 10)
    .map(game => ({
      game: game.game,
      styles: game.styles,
      plies: game.plies,
      tail: game.tail,
      issues: game.issues.slice(0, 8)
    }))
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
