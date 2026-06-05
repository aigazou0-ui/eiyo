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

const FILES = ["9", "8", "7", "6", "5", "4", "3", "2", "1"];
const RANKS = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
const LEVEL = Math.max(1, Math.min(10, Number(process.env.FIXED_LEVEL || 10)));

function sq(pos) {
  return `${FILES[pos.c]}${RANKS[pos.r]}`;
}

function usi(move) {
  if (!move) return "null";
  if (move.drop) return `${move.piece}*${sq(move.to)}`;
  return `${sq(move.from)}${sq(move.to)}${move.promote ? "+" : ""}`;
}

function moveKey(move) {
  if (!move) return "";
  if (move.drop) return `D${move.piece}${move.to.r}${move.to.c}`;
  return `${move.from.r}${move.from.c}${move.to.r}${move.to.c}${move.promote ? "+" : ""}`;
}

function cloneMove(move) {
  return JSON.parse(JSON.stringify(move));
}

function usiSquare(text) {
  return { r: RANKS.indexOf(text[1]), c: FILES.indexOf(text[0]) };
}

function moveFromUsi(text) {
  if (text[1] === "*") return { drop: true, piece: text[0], to: usiSquare(text.slice(2, 4)) };
  return {
    from: usiSquare(text.slice(0, 2)),
    to: usiSquare(text.slice(2, 4)),
    promote: text.endsWith("+")
  };
}

function applyUsi(state, text) {
  const wanted = moveFromUsi(text);
  const key = moveKey(wanted);
  const legal = context.ShogiRules.legalMoves(state, state.turn);
  const found = legal.find(move => moveKey(move) === key);
  if (!found) throw new Error(`illegal test move ${text}`);
  return context.ShogiBoard.applyMove(state, cloneMove(found));
}

function stateFromMoves(moves) {
  let state = context.ShogiBoard.newState();
  moves.forEach(text => {
    state = applyUsi(state, text);
  });
  return state;
}

function emptyState(turn = "b", ply = 40) {
  return {
    board: Array.from({ length: 9 }, () => Array(9).fill(null)),
    hands: {
      b: { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 },
      w: { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 }
    },
    turn,
    history: Array.from({ length: ply }, (_, i) => ({ drop: true, piece: "P", to: { r: i % 9, c: Math.floor(i / 9) % 9 } })),
    evalHistory: [50],
    gameOver: false
  };
}

function piece(type, owner, promoted = false) {
  return { type, owner, promoted };
}

function choose(state, options = {}) {
  const result = context.ShogiAI.chooseMoveWithRandomness(state, LEVEL, Object.assign({
    mobile: true,
    personality: "stable",
    randomness: "none",
    openingStyle: "balanced"
  }, options));
  const move = result.bestMove;
  const debug = context.ShogiAI.debugMove(state, move, LEVEL, { mobile: true }) || {};
  const next = move ? context.ShogiBoard.applyMove(state, cloneMove(move)) : null;
  return { result, move, moveUsi: usi(move), debug, next };
}

function kingMoveExposure(state, move) {
  if (!move || move.drop || !move.from) return false;
  const moving = state.board[move.from.r][move.from.c];
  if (!moving || moving.type !== "K") return false;
  const advanced = moving.owner === "b" ? 8 - move.to.r : move.to.r;
  return advanced >= 2;
}

function hasBadReason(debug, names) {
  const reasons = debug && Array.isArray(debug.badMoveReasons) ? debug.badMoveReasons : [];
  return names.some(name => reasons.includes(name));
}

function assertTest(name, condition, details = {}) {
  return condition ? null : Object.assign({ name }, details);
}

function mateInOneDropState() {
  const state = emptyState("b", 86);
  state.board[0][4] = piece("K", "w");
  state.board[2][4] = piece("R", "b");
  state.board[8][4] = piece("K", "b");
  state.hands.b.G = 1;
  return state;
}

function checkEvasionState() {
  const state = emptyState("b", 86);
  state.board[8][4] = piece("K", "b");
  state.board[0][4] = piece("K", "w");
  state.board[2][4] = piece("R", "w");
  state.board[7][3] = piece("G", "b");
  state.board[7][5] = piece("G", "b");
  return state;
}

function hangingMajorState() {
  const state = emptyState("b", 34);
  state.board[8][4] = piece("K", "b");
  state.board[0][4] = piece("K", "w");
  state.board[4][4] = piece("B", "b");
  state.board[4][0] = piece("R", "w");
  state.board[6][4] = piece("P", "b");
  state.board[2][4] = piece("P", "w");
  return state;
}

function forcedRecaptureState() {
  const state = emptyState("b", 42);
  state.board[8][4] = piece("K", "b");
  state.board[0][4] = piece("K", "w");
  state.board[4][4] = piece("S", "b");
  state.board[4][5] = piece("P", "b");
  state.board[4][3] = piece("S", "w");
  state.board[2][2] = piece("B", "w");
  return state;
}

function recklessCheckState() {
  const state = emptyState("b", 48);
  state.board[8][4] = piece("K", "b");
  state.board[0][4] = piece("K", "w");
  state.board[4][4] = piece("R", "b");
  state.board[1][4] = piece("G", "w");
  state.board[2][4] = piece("P", "w");
  state.board[5][3] = piece("G", "b");
  return state;
}

function run() {
  const failures = [];

  {
    const state = stateFromMoves(["7g7f", "3c3d", "2g2f", "8c8d", "9g9f"]);
    const decision = choose(state, { openingStyle: "bishop-exchange" });
    failures.push(assertTest("no-aimless-white-bishop-trade", decision.moveUsi !== "2b8h+", decision));
  }

  {
    const state = stateFromMoves(["7g7f", "3c3d", "2g2f", "8c8d"]);
    const decision = choose(state, { openingStyle: "bishop-exchange" });
    failures.push(assertTest("no-aimless-black-bishop-trade", decision.moveUsi !== "8h2b+", decision));
  }

  {
    const state = stateFromMoves(["7g7f", "3c3d", "2g2f", "8c8d", "6i7h", "7a6b"]);
    const decision = choose(state, { openingStyle: "yagura" });
    failures.push(assertTest("early-king-does-not-advance", !kingMoveExposure(state, decision.move), decision));
  }

  {
    const state = hangingMajorState();
    const decision = choose(state);
    failures.push(assertTest("avoid-leaving-major-hanging", !hasBadReason(decision.debug, ["hangingAfterMove", "badStaticExchange"]), decision));
  }

  {
    const state = forcedRecaptureState();
    const decision = choose(state);
    failures.push(assertTest("avoid-material-losing-exchange", !hasBadReason(decision.debug, ["badStaticExchange", "majorSacrificeRisk"]), decision));
  }

  {
    const state = recklessCheckState();
    const decision = choose(state);
    failures.push(assertTest("avoid-check-only-reckless-attack", !hasBadReason(decision.debug, ["badStaticExchange", "majorSacrificeRisk", "unsupportedAttackProbe"]), decision));
  }

  {
    const state = checkEvasionState();
    const decision = choose(state);
    failures.push(assertTest("evade-current-check", decision.next && !context.ShogiRules.inCheck(decision.next, "b"), decision));
  }

  {
    const state = mateInOneDropState();
    const mate = context.ShogiRules.findMate(state, state.turn, 1);
    const decision = choose(state);
    failures.push(assertTest("take-mate-in-one", moveKey(decision.move) === moveKey(mate), Object.assign({ expected: usi(mate) }, decision)));
  }

  {
    const state = stateFromMoves(["7g7f", "3c3d", "6i7h", "8c8d"]);
    const decision = choose(state, { openingStyle: "yagura" });
    const bad = hasBadReason(decision.debug, ["earlyMajorSortie", "earlyMajorDrop", "kingWander", "aimlessEarlyMajorCapture"]);
    failures.push(assertTest("opening-natural-shape-no-major-red-flag", !bad, decision));
  }

  {
    const state = stateFromMoves(["7g7f", "3c3d", "6i7h", "8c8d", "7i6h", "7a6b", "6h7g", "6a5b"]);
    const decision = choose(state, { openingStyle: "yagura" });
    const breakdown = decision.next ? context.ShogiEvaluation.scoreBreakdown(decision.next, state.turn) : null;
    failures.push(assertTest("debug-breakdown-is-available", !!(breakdown &&
      Number.isFinite(breakdown.materialScore) &&
      Number.isFinite(breakdown.kingSafetyScore) &&
      Number.isFinite(breakdown.pieceActivityScore) &&
      Number.isFinite(breakdown.pieceSafetyScore) &&
      Number.isFinite(breakdown.attackScore) &&
      Number.isFinite(breakdown.openingShapeScore) &&
      Number.isFinite(breakdown.endgameScore) &&
      Array.isArray(decision.debug.badMoveReasons)), decision));
  }

  const failed = failures.filter(Boolean);
  console.log(JSON.stringify({
    ok: failed.length === 0,
    level: LEVEL,
    failCount: failed.length,
    failures: failed.map(item => ({
      name: item.name,
      move: item.moveUsi,
      badMoveReasons: item.debug && item.debug.badMoveReasons,
      expected: item.expected
    }))
  }, null, 2));

  if (failed.length) process.exitCode = 1;
}

run();
