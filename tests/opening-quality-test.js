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
  "js/opening.js",
  "js/ai.js"
].forEach(file => {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
});

const FILES = ["9", "8", "7", "6", "5", "4", "3", "2", "1"];
const RANKS = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

function sq(pos) {
  return `${FILES[pos.c]}${RANKS[pos.r]}`;
}

function usi(move) {
  if (!move) return "null";
  if (move.drop) return `${move.piece}*${sq(move.to)}`;
  return `${sq(move.from)}${sq(move.to)}${move.promote ? "+" : ""}`;
}

function cloneMove(move) {
  return JSON.parse(JSON.stringify(move));
}

function sideName(side) {
  return side === "b" ? "先手" : "後手";
}

function advancedRank(side, pos) {
  return side === "b" ? 8 - pos.r : pos.r;
}

function kingSquare(state, side) {
  for (let r = 0; r < 9; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const p = state.board[r][c];
      if (p && p.owner === side && p.type === "K") return { r, c };
    }
  }
  return null;
}

function hasCastleProgress(state, side) {
  const king = kingSquare(state, side);
  if (!king) return false;
  if (Math.abs(king.c - 4) >= 1) return true;
  let guards = 0;
  for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) {
    const p = state.board[r][c];
    if (!p || p.owner !== side || (p.type !== "G" && p.type !== "S")) continue;
    if (Math.abs(r - king.r) + Math.abs(c - king.c) <= 3) guards += 1;
  }
  return guards >= 2;
}

function issueForMove(state, move) {
  const side = state.turn;
  const ply = state.history.length;
  const moveUsi = usi(move);
  if (ply < 30 && move.drop) return { severity: 3, type: "early-drop", text: `${sideName(side)} ${moveUsi}: 序盤の持ち駒打ち` };
  if ((moveUsi === "2c2d" || moveUsi === "8g8f") && !move.capture && ply < 72) {
    return { severity: 4, type: "bishop-head-pawn", text: `${sideName(side)} ${moveUsi}: 角頭歩に見える手` };
  }
  if (!move.drop && move.from) {
    const p = state.board[move.from.r][move.from.c];
    if (!p) return null;
    const before = advancedRank(side, move.from);
    const after = advancedRank(side, move.to);
    if (ply < 24 && p.type === "L" && before === 0 && after === 1 && !move.capture) {
      return { severity: 4, type: "meaningless-lance", text: `${sideName(side)} ${moveUsi}: 1二香/9八香系の意味が薄い香上がり` };
    }
    if (ply < 30 && (p.type === "R" || p.type === "B") && after >= 5 && !move.capture) {
      return { severity: 4, type: "early-major-sortie", text: `${sideName(side)} ${moveUsi}: 序盤の大駒単独進出` };
    }
    if (ply < 38 && move.promote && (p.type === "R" || p.type === "B") && !move.capture) {
      return { severity: 3, type: "empty-major-promotion", text: `${sideName(side)} ${moveUsi}: 早すぎる空成り` };
    }
    if (ply < 24 && p.type === "P" && !move.capture && after >= 3) {
      const enemy = context.ShogiBoard.opponent(side);
      const next = context.ShogiBoard.applyMove(state, move);
      const exposed = context.ShogiRules.legalMoves(next, enemy).some(reply => !reply.drop && reply.to.r === move.to.r && reply.to.c === move.to.c);
      if (exposed) return { severity: 2, type: "loose-pawn-push", text: `${sideName(side)} ${moveUsi}: 取られやすい歩突き` };
    }
  }
  return null;
}

function profileFor(gameIndex, side) {
  const styles = ["yagura", "gangi", "right-king", "static-rapid", "ranging-mino"];
  return {
    personality: "stable",
    randomness: "none",
    openingStyle: styles[(gameIndex + (side === "b" ? 0 : 2)) % styles.length]
  };
}

function runGame(gameIndex) {
  let state = context.ShogiBoard.newState();
  state.aiProfile = { b: profileFor(gameIndex, "b"), w: profileFor(gameIndex, "w") };
  const moves = [];
  const issues = [];
  const timings = [];
  for (let ply = 0; ply < 60; ply += 1) {
    const legal = context.ShogiRules.legalMoves(state, state.turn);
    if (!legal.length) break;
    const profile = state.aiProfile[state.turn];
    const started = performance.now();
    const result = context.ShogiAI.chooseMoveWithRandomness(state, 10, {
      mobile: true,
      personality: profile.personality,
      randomness: profile.randomness,
      openingStyle: profile.openingStyle
    });
    const elapsed = Math.round(performance.now() - started);
    timings.push(elapsed);
    const move = result.bestMove;
    if (!context.ShogiRules.isLegalMove(state, move, state.turn)) {
      issues.push({ severity: 5, type: "illegal", text: `${ply + 1}手目 ${sideName(state.turn)} ${usi(move)}: 非合法手` });
      break;
    }
    const issue = issueForMove(state, move);
    if (issue) issues.push(Object.assign({ ply: ply + 1 }, issue));
    moves.push({ ply: ply + 1, side: state.turn, move: usi(move), style: profile.openingStyle, elapsed });
    state = context.ShogiBoard.applyMove(state, cloneMove(move));
  }
  return {
    game: gameIndex + 1,
    bStyle: state.aiProfile.b.openingStyle,
    wStyle: state.aiProfile.w.openingStyle,
    moves,
    issues,
    castle: {
      b: hasCastleProgress(state, "b"),
      w: hasCastleProgress(state, "w")
    },
    maxMs: Math.max(...timings)
  };
}

const games = Array.from({ length: 10 }, (_, i) => runGame(i));
const severe = games.flatMap(game => game.issues.map(issue => Object.assign({ game: game.game }, issue)))
  .filter(issue => issue.severity >= 3);
const notCastled = games.flatMap(game => {
  const list = [];
  if (!game.castle.b) list.push({ game: game.game, side: "先手", type: "not-castled" });
  if (!game.castle.w) list.push({ game: game.game, side: "後手", type: "not-castled" });
  return list;
});
const slowGames = games
  .filter(game => game.maxMs > 2200)
  .map(game => ({ game: game.game, maxMs: game.maxMs, type: "slow-opening" }));

console.log(JSON.stringify({
  ok: severe.length === 0 && notCastled.length === 0 && slowGames.length === 0,
  severe,
  notCastled,
  slowGames,
  summaries: games.map(game => ({
    game: game.game,
    styles: `${game.bStyle}/${game.wStyle}`,
    first24: game.moves.slice(0, 24).map(item => item.move).join(" "),
    issues: game.issues,
    castle: game.castle,
    maxMs: game.maxMs
  }))
}, null, 2));

if (severe.length || notCastled.length || slowGames.length) process.exitCode = 1;
