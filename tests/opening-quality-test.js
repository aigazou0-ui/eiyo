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

function moveKey(move) {
  if (!move) return "";
  if (move.drop) return `D${move.piece}${move.to.r}${move.to.c}`;
  return `${move.from.r}${move.from.c}${move.to.r}${move.to.c}${move.promote ? "+" : ""}`;
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

function distance(a, b) {
  if (!a || !b) return 9;
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

function attacksKingZoneFrom(state, square, side, enemyKing) {
  const piece = state.board[square.r][square.c];
  if (!piece || piece.owner !== side || piece.type === "K") return 0;
  let count = 0;
  for (const pseudo of context.ShogiRules.pseudoPieceMoves(state, square.r, square.c, true)) {
    const d = distance(pseudo.to, enemyKing);
    if (d <= 1) count += 3;
    else if (d <= 2) count += 1;
  }
  return count;
}

function isRecentReverse(state, move, lookback) {
  if (!move || move.drop || move.capture || !move.from) return false;
  for (let i = state.history.length - 1; i >= Math.max(0, state.history.length - lookback); i -= 1) {
    const prev = state.history[i];
    if (!prev || prev.drop || !prev.from || !prev.to) continue;
    if (prev.from.r === move.to.r && prev.from.c === move.to.c &&
        prev.to.r === move.from.r && prev.to.c === move.from.c) return true;
  }
  return false;
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

function looseMinorShapeIssue(state, move, side, piece, moveUsi) {
  if (!piece || !["B", "S"].includes(piece.type) || move.capture || move.promote) return null;
  const ply = state.history.length;
  if (ply > 64) return null;
  const enemy = context.ShogiBoard.opponent(side);
  const enemyKing = kingSquare(state, enemy);
  const beforeDist = distance(move.from, enemyKing);
  const advanced = advancedRank(side, move.to);
  const next = context.ShogiBoard.applyMove(state, move);
  const defended = context.ShogiRules.attacksSquare(next, side, move.to);
  const attacked = context.ShogiRules.attacksSquare(next, enemy, move.to);
  const pressure = attacksKingZoneFrom(next, move.to, side, enemyKing);
  const afterDist = distance(move.to, enemyKing);
  const ownKing = kingSquare(next, side);
  const ownKingDist = distance(move.to, ownKing);
  let bishopMobility = 0;
  if (piece.type === "B") {
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      let r = move.to.r + dr;
      let c = move.to.c + dc;
      while (context.ShogiBoard.inside(r, c)) {
        const target = next.board[r][c];
        if (!target) bishopMobility += 1;
        else {
          if (target.owner !== side) bishopMobility += 1;
          break;
        }
        r += dr;
        c += dc;
      }
    }
  }
  if (piece.type === "B" && bishopMobility <= 4 && ownKingDist > 2 && afterDist >= beforeDist - 1) {
    return { severity: 3, type: "stranded-bishop", text: `${sideName(side)} ${moveUsi}: bishop with poor diagonal scope` };
  }
  if (pressure > 0 || defended && !attacked) return null;
  if (piece.type === "S" && advanced >= 4 && afterDist >= beforeDist - 1) {
    return { severity: 3, type: "unsupported-silver-sortie", text: `${sideName(side)} ${moveUsi}: 働きの薄い銀進出` };
  }
  if (piece.type === "B" && advanced >= 3 && afterDist >= beforeDist) {
    return { severity: 3, type: "unsupported-bishop-wander", text: `${sideName(side)} ${moveUsi}: 働きの薄い角移動` };
  }
  return null;
}

function issueForMove(state, move) {
  const side = state.turn;
  const ply = state.history.length;
  const moveUsi = usi(move);
  if (ply < 30 && move.drop) return { severity: 3, type: "early-drop", text: `${sideName(side)} ${moveUsi}: 序盤の持ち駒打ち` };
  if (ply < 42 && move.drop && (move.piece === "B" || move.piece === "R")) {
    return { severity: 4, type: "early-major-drop", text: `${sideName(side)} ${moveUsi}: early bishop/rook drop` };
  }
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
    if (ply < 30 && move.promote && (p.type === "R" || p.type === "B") && !move.capture) {
      return { severity: 3, type: "empty-major-promotion", text: `${sideName(side)} ${moveUsi}: 早すぎる空成り` };
    }
    if (ply >= 24 && ply < 70 && (p.type === "R" || p.type === "B") && isRecentReverse(state, move, 18)) {
      return { severity: 3, type: "major-shuffle", text: `${sideName(side)} ${moveUsi}: repeated major-piece shuffle` };
    }
    if (ply >= 30 && ply < 70 && (p.type === "R" || p.type === "B") && !move.capture && !move.promote) {
      const enemy = context.ShogiBoard.opponent(side);
      const enemyKing = kingSquare(state, enemy);
      const beforeDist = distance(move.from, enemyKing);
      const next = context.ShogiBoard.applyMove(state, move);
      const afterDist = distance(move.to, enemyKing);
      const pressure = attacksKingZoneFrom(next, move.to, side, enemyKing);
      if (afterDist >= beforeDist && pressure === 0) {
        return { severity: 3, type: "passive-major", text: `${sideName(side)} ${moveUsi}: passive major-piece move` };
      }
    }
    const looseMinor = looseMinorShapeIssue(state, move, side, p, moveUsi);
    if (looseMinor) return looseMinor;
    if (ply < 24 && p.type === "P" && !move.capture && after >= 3) {
      const enemy = context.ShogiBoard.opponent(side);
      const next = context.ShogiBoard.applyMove(state, move);
      const exposed = context.ShogiRules.legalMoves(next, enemy).some(reply => !reply.drop && reply.to.r === move.to.r && reply.to.c === move.to.c);
      if (exposed) return { severity: 2, type: "loose-pawn-push", text: `${sideName(side)} ${moveUsi}: 取られやすい歩突き` };
    }
    if (ply < 44 && p.type === "K" && after >= 2) {
      return { severity: 4, type: "early-king-exposure", text: `${sideName(side)} ${moveUsi}: early exposed king` };
    }
    if (ply < 12 && p.type === "G" && after > before && move.from.c === move.to.c && move.to.c >= 3 && move.to.c <= 5) {
      return { severity: 3, type: "early-central-gold", text: `${sideName(side)} ${moveUsi}: early central gold push` };
    }
  }
  return null;
}

function profileFor(gameIndex, side) {
  const styles = [
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
  const castleReached = { b: false, w: false };
  for (let ply = 0; ply < 36; ply += 1) {
    castleReached.b = castleReached.b || hasCastleProgress(state, "b");
    castleReached.w = castleReached.w || hasCastleProgress(state, "w");
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
  castleReached.b = castleReached.b || hasCastleProgress(state, "b");
  castleReached.w = castleReached.w || hasCastleProgress(state, "w");
  return {
    game: gameIndex + 1,
    bStyle: state.aiProfile.b.openingStyle,
    wStyle: state.aiProfile.w.openingStyle,
    moves,
    issues,
    castle: {
      b: castleReached.b,
      w: castleReached.w
    },
    maxMs: Math.max(...timings)
  };
}

const games = Array.from({ length: 10 }, (_, i) => runGame(i));
let bishopDropRegression = context.ShogiBoard.newState();
[
  "7g7f", "8c8d", "2g2f", "3c3d", "8h2b+", "3a2b"
].forEach(text => {
  bishopDropRegression = applyUsi(bishopDropRegression, text);
});
const bishopDropResult = context.ShogiAI.chooseMoveWithRandomness(bishopDropRegression, 10, {
  mobile: true,
  personality: "stable",
  randomness: "none",
  openingStyle: "central-file"
});
const bishopDropMove = usi(bishopDropResult.bestMove);
const bishopDropIssue = /^[BR]\*/.test(bishopDropMove)
  ? [{ game: "regression", type: "early-major-drop-choice", move: bishopDropMove }]
  : [];
const severe = games.flatMap(game => game.issues.map(issue => Object.assign({ game: game.game }, issue)))
  .filter(issue => issue.severity >= 3);
const notCastled = games.flatMap(game => {
  const list = [];
  if (!game.castle.b) list.push({ game: game.game, side: "先手", type: "not-castled" });
  if (!game.castle.w) list.push({ game: game.game, side: "後手", type: "not-castled" });
  return list;
});
const slowGames = games
  .filter(game => game.maxMs > 6000)
  .map(game => ({ game: game.game, maxMs: game.maxMs, type: "slow-opening" }));

console.log(JSON.stringify({
  ok: severe.length === 0 && notCastled.length === 0 && slowGames.length === 0,
  severe: severe.concat(bishopDropIssue),
  notCastled,
  slowGames,
  summaries: games.map(game => ({
    game: game.game,
    styles: `${game.bStyle}/${game.wStyle}`,
    first24: game.moves.slice(0, 24).map(item => item.move).join(" "),
    moves: game.moves.map(item => item.move).join(" "),
    issues: game.issues,
    castle: game.castle,
    maxMs: game.maxMs
  }))
}, null, 2));

if (severe.length || bishopDropIssue.length || notCastled.length || slowGames.length) process.exitCode = 1;
