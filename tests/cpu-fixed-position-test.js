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

function badReasonsForUsi(state, text) {
  const wanted = moveFromUsi(text);
  const key = moveKey(wanted);
  const legal = context.ShogiRules.legalMoves(state, state.turn);
  const found = legal.find(move => moveKey(move) === key);
  if (!found) throw new Error(`illegal reason test move ${text}`);
  const debug = context.ShogiAI.debugMove(state, found, LEVEL, { mobile: true }) || {};
  return debug.badMoveReasons || [];
}

function debugForUsi(state, text) {
  const wanted = moveFromUsi(text);
  const key = moveKey(wanted);
  const legal = context.ShogiRules.legalMoves(state, state.turn);
  const found = legal.find(move => moveKey(move) === key);
  if (!found) throw new Error(`illegal debug test move ${text}`);
  return context.ShogiAI.debugMove(state, found, LEVEL, { mobile: true }) || {};
}

function hasReasonForMove(state, text, names) {
  const reasons = badReasonsForUsi(state, text);
  return names.some(name => reasons.includes(name));
}

function lacksReasonForMove(state, text, names) {
  const reasons = badReasonsForUsi(state, text);
  return names.every(name => !reasons.includes(name));
}

function hasPositiveReasonForMove(state, text, names) {
  const debug = debugForUsi(state, text);
  const reasons = Array.isArray(debug.positiveReasons) ? debug.positiveReasons : [];
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

function edgeBishopState() {
  const state = emptyState("b", 16);
  state.board[8][4] = piece("K", "b");
  state.board[0][4] = piece("K", "w");
  state.board[4][4] = piece("B", "b");
  state.board[6][4] = piece("P", "b");
  return state;
}

function bishopShuffleState() {
  const state = emptyState("b", 18);
  state.board[8][4] = piece("K", "b");
  state.board[0][4] = piece("K", "w");
  state.board[6][2] = piece("B", "b");
  state.history.push({ from: { r: 7, c: 1 }, to: { r: 6, c: 2 }, promote: false, capture: false });
  return state;
}

function unsupportedSilverState() {
  const state = emptyState("b", 22);
  state.board[8][4] = piece("K", "b");
  state.board[0][4] = piece("K", "w");
  state.board[4][4] = piece("S", "b");
  state.board[2][2] = piece("B", "w");
  return state;
}

function silverCastleState() {
  const state = emptyState("b", 18);
  state.board[8][2] = piece("K", "b");
  state.board[0][4] = piece("K", "w");
  state.board[7][3] = piece("S", "b");
  state.board[8][3] = piece("G", "b");
  return state;
}

function rookOverextensionState() {
  const state = emptyState("b", 24);
  state.board[8][4] = piece("K", "b");
  state.board[0][4] = piece("K", "w");
  state.board[4][4] = piece("R", "b");
  state.board[0][5] = piece("G", "w");
  return state;
}

function bishopOverextensionState() {
  const state = emptyState("b", 24);
  state.board[8][4] = piece("K", "b");
  state.board[0][4] = piece("K", "w");
  state.board[4][4] = piece("B", "b");
  state.board[0][6] = piece("G", "w");
  return state;
}

function weakKingOpeningState() {
  const state = emptyState("b", 14);
  state.board[8][4] = piece("K", "b");
  state.board[0][4] = piece("K", "w");
  state.board[7][7] = piece("R", "b");
  state.board[7][1] = piece("B", "b");
  state.board[6][6] = piece("P", "b");
  return state;
}

function sacrificeCheckState() {
  const state = emptyState("b", 46);
  state.board[8][4] = piece("K", "b");
  state.board[0][4] = piece("K", "w");
  state.board[4][4] = piece("R", "b");
  state.board[1][3] = piece("G", "w");
  state.board[0][3] = piece("G", "w");
  return state;
}

function supportedSilverState() {
  const state = emptyState("b", 24);
  state.board[8][4] = piece("K", "b");
  state.board[0][4] = piece("K", "w");
  state.board[6][4] = piece("S", "b");
  state.board[5][3] = piece("G", "b");
  state.board[5][5] = piece("B", "b");
  return state;
}

function supportedSilverAttackState() {
  const state = supportedSilverState();
  state.board[4][3] = piece("P", "w");
  return state;
}

function chasedSilverState() {
  const state = emptyState("b", 24);
  state.board[8][4] = piece("K", "b");
  state.board[0][4] = piece("K", "w");
  state.board[6][4] = piece("S", "b");
  state.board[4][4] = piece("P", "w");
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

  {
    // 避ける悪手: 序盤に角を9一へ行かせて端で働かなくする。良い傾向: 玉や金銀の駒組みを優先する。
    const state = edgeBishopState();
    const decision = choose(state);
    failures.push(assertTest("avoid-bad-edge-bishop-move", !hasBadReason(decision.debug, ["badBishopMove", "trappedBishop"]), decision));
    failures.push(assertTest("label-bad-edge-bishop-move", hasReasonForMove(state, "5e9a", ["badBishopMove", "trappedBishop"]), decision));
  }

  {
    // 避ける悪手: 角交換後に打ち込み先も駒得もない2二角成。良い傾向: 囲い・飛車先・銀の進出を優先する。
    const state = stateFromMoves(["7g7f", "3c3d"]);
    failures.push(assertTest("label-meaningless-bishop-exchange", hasReasonForMove(state, "8h2b+", ["earlyMeaninglessBishopExchange", "aimlessEarlyMajorCapture"]), { moveUsi: "8h2b+", debug: { badMoveReasons: badReasonsForUsi(state, "8h2b+") } }));
  }

  {
    // 避ける悪手: 直前に出した角をすぐ戻すだけ。良い傾向: 別の駒組みや守備改善へ手を使う。
    const state = bishopShuffleState();
    failures.push(assertTest("label-pointless-bishop-retreat", hasReasonForMove(state, "7g8h", ["pointlessRetreat", "repeatedPieceMove"]), { moveUsi: "7g8h", debug: { badMoveReasons: badReasonsForUsi(state, "7g8h") } }));
  }

  {
    // 避ける悪手: 銀を単独で前に出して浮かせる。良い傾向: 支えのある銀上がりか囲いの銀を優先する。
    const state = unsupportedSilverState();
    const decision = choose(state);
    failures.push(assertTest("avoid-unsupported-silver-advance", !hasBadReason(decision.debug, ["unsupportedSilverAdvance"]), decision));
    failures.push(assertTest("label-unsupported-silver-advance", hasReasonForMove(state, "5e5d", ["unsupportedSilverAdvance", "looseMinorShape"]), decision));
  }

  {
    // 避ける悪手: 囲いに必要な銀を玉から遠ざける。良い傾向: 玉周辺の金銀を保つ。
    const state = silverCastleState();
    failures.push(assertTest("label-silver-leaves-castle", hasReasonForMove(state, "6h5g", ["silverLeavesCastle"]), { moveUsi: "6h5g", debug: { badMoveReasons: badReasonsForUsi(state, "6h5g") } }));
  }

  {
    // 避ける悪手: 序盤に飛車を敵陣近くへ突っ込ませて取られる。良い傾向: 支えのある飛車先突破だけを選ぶ。
    const state = rookOverextensionState();
    const decision = choose(state);
    failures.push(assertTest("avoid-rook-overextension", !hasBadReason(decision.debug, ["rookOverextension", "badStaticExchange", "hangingAfterMove"]), decision));
    failures.push(assertTest("label-rook-overextension", hasReasonForMove(state, "5e5b+", ["rookOverextension", "badStaticExchange", "hangingAfterMove"]), decision));
  }

  {
    // 避ける悪手: 序盤に角を敵陣深く出して清算負けする。良い傾向: 角は働きと安全を両立させる。
    const state = bishopOverextensionState();
    const decision = choose(state);
    failures.push(assertTest("avoid-bishop-overextension", !hasBadReason(decision.debug, ["bishopOverextension", "badStaticExchange", "hangingAfterMove"]), decision));
    failures.push(assertTest("label-bishop-overextension", hasReasonForMove(state, "5e2b+", ["bishopOverextension", "badStaticExchange", "hangingAfterMove"]), decision));
  }

  {
    // 避ける悪手: 居玉で金銀が薄いまま大駒だけ動かす。良い傾向: 玉周辺へ金銀を寄せる。
    const state = weakKingOpeningState();
    failures.push(assertTest("label-weak-king-shape", hasReasonForMove(state, "8h7g", ["weakKingShape", "ignoresCastleDevelopment"]), { moveUsi: "8h7g", debug: { badMoveReasons: badReasonsForUsi(state, "8h7g") } }));
  }

  {
    // 避ける悪手: 受けられて攻め駒を失うだけの単発王手。良い傾向: 駒得と攻めの継続性を優先する。
    const state = sacrificeCheckState();
    failures.push(assertTest("label-bad-sacrifice-check", hasReasonForMove(state, "5e5b+", ["badSacrificeCheck", "badStaticExchange", "hangingAfterMove"]), { moveUsi: "5e5b+", debug: { badMoveReasons: badReasonsForUsi(state, "5e5b+") } }));
  }

  {
    // 避ける悪手: 清算後に損する駒取り。良い傾向: 取れる駒より取り返し後の損得を見る。
    const state = forcedRecaptureState();
    failures.push(assertTest("label-bad-static-exchange-on-capture", hasReasonForMove(state, "5e6d", ["badStaticExchange", "hangingAfterMove"]), { moveUsi: "5e6d", debug: { badMoveReasons: badReasonsForUsi(state, "5e6d") } }));
  }

  {
    // 実戦風: 端歩を突いた後に角を9七へ出して働きを弱くする。良い傾向: 7九銀/6九金など囲い進行。
    const state = stateFromMoves(["7g7f", "3c3d", "2g2f", "8c8d", "9g9f", "7a6b"]);
    const decision = choose(state);
    failures.push(assertTest("realgame-avoid-opening-edge-bishop", !hasBadReason(decision.debug, ["badBishopMove", "trappedBishop", "ignoresCastleDevelopment"]), decision));
    failures.push(assertTest("realgame-label-opening-edge-bishop", hasReasonForMove(state, "8h9g", ["badBishopMove", "ignoresCastleDevelopment"]), { moveUsi: "8h9g", debug: { badMoveReasons: badReasonsForUsi(state, "8h9g") } }));
  }

  {
    // 実戦風: 角を取れるだけの2二角成で、清算後の狙いが薄い。良い傾向: まず玉金銀を整える。
    const state = stateFromMoves(["7g7f", "3c3d", "2g2f", "8c8d"]);
    const decision = choose(state, { openingStyle: "bishop-exchange" });
    failures.push(assertTest("realgame-avoid-empty-bishop-trade", decision.moveUsi !== "8h2b+", decision));
    failures.push(assertTest("realgame-label-empty-bishop-trade", hasReasonForMove(state, "8h2b+", ["earlyMeaninglessBishopExchange", "badBishopMove", "hangingAfterMove"]), { moveUsi: "8h2b+", debug: { badMoveReasons: badReasonsForUsi(state, "8h2b+") } }));
  }

  {
    // 実戦風: 5七銀からさらに4六銀へ単独進出し、歩や角に狙われる。良い傾向: 支えを作ってから銀を使う。
    const state = stateFromMoves(["7g7f", "3c3d", "5g5f", "8c8d", "7i6h", "8d8e", "6h5g", "7a6b"]);
    const decision = choose(state);
    failures.push(assertTest("realgame-avoid-floating-silver-advance", !hasBadReason(decision.debug, ["unsupportedSilverAdvance", "silverLeavesCastle"]), decision));
    failures.push(assertTest("realgame-label-floating-silver-advance", hasReasonForMove(state, "5g4f", ["unsupportedSilverAdvance", "silverLeavesCastle", "looseMinorShape"]), { moveUsi: "5g4f", debug: { badMoveReasons: badReasonsForUsi(state, "5g4f") } }));
  }

  {
    // 実戦風: 居玉のまま角だけ6六へ出す。良い傾向: 飛角より先に玉か金銀を整備する。
    const state = stateFromMoves(["7g7f", "3c3d", "2g2f", "8c8d"]);
    const decision = choose(state);
    failures.push(assertTest("realgame-avoid-ikyoku-major-only", !hasBadReason(decision.debug, ["ignoresCastleDevelopment", "earlyMajorSortie", "badBishopMove"]), decision));
    failures.push(assertTest("realgame-label-ikyoku-major-only", hasReasonForMove(state, "8h6f", ["ignoresCastleDevelopment", "earlyMajorSortie"]), { moveUsi: "8h6f", debug: { badMoveReasons: badReasonsForUsi(state, "8h6f") } }));
  }

  {
    // 実戦風: 中盤で単発王手をして攻め駒だけ消える。良い傾向: 王手より駒得と継続攻めを優先する。
    const state = sacrificeCheckState();
    const decision = choose(state);
    failures.push(assertTest("realgame-avoid-sacrifice-check", !hasBadReason(decision.debug, ["badSacrificeCheck", "noFollowUpCheck", "attackPieceLostAfterCheck"]), decision));
    failures.push(assertTest("realgame-label-sacrifice-check-followup", hasReasonForMove(state, "5e5b+", ["badSacrificeCheck", "noFollowUpCheck", "attackPieceLostAfterCheck"]), { moveUsi: "5e5b+", debug: { badMoveReasons: badReasonsForUsi(state, "5e5b+") } }));
  }

  {
    const state = stateFromMoves(["7g7f", "3c3d"]);
    failures.push(assertTest("silver-good-natural-advance-no-castle-penalty", lacksReasonForMove(state, "7i6h", ["silverLeavesCastle", "unsupportedSilverAdvance", "badSilverOverextension"]), { moveUsi: "7i6h", debug: debugForUsi(state, "7i6h") }));
    failures.push(assertTest("silver-good-natural-advance-positive", hasPositiveReasonForMove(state, "7i6h", ["goodSilverAdvance", "silverSupportedAttack"]), { moveUsi: "7i6h", debug: debugForUsi(state, "7i6h") }));
  }

  {
    const state = stateFromMoves(["7g7f", "3c3d", "6i7h", "8c8d", "7i6h", "7a6b"]);
    failures.push(assertTest("silver-good-yagura-advance-no-castle-penalty", lacksReasonForMove(state, "6h7g", ["silverLeavesCastle", "unsupportedSilverAdvance", "badSilverOverextension"]), { moveUsi: "6h7g", debug: debugForUsi(state, "6h7g") }));
    failures.push(assertTest("silver-good-yagura-advance-positive", hasPositiveReasonForMove(state, "6h7g", ["silverSupportedAttack"]), { moveUsi: "6h7g", debug: debugForUsi(state, "6h7g") }));
  }

  {
    const state = chasedSilverState();
    failures.push(assertTest("silver-bad-chased-by-pawn", hasReasonForMove(state, "5g5f", ["badSilverOverextension", "silverCanBeChasedByPawn", "silverIsHangingAfterAdvance"]), { moveUsi: "5g5f", debug: debugForUsi(state, "5g5f") }));
  }

  {
    const state = stateFromMoves(["7g7f", "3c3d", "5g5f", "8c8d", "7i6h", "8d8e", "6h5g", "7a6b"]);
    failures.push(assertTest("silver-bad-breaks-king-defense", hasReasonForMove(state, "5g4f", ["badSilverOverextension", "silverBreaksKingDefense", "silverHasNoFollowUp"]), { moveUsi: "5g4f", debug: debugForUsi(state, "5g4f") }));
  }

  {
    const state = supportedSilverState();
    failures.push(assertTest("silver-supported-advance-not-bad", lacksReasonForMove(state, "5g5f", ["unsupportedSilverAdvance", "silverLeavesCastle", "badSilverOverextension", "silverIsHangingAfterAdvance"]), { moveUsi: "5g5f", debug: debugForUsi(state, "5g5f") }));
  }

  {
    const state = chasedSilverState();
    failures.push(assertTest("silver-hanging-after-advance", hasReasonForMove(state, "5g5f", ["silverIsHangingAfterAdvance", "badStaticExchange"]), { moveUsi: "5g5f", debug: debugForUsi(state, "5g5f") }));
  }

  {
    const state = supportedSilverAttackState();
    failures.push(assertTest("attack-probe-supported-is-allowed", lacksReasonForMove(state, "5g5f", ["unsupportedAttackProbe", "unsupportedSilverAdvance", "badSilverOverextension"]), { moveUsi: "5g5f", debug: debugForUsi(state, "5g5f") }));
    failures.push(assertTest("attack-probe-supported-positive", hasPositiveReasonForMove(state, "5g5f", ["silverSupportedAttack"]), { moveUsi: "5g5f", debug: debugForUsi(state, "5g5f") }));
  }

  {
    const state = unsupportedSilverState();
    failures.push(assertTest("attack-probe-unsupported-is-bad", hasReasonForMove(state, "5e5d", ["unsupportedSilverAdvance", "badSilverOverextension"]), { moveUsi: "5e5d", debug: debugForUsi(state, "5e5d") }));
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
