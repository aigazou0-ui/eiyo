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

const GAME_COUNT = Math.max(1, Number(process.env.BLUNDER_GAMES || 20));
const MAX_PLIES = Math.max(20, Number(process.env.BLUNDER_PLIES || 60));
const LEVEL = Math.max(1, Math.min(10, Number(process.env.BLUNDER_LEVEL || 10)));
const FAIL_SEVERITY = Math.max(3, Number(process.env.BLUNDER_FAIL_SEVERITY || 4));
const LOG_BAD_MOVES = process.env.BLUNDER_LOG_BAD === "1" || process.env.BLUNDER_LOG_BAD === "true";

function sq(pos) {
  return `${FILES[pos.c]}${RANKS[pos.r]}`;
}

function usi(move) {
  if (!move) return "null";
  if (move.drop) return `${move.piece}*${sq(move.to)}`;
  return `${sq(move.from)}${sq(move.to)}${move.promote ? "+" : ""}`;
}

function serializableMove(move) {
  if (!move) return null;
  return JSON.parse(JSON.stringify(move));
}

function serializeState(state) {
  return {
    board: state.board.map(row => row.map(piece => piece ? {
      type: piece.type,
      owner: piece.owner,
      promoted: !!piece.promoted
    } : null)),
    hands: JSON.parse(JSON.stringify(state.hands)),
    sideToMove: state.turn,
    moveNumber: state.history.length + 1
  };
}

function moveKey(move) {
  if (!move) return "";
  if (move.drop) return `D${move.piece}${move.to.r}${move.to.c}`;
  return `${move.from.r}${move.from.c}${move.to.r}${move.to.c}${move.promote ? "+" : ""}`;
}

function cloneMove(move) {
  return JSON.parse(JSON.stringify(move));
}

function sideSign(side) {
  return side === "b" ? 1 : -1;
}

function sideName(side) {
  return side === "b" ? "black" : "white";
}

function advancedRank(side, pos) {
  return side === "b" ? 8 - pos.r : pos.r;
}

function distance(a, b) {
  if (!a || !b) return 9;
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
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

function movePiece(state, move) {
  if (!move || move.drop || !move.from) return null;
  return state.board[move.from.r][move.from.c];
}

function moveGivesCheck(state, move, side) {
  const undo = context.ShogiBoard.makeMove(state, move);
  const gives = context.ShogiRules.inCheck(state, context.ShogiBoard.opponent(side));
  context.ShogiBoard.undoMove(state, undo);
  return gives;
}

function attacksKingZoneFrom(state, square, side, enemyKing) {
  if (!square || !enemyKing) return 0;
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

function localSupport(state, square, side) {
  let support = 0;
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      if (!dr && !dc) continue;
      const r = square.r + dr;
      const c = square.c + dc;
      if (!context.ShogiBoard.inside(r, c)) continue;
      const p = state.board[r][c];
      if (!p || p.owner !== side || p.type === "K") continue;
      support += Math.abs(dr) + Math.abs(dc) <= 1 ? 2 : 1;
    }
  }
  return support;
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

function profileFor(gameIndex, side) {
  return {
    personality: "stable",
    randomness: "none",
    openingStyle: STYLES[(gameIndex + (side === "b" ? 0 : 3)) % STYLES.length]
  };
}

function badLogEntry(gameIndex, state, result, move, moveRecord, recentMoves) {
  const debug = context.ShogiAI.debugMove(state, move, LEVEL, { mobile: true }) || {};
  const reasons = debug.badMoveReasons || [];
  if (!reasons.length) return null;
  const next = context.ShogiBoard.applyMove(state, cloneMove(move));
  const breakdown = context.ShogiEvaluation.scoreBreakdown(next, state.turn);
  const selectedCandidate = (result.candidates || []).find(item => moveKey(item.move) === moveKey(move)) || {};
  const selectedDebug = selectedCandidate.debug || {};
  const candidates = (result.candidates || []).slice(0, 3).map(item => {
    const candidateDebug = context.ShogiAI.debugMove(state, item.move, LEVEL, { mobile: true }) || {};
    const resultDebug = item.debug || {};
    return {
      move: usi(item.move),
      score: Math.round(item.score || 0),
      rawEval: Math.round(Number.isFinite(item.rawScore) ? item.rawScore : item.score || 0),
      riskPenalty: resultDebug.riskPenalty ?? candidateDebug.risk,
      finalEval: resultDebug.finalEval ?? Math.round(item.score || 0),
      badReasonPenaltyBreakdown: resultDebug.badReasonPenaltyBreakdown || (item.safety && item.safety.breakdown) || [],
      wasDemotedBySafetyFilter: !!(resultDebug.wasDemotedBySafetyFilter || (item.safety && item.safety.wasDemotedBySafetyFilter)),
      safetyFilterReason: resultDebug.safetyFilterReason || (item.safety && item.safety.safetyFilterReason) || "",
      candidateRankBefore: resultDebug.candidateRankBefore ?? item.candidateRankBefore ?? null,
      candidateRankAfter: resultDebug.candidateRankAfter ?? item.candidateRankAfter ?? null,
      badMoveReasons: candidateDebug.badMoveReasons || []
    };
  });
  return {
    id: `realgame-${String(gameIndex + 1).padStart(2, "0")}-${String(state.history.length + 1).padStart(3, "0")}`,
    description: "実戦短縮対局から検出したbadMoveReasons付きCPU手",
    board: serializeState(state).board,
    hands: serializeState(state).hands,
    sideToMove: state.turn,
    moveNumber: state.history.length + 1,
    previousMoves: recentMoves.slice(-5).map(item => item.move),
    badMoves: [usi(move)],
    expectedBadReasons: reasons,
    goodMoveHints: ["castleDevelopment", "defendFloatingPiece", "avoidStaticExchange"],
    selectedMove: usi(move),
    selectedMoveObject: serializableMove(move),
    evaluationScore: debug.evaluationScore,
    rawEval: selectedDebug.rawEval ?? Math.round(Number.isFinite(selectedCandidate.rawScore) ? selectedCandidate.rawScore : selectedCandidate.score || 0),
    riskPenalty: selectedDebug.riskPenalty ?? debug.risk,
    finalEval: selectedDebug.finalEval ?? Math.round(selectedCandidate.score || 0),
    badReasonPenaltyBreakdown: selectedDebug.badReasonPenaltyBreakdown || (selectedCandidate.safety && selectedCandidate.safety.breakdown) || [],
    wasDemotedBySafetyFilter: !!(selectedDebug.wasDemotedBySafetyFilter || (selectedCandidate.safety && selectedCandidate.safety.wasDemotedBySafetyFilter)),
    safetyFilterReason: selectedDebug.safetyFilterReason || (selectedCandidate.safety && selectedCandidate.safety.safetyFilterReason) || "",
    candidateRankBefore: selectedDebug.candidateRankBefore ?? selectedCandidate.candidateRankBefore ?? null,
    candidateRankAfter: selectedDebug.candidateRankAfter ?? selectedCandidate.candidateRankAfter ?? null,
    scoreBreakdown: breakdown,
    topCandidates: candidates,
    elapsedMs: moveRecord ? moveRecord.elapsed : undefined
  };
}

function addIssue(issues, severity, type, state, move, details = {}) {
  issues.push(Object.assign({
    severity,
    type,
    ply: state.history.length + 1,
    side: sideName(state.turn),
    move: usi(move)
  }, details));
}

function inspectMove(state, move, beforeEval, afterEval) {
  const issues = [];
  const side = state.turn;
  const ply = state.history.length;
  const piece = movePiece(state, move);
  const moveUsi = usi(move);
  const gives = moveGivesCheck(state, move, side);
  const sideDelta = (afterEval - beforeEval) * sideSign(side);

  if (move.drop && (move.piece === "B" || move.piece === "R") && ply < 30 && !context.ShogiRules.inCheck(state, side)) {
    addIssue(issues, 5, "early-major-drop", state, move, { sideDelta });
  } else if (move.drop && ply < 18 && !gives && !context.ShogiRules.inCheck(state, side)) {
    addIssue(issues, 3, "very-early-drop", state, move, { sideDelta });
  }

  if ((moveUsi === "2c2d" || moveUsi === "8g8f") && !move.capture && ply < 72) {
    addIssue(issues, 5, "bishop-head-pawn", state, move, { sideDelta });
  }

  if (piece) {
    const beforeAdvanced = advancedRank(side, move.from);
    const afterAdvanced = advancedRank(side, move.to);
    const enemyKing = kingSquare(state, context.ShogiBoard.opponent(side));
    if (piece.type === "K" && afterAdvanced >= 2 && ply < 44 && !context.ShogiRules.inCheck(state, side)) {
      addIssue(issues, 5, "early-king-exposure", state, move, { sideDelta });
    }
    if ((piece.type === "R" || piece.type === "B") && afterAdvanced >= 5 && ply < 30 && !move.capture) {
      addIssue(issues, 5, "early-major-sortie", state, move, { sideDelta });
    }
    if ((piece.type === "R" || piece.type === "B") && ply >= 24 && ply < 80 && isRecentReverse(state, move, 18)) {
      addIssue(issues, 3, "major-shuffle", state, move, { sideDelta });
    }
    if ((piece.type === "S" || piece.type === "B") && ply < 64 && !move.capture && !move.promote) {
      const next = context.ShogiBoard.applyMove(state, cloneMove(move));
      const pressure = attacksKingZoneFrom(next, move.to, side, enemyKing);
      const support = localSupport(next, move.to, side);
      const beforeDist = distance(move.from, enemyKing);
      const afterDist = distance(move.to, enemyKing);
      const advanced = advancedRank(side, move.to);
      if (piece.type === "S" && advanced >= 4 && pressure === 0 && support <= 2 && afterDist >= beforeDist - 1) {
        addIssue(issues, 3, "unsupported-silver-sortie", state, move, { sideDelta, pressure, support });
      }
      if (piece.type === "B" && advanced >= 3 && pressure === 0 && support <= 2 && afterDist >= beforeDist) {
        addIssue(issues, 3, "unsupported-bishop-wander", state, move, { sideDelta, pressure, support });
      }
      if (piece.type === "B") {
        const ownKing = kingSquare(next, side);
        let mobility = 0;
        for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          let r = move.to.r + dr;
          let c = move.to.c + dc;
          while (context.ShogiBoard.inside(r, c)) {
            const target = next.board[r][c];
            if (!target) mobility += 1;
            else {
              if (target.owner !== side) mobility += 1;
              break;
            }
            r += dr;
            c += dc;
          }
        }
        if (mobility <= 4 && distance(move.to, ownKing) > 2 && pressure === 0 && afterDist >= beforeDist - 1) {
          addIssue(issues, 3, "stranded-bishop", state, move, { sideDelta, pressure, support, mobility });
        }
      }
    }
    if ((piece.type === "R" || piece.type === "B") && ply >= 18 && ply < 52 && move.capture) {
      const next = context.ShogiBoard.applyMove(state, cloneMove(move));
      const pressure = attacksKingZoneFrom(next, move.to, side, enemyKing);
      const support = localSupport(next, move.to, side);
      const nearKing = distance(move.to, enemyKing) <= 3;
      if (sideDelta < -900 && !gives && !nearKing && pressure === 0 && support <= 2) {
        addIssue(issues, 4, "unsupported-major-sacrifice", state, move, { sideDelta, pressure, support });
      }
    }
    if ((move.to.c === 4 || (move.from && move.from.c === 4)) && ply >= 18 && ply < 70 && afterAdvanced >= 3) {
      const next = context.ShogiBoard.applyMove(state, cloneMove(move));
      const pressure = attacksKingZoneFrom(next, move.to, side, enemyKing);
      const support = localSupport(next, move.to, side);
      if (sideDelta < -700 && !gives && pressure === 0 && support <= 2) {
        addIssue(issues, 4, "unsupported-central-break", state, move, { sideDelta, pressure, support });
      }
    }
    if (piece.type === "G" && ply < 12 && afterAdvanced > beforeAdvanced && move.from.c === move.to.c && move.to.c >= 3 && move.to.c <= 5) {
      addIssue(issues, 4, "early-central-gold", state, move, { sideDelta });
    }
  }

  if (ply < 80 && sideDelta < -2600 && !gives) {
    addIssue(issues, 4, "eval-cliff", state, move, { sideDelta });
  } else if (ply < 80 && sideDelta < -1800 && !gives) {
    addIssue(issues, 3, "eval-drop", state, move, { sideDelta });
  }

  return issues;
}

function bishopMobility(state, square, side) {
  let mobility = 0;
  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    let r = square.r + dr;
    let c = square.c + dc;
    while (context.ShogiBoard.inside(r, c)) {
      const target = state.board[r][c];
      if (!target) mobility += 1;
      else {
        if (target.owner !== side) mobility += 1;
        break;
      }
      r += dr;
      c += dc;
    }
  }
  return mobility;
}

function inspectBoardShape(state, ply) {
  const issues = [];
  if (ply > 64) return issues;
  for (const side of ["b", "w"]) {
    const enemyKing = kingSquare(state, context.ShogiBoard.opponent(side));
    const ownKing = kingSquare(state, side);
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        const p = state.board[r][c];
        if (!p || p.owner !== side || p.type !== "B" || p.promoted) continue;
        const square = { r, c };
        const mobility = bishopMobility(state, square, side);
        const pressure = attacksKingZoneFrom(state, square, side, enemyKing);
        const support = localSupport(state, square, side);
        if ((c === 0 || c === 8) && distance(square, ownKing) > 2) {
          issues.push({
            severity: 4,
            type: "edge-stranded-bishop-board",
            ply,
            side: sideName(side),
            move: "board",
            mobility,
            pressure,
            support
          });
        }
      }
    }
  }
  return issues;
}

function runGame(gameIndex) {
  let state = context.ShogiBoard.newState();
  state.aiProfile = { b: profileFor(gameIndex, "b"), w: profileFor(gameIndex, "w") };
  const moves = [];
  const issues = [];
  const badMoveLogs = [];
  const timings = [];
  const evals = [context.ShogiEvaluation.scoreState(state)];

  for (let ply = 0; ply < MAX_PLIES; ply += 1) {
    const legal = context.ShogiRules.legalMoves(state, state.turn);
    if (!legal.length) break;
    const profile = state.aiProfile[state.turn];
    const beforeEval = context.ShogiEvaluation.scoreState(state);
    const started = performance.now();
    const result = context.ShogiAI.chooseMoveWithRandomness(state, LEVEL, {
      mobile: true,
      personality: profile.personality,
      randomness: profile.randomness,
      openingStyle: profile.openingStyle
    });
    const elapsed = Math.round(performance.now() - started);
    const move = result.bestMove;
    timings.push(elapsed);

    if (!context.ShogiRules.isLegalMove(state, move, state.turn)) {
      addIssue(issues, 5, "illegal", state, move);
      break;
    }

    const next = context.ShogiBoard.applyMove(state, cloneMove(move));
    const afterEval = context.ShogiEvaluation.scoreState(next);
    if (LOG_BAD_MOVES) {
      const previewRecord = { ply: ply + 1, side: state.turn, move: usi(move), elapsed, beforeEval, afterEval };
      const logEntry = badLogEntry(gameIndex, state, result, move, previewRecord, moves);
      if (logEntry) badMoveLogs.push(logEntry);
    }
    issues.push(...inspectMove(state, move, beforeEval, afterEval));
    issues.push(...inspectBoardShape(next, ply + 1));
    moves.push({ ply: ply + 1, side: state.turn, move: usi(move), elapsed, beforeEval, afterEval });
    evals.push(afterEval);
    state = next;
  }

  let maxSwing = 0;
  for (let i = 1; i < evals.length; i += 1) maxSwing = Math.max(maxSwing, Math.abs(evals[i] - evals[i - 1]));

  return {
    game: gameIndex + 1,
    styles: `${profileFor(gameIndex, "b").openingStyle}/${profileFor(gameIndex, "w").openingStyle}`,
    plies: moves.length,
    issues,
    maxMs: Math.max(...timings),
    avgMs: Math.round(timings.reduce((sum, item) => sum + item, 0) / Math.max(1, timings.length)),
    maxSwing,
    first24: moves.slice(0, 24).map(item => item.move).join(" "),
    suspicious: issues.slice(0, 8),
    badMoveLogs
  };
}

const games = Array.from({ length: GAME_COUNT }, (_, i) => runGame(i));
const allIssues = games.flatMap(game => game.issues.map(issue => Object.assign({ game: game.game }, issue)));
const badMoveLogs = games.flatMap(game => game.badMoveLogs || []);
const failIssues = allIssues.filter(issue => issue.severity >= FAIL_SEVERITY);
const typeCounts = allIssues.reduce((map, issue) => {
  map[issue.type] = (map[issue.type] || 0) + 1;
  return map;
}, {});
const slowGames = games.filter(game => game.maxMs > 6000);

const result = {
  ok: failIssues.length === 0 && slowGames.length === 0,
  config: { games: GAME_COUNT, plies: MAX_PLIES, level: LEVEL, failSeverity: FAIL_SEVERITY },
  issueCount: allIssues.length,
  failCount: failIssues.length,
  typeCounts,
  slowGames: slowGames.map(game => ({ game: game.game, maxMs: game.maxMs })),
  badMoveLogCount: badMoveLogs.length,
  badMoveLogs: badMoveLogs.slice(0, 20),
  failIssues: failIssues.slice(0, 30),
  worstGames: games
    .filter(game => game.issues.length)
    .sort((a, b) => b.issues.length - a.issues.length || b.maxSwing - a.maxSwing)
    .slice(0, 10)
    .map(game => ({
      game: game.game,
      styles: game.styles,
      plies: game.plies,
      maxMs: game.maxMs,
      maxSwing: game.maxSwing,
      suspicious: game.suspicious
    }))
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
