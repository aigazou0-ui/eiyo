(function () {
  const MATE = 1000000;
  const INF = 100000000;
  const TT_LIMIT = 60000;
  const tt = new Map();
  const historyTable = new Map();
  const killerMoves = Array.from({ length: 32 }, () => []);
  const RANDOM_WINDOWS = { 1: 500, 2: 400, 3: 300, 4: 250, 5: 200, 6: 150, 7: 120, 8: 100, 9: 70, 10: 45 };
  const TEMPERATURES = { 1: 300, 2: 250, 3: 200, 4: 160, 5: 130, 6: 100, 7: 80, 8: 60, 9: 40, 10: 25 };
  const RANDOMNESS_SCALE = { none: 0, low: 0.55, normal: 1, high: 1.55 };
  const PERSONALITY_SCALE = { stable: 0.35, standard: 1, varied: 1.35, attack: 1.05, defense: 0.95 };
  const DEBUG_AI = false;

  const LEVELS = {
    1: { depth: 1, time: 80, random: 520, reply: 0, danger: 0.12, q: false, tt: false },
    2: { depth: 1, time: 120, random: 80, reply: 0, danger: 0.22, q: false, tt: false },
    3: { depth: 1, time: 180, random: 35, reply: 28, danger: 0.34, q: false, tt: false },
    4: { depth: 2, time: 260, random: 18, reply: 48, danger: 0.48, q: false, tt: false },
    5: { depth: 3, time: 420, random: 8, reply: 64, danger: 0.62, q: false, tt: false },
    6: { depth: 4, time: 650, random: 3, reply: 80, danger: 0.76, q: false, tt: false, iterative: true },
    7: { depth: 4, time: 850, random: 2, reply: 96, danger: 0.9, q: false, tt: true, iterative: true },
    8: { depth: 4, time: 1050, random: 1, reply: 120, danger: 1.04, q: true, tt: true, iterative: true },
    9: { depth: 5, time: 1300, random: 0, reply: 140, danger: 1.18, q: true, tt: true, iterative: true },
    10: { depth: 5, time: 1700, random: 0, reply: 180, danger: 1.35, q: true, tt: true, iterative: true }
  };

  function config(level, options = {}) {
    const lv = Math.max(1, Math.min(10, Number(level) || 2));
    const cfg = Object.assign({}, LEVELS[lv] || LEVELS[2]);
    if (options.mobile) {
      cfg.mobile = true;
      cfg.time = Math.min(cfg.time, lv >= 9 ? 760 : lv >= 7 ? 640 : lv >= 5 ? 460 : 240);
      cfg.depth = Math.min(cfg.depth, lv >= 9 ? 4 : lv >= 6 ? 3 : cfg.depth);
      cfg.reply = Math.min(cfg.reply || 0, lv >= 9 ? 72 : lv >= 6 ? 52 : 28);
      cfg.q = lv >= 10 ? cfg.q : false;
      cfg.mobileRootLimit = lv >= 9 ? 30 : lv >= 7 ? 24 : 18;
      cfg.mobileBranchLimit = lv >= 9 ? 20 : lv >= 7 ? 16 : 12;
      cfg.mobileQLimit = lv >= 9 ? 14 : 10;
      cfg.mobileMateDepth = lv >= 8 ? 3 : 1;
    }
    return cfg;
  }

  function normalizedLevel(level) {
    return Math.max(1, Math.min(10, Number(level) || 2));
  }

  function sideSign(side) {
    return side === "b" ? 1 : -1;
  }

  function moveKey(move) {
    if (!move) return "";
    if (move.drop) return `D${move.piece}${move.to.r}${move.to.c}`;
    return `${move.from.r}${move.from.c}${move.to.r}${move.to.c}${move.promote ? "+" : ""}`;
  }

  function moveByKey(moves, key) {
    return moves.find(move => moveKey(move) === key) || null;
  }

  const HASH_TOKEN_CACHE = new Map();

  function tokenHash(token) {
    let cached = HASH_TOKEN_CACHE.get(token);
    if (cached !== undefined) return cached;
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    cached = hash >>> 0;
    HASH_TOKEN_CACHE.set(token, cached);
    return cached;
  }

  function mixHash(hash, value) {
    hash ^= value >>> 0;
    hash = Math.imul(hash, 16777619);
    hash ^= hash >>> 13;
    return hash >>> 0;
  }

  function stateKey(state) {
    let h1 = state.turn === "b" ? 2166136261 : 2166136261 ^ 0x9e3779b9;
    let h2 = state.turn === "b" ? 16777619 : 16777619 ^ 0x85ebca6b;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = state.board[r][c];
        if (!p) continue;
        const token = tokenHash(`b:${r}:${c}:${p.owner}:${p.type}:${p.promoted ? 1 : 0}`);
        h1 = mixHash(h1, token);
        h2 = mixHash(h2, token ^ ((r * 9 + c + 1) * 2654435761));
      }
    }
    for (const side of ["b", "w"]) {
      for (const type of window.ShogiPieces.HAND_ORDER) {
        const count = state.hands[side][type] || 0;
        if (!count) continue;
        const token = tokenHash(`h:${side}:${type}:${count}`);
        h1 = mixHash(h1, token);
        h2 = mixHash(h2, token ^ (count * 2246822519));
      }
    }
    return `${h1.toString(36)}:${h2.toString(36)}`;
  }

  function evaluateForSide(state, side) {
    return window.ShogiEvaluation.scoreState(state) * sideSign(side);
  }

  function givesCheck(state, move, side) {
    const undo = window.ShogiBoard.makeMove(state, move);
    const result = window.ShogiRules.inCheck(state, window.ShogiBoard.opponent(side));
    window.ShogiBoard.undoMove(state, undo);
    return result;
  }

  function mvvLva(state, move) {
    if (!move.capture || move.drop) return 0;
    const attacker = state.board[move.from.r][move.from.c];
    const victim = state.board[move.to.r][move.to.c];
    return (window.ShogiEvaluation.pieceValue(victim) * 10) - window.ShogiEvaluation.pieceValue(attacker);
  }

  function pieceValueByType(type, promoted) {
    return window.ShogiEvaluation.pieceValue({ type, owner: "b", promoted: !!promoted });
  }

  function basePieceValue(piece) {
    if (!piece) return 0;
    return window.ShogiEvaluation.pieceValue(piece);
  }

  function movingPiece(state, move) {
    if (!move || move.drop) return null;
    return state.board[move.from.r][move.from.c];
  }

  function isOpeningPawnSacrifice(state, move, side, exchange) {
    if (!move || move.drop || state.history.length > 54) return false;
    const piece = state.board[move.from.r][move.from.c];
    if (!piece || piece.type !== "P") return false;
    const keyFiles = side === "b" ? [1, 2, 7] : [1, 6, 7];
    const advanced = advancedRank(side, move.to);
    if (!keyFiles.includes(move.from.c) && advanced < 3) return false;
    if (move.capture && exchange.see < 50) return true;
    if (!move.capture && advanced >= 3 && exchange.immediateLoss > exchange.captureGain) return true;
    return exchange.see < -30;
  }

  function isEarlyBishopHeadPawnPush(state, move, side) {
    if (!move || move.drop || move.capture || state.history.length > 72) return false;
    const piece = state.board[move.from.r][move.from.c];
    if (!piece || piece.type !== "P") return false;
    if (side === "w" && move.from.r === 2 && move.to.r === 3 && move.from.c === 7) return true; // △2四歩
    if (side === "b" && move.from.r === 6 && move.to.r === 5 && move.from.c === 1) return true; // ▲8六歩
    return false;
  }

  function loosePawnPushRisk(state, move, side) {
    if (!move || move.drop || move.capture || state.history.length > 70) return 0;
    const piece = state.board[move.from.r][move.from.c];
    if (!piece || piece.type !== "P") return 0;
    const undo = window.ShogiBoard.makeMove(state, move);
    const enemy = state.turn;
    const attacked = window.ShogiRules.attacksSquare(state, enemy, move.to);
    const defended = window.ShogiRules.attacksSquare(state, side, move.to);
    const gives = window.ShogiRules.inCheck(state, enemy);
    window.ShogiBoard.undoMove(state, undo);
    if (gives || !attacked) return 0;
    let risk = defended ? 180 : 460;
    const advanced = advancedRank(side, move.to);
    if (advanced >= 3) risk += defended ? 120 : 260;
    if (state.history.length < 36) risk += defended ? 80 : 220;
    return risk;
  }

  function unsupportedDropRisk(state, move, side) {
    if (!move || !move.drop) return 0;
    const undo = window.ShogiBoard.makeMove(state, move);
    const enemy = state.turn;
    const attacked = window.ShogiRules.attacksSquare(state, enemy, move.to);
    const defended = window.ShogiRules.attacksSquare(state, side, move.to);
    const gives = window.ShogiRules.inCheck(state, enemy);
    window.ShogiBoard.undoMove(state, undo);
    if (!attacked || defended || gives) return 0;
    const value = pieceValueByType(move.piece, false);
    const phase = phaseOf(state);
    const scale = phase === "opening" ? 1.35 : phase === "middle" ? 1.0 : 0.55;
    return Math.round(value * scale);
  }

  function kingWanderPenalty(state, move, side) {
    if (!move || move.drop || state.history.length < 18) return 0;
    const piece = state.board[move.from.r][move.from.c];
    if (!piece || piece.type !== "K") return 0;
    if (window.ShogiRules.inCheck(state, side)) return 0;
    const home = side === "b" ? 8 : 0;
    const fromCastle = Math.abs(move.from.c - 4) + Math.abs(move.from.r - home);
    const toCastle = Math.abs(move.to.c - 4) + Math.abs(move.to.r - home);
    const fromWing = Math.abs(move.from.c - 4);
    const toWing = Math.abs(move.to.c - 4);
    let penalty = 120;
    if (state.history.length > 30) penalty += 120;
    if (toWing < fromWing) penalty += 180;
    if (toCastle < fromCastle && fromWing >= 2) penalty += 180;
    return penalty;
  }

  function leastCaptureTo(state, side, square) {
    const captures = window.ShogiRules.legalMoves(state, side)
      .filter(move => !move.drop && move.to.r === square.r && move.to.c === square.c)
      .map(move => {
        const attacker = state.board[move.from.r][move.from.c];
        return { move, value: basePieceValue(attacker) };
      })
      .sort((a, b) => a.value - b.value);
    return captures[0] || null;
  }

  function staticExchangeScore(state, move, side) {
    const targetBefore = !move.drop ? state.board[move.to.r][move.to.c] : null;
    const movingBefore = move.drop
      ? { type: move.piece, owner: side, promoted: false }
      : state.board[move.from.r][move.from.c];
    if (!movingBefore) return 0;

    const gains = [targetBefore && targetBefore.owner !== side ? basePieceValue(targetBefore) : 0];
    const undos = [];
    let target = move.to;
    let currentSide = side;
    let pieceOnTargetValue = basePieceValue(movingBefore);

    try {
      undos.push(window.ShogiBoard.makeMove(state, move));
      currentSide = state.turn;

      for (let depth = 1; depth < 10; depth++) {
        const capture = leastCaptureTo(state, currentSide, target);
        if (!capture) break;
        gains[depth] = pieceOnTargetValue - gains[depth - 1];
        undos.push(window.ShogiBoard.makeMove(state, capture.move));
        const onTarget = state.board[target.r][target.c];
        pieceOnTargetValue = basePieceValue(onTarget);
        currentSide = state.turn;
        if (Math.max(-gains[depth - 1], gains[depth]) < -2200) break;
      }
    } finally {
      while (undos.length) window.ShogiBoard.undoMove(state, undos.pop());
    }

    for (let i = gains.length - 1; i > 0; i--) {
      gains[i - 1] = -Math.max(-gains[i - 1], gains[i]);
    }
    return Math.round(gains[0] || 0);
  }

  function advancedRank(side, square) {
    return side === "b" ? 8 - square.r : square.r;
  }

  function replyCaptureDanger(next, side, limit) {
    const replies = orderedMoves(next, window.ShogiRules.legalMoves(next, next.turn), null, 1).slice(0, limit);
    let worst = 0;
    for (const reply of replies) {
      const target = !reply.drop ? next.board[reply.to.r][reply.to.c] : null;
      if (target && target.owner === side) {
        const attacker = !reply.drop ? next.board[reply.from.r][reply.from.c] : null;
        const capture = basePieceValue(target);
        const exchange = Math.max(0, capture - basePieceValue(attacker) * 0.25);
        worst = Math.max(worst, exchange);
      }
      const after = window.ShogiBoard.applyMove(next, reply);
      if (window.ShogiRules.isCheckmate(after, side)) worst = Math.max(worst, MATE / 2);
      if (window.ShogiRules.inCheck(after, side)) worst = Math.max(worst, 260);
    }
    return worst;
  }

  function exchangeAfterMove(state, move, side) {
    const beforeTarget = !move.drop ? state.board[move.to.r][move.to.c] : null;
    const captureGain = beforeTarget && beforeTarget.owner !== side ? basePieceValue(beforeTarget) : 0;
    const movedBefore = move.drop
      ? { type: move.piece, owner: side, promoted: false }
      : state.board[move.from.r][move.from.c];
    const movedBase = move.drop ? pieceValueByType(move.piece, false) : basePieceValue(movedBefore);
    const undo = window.ShogiBoard.makeMove(state, move);
    const movedAfter = state.board[move.to.r][move.to.c];
    const movedValue = movedAfter ? basePieceValue(movedAfter) : movedBase;
    const opponent = state.turn;
    let worstLoss = 0;
    let recaptureValue = 0;
    let attackerValue = 0;
    let captureReply = null;

    const replies = window.ShogiRules.legalMoves(state, opponent)
      .filter(reply => !reply.drop && reply.to.r === move.to.r && reply.to.c === move.to.c);

    for (const reply of replies) {
      const attacker = state.board[reply.from.r][reply.from.c];
      const currentAttackerValue = basePieceValue(attacker);
      const replyUndo = window.ShogiBoard.makeMove(state, reply);
      let bestRecapture = 0;
      const recaptures = window.ShogiRules.legalMoves(state, side)
        .filter(recapture => !recapture.drop && recapture.to.r === move.to.r && recapture.to.c === move.to.c);
      for (const recapture of recaptures) {
        const recaptured = state.board[recapture.to.r][recapture.to.c];
        bestRecapture = Math.max(bestRecapture, basePieceValue(recaptured));
      }
      window.ShogiBoard.undoMove(state, replyUndo);

      const loss = Math.max(0, movedValue - bestRecapture * 0.9);
      if (loss > worstLoss) {
        worstLoss = loss;
        recaptureValue = bestRecapture;
        attackerValue = currentAttackerValue;
        captureReply = reply;
      }
    }

    const sideAfter = Object.assign(window.ShogiBoard.cloneState(state), { turn: side });
    const mateThreat = !!window.ShogiRules.findMate(sideAfter, side, 1);
    const gives = window.ShogiRules.inCheck(state, opponent);
    window.ShogiBoard.undoMove(state, undo);
    const advanced = move.to ? advancedRank(side, move.to) : 0;
    const needsSee = captureGain > 0
      || move.promote
      || (movedBefore && ["R", "B", "G", "S"].includes(movedBefore.type))
      || (movedBefore && movedBefore.type !== "P" && advanced >= 5);
    const see = needsSee ? staticExchangeScore(state, move, side) : Math.round(captureGain - worstLoss);

    return {
      captureGain: Math.round(captureGain),
      immediateLoss: Math.round(worstLoss),
      recaptureValue: Math.round(recaptureValue),
      attackerValue: Math.round(attackerValue),
      see,
      netMaterial: Math.round(Math.min(captureGain - worstLoss, see)),
      hanging: worstLoss > captureGain + 90 || see < -120,
      capture: captureGain > 0,
      check: gives,
      mateThreat,
      captureReply
    };
  }

  function tacticalRisk(state, move, side, level, cfg) {
    const piece = movingPiece(state, move);
    const exchange = exchangeAfterMove(state, move, side);
    const isCheckMove = exchange.check;
    const undo = window.ShogiBoard.makeMove(state, move);
    let risk = replyCaptureDanger(state, side, cfg.reply || 24);

    if (window.ShogiRules.isCheckmate(state, side)) risk += MATE;
    if (window.ShogiRules.inCheck(state, side)) risk += 700;
    window.ShogiBoard.undoMove(state, undo);

    if (piece && (piece.type === "R" || piece.type === "B")) {
      const advanced = advancedRank(side, move.to);
      const ply = state.history.length;
      if (advanced >= 5 && ply < 46) {
        risk += piece.type === "R" ? 520 : 360;
        if (!move.capture) risk += 520;
        if (level >= 7) risk += 260;
      }
      if (advanced >= 6 && ply < 54) risk += 420;
    }

    if (piece && piece.type !== "P" && piece.type !== "K" && advancedRank(side, move.to) >= 6 && !move.capture) {
      risk += 180;
    }

    if (exchange.hanging) {
      const levelScale = 0.6 + level * 0.12;
      risk += (exchange.immediateLoss - exchange.captureGain) * levelScale;
      if (piece && (piece.type === "R" || piece.type === "B")) risk += 500 + level * 55;
    }
    if (exchange.see < -80 && !exchange.check && !exchange.mateThreat) {
      risk += Math.abs(exchange.see) * (0.9 + level * 0.12);
      if (piece && (piece.type === "R" || piece.type === "B")) risk += Math.abs(exchange.see) * 0.7;
    }
    if (isOpeningPawnSacrifice(state, move, side, exchange)) {
      risk += 680 + level * 75;
    }
    if (isEarlyBishopHeadPawnPush(state, move, side)) {
      risk += 9000 + level * 420;
    }
    risk += loosePawnPushRisk(state, move, side) * (1.25 + level * 0.1);
    if (isCheckMove && !exchange.mateThreat && exchange.see < -40) {
      risk += 420 + Math.abs(exchange.see) * (1.1 + level * 0.08);
    }
    risk += unsupportedDropRisk(state, move, side) * (0.75 + level * 0.08);
    risk += kingWanderPenalty(state, move, side) * (0.8 + level * 0.05);

    return risk;
  }

  function phaseOf(state) {
    const ply = state.history.length;
    if (ply < 20) return "opening";
    if (ply < 70) return "middle";
    return "end";
  }

  function personalityBonus(state, move, personality) {
    if (!personality || personality === "standard" || personality === "stable") return 0;
    const side = state.turn;
    const piece = movingPiece(state, move);
    let bonus = 0;
    if (personality === "attack") {
      if (move.capture) bonus += 42;
      if (move.promote) bonus += 34;
      if (givesCheck(state, move, side)) bonus += 58;
      if (piece && ["S", "N", "P"].includes(piece.type) && advancedRank(side, move.to) >= 4) bonus += 24;
    } else if (personality === "defense") {
      if (piece && piece.type === "K" && Math.abs(move.to.c - 4) > Math.abs(move.from.c - 4)) bonus += 48;
      if (piece && ["G", "S"].includes(piece.type) && advancedRank(side, move.to) <= 3) bonus += 36;
      if (givesCheck(state, move, side) && !move.capture) bonus -= 45;
    } else if (personality === "varied") {
      if (phaseOf(state) !== "end" && !move.drop) bonus += (move.to.c % 3) * 10;
    }
    return bonus;
  }

  function shouldForceBest(state, ranked, level, cfg) {
    if (ranked.length <= 1) return true;
    if (window.ShogiRules.inCheck(state, state.turn)) return true;
    const best = ranked[0];
    const second = ranked[1];
    const bestNext = window.ShogiBoard.applyMove(state, best.move);
    if (window.ShogiRules.isCheckmate(bestNext, window.ShogiBoard.opponent(state.turn))) return true;
    const bestTarget = !best.move.drop ? state.board[best.move.to.r][best.move.to.c] : null;
    const secondTarget = !second.move.drop ? state.board[second.move.to.r][second.move.to.c] : null;
    if (bestTarget && ["R", "B"].includes(bestTarget.type) && (!secondTarget || !["R", "B"].includes(secondTarget.type))) return true;
    const bestGap = best.score - second.score;
    const windowSize = RANDOM_WINDOWS[normalizedLevel(level)] || 100;
    if (bestGap > windowSize * 1.8) return true;
    const bestRisk = tacticalRisk(state, best.move, state.turn, level, cfg);
    if (bestRisk > 900 && bestGap > windowSize * 0.75) return true;
    return false;
  }

  function reasonText(item, selected, forceBest, phase) {
    if (!selected) return "候補比較";
    if (item.mate) return "詰みを最優先";
    if (forceBest) return "安全差が大きいため最善手";
    if (item.debug && item.debug.check) return "王手を含む有力手";
    if (item.debug && item.debug.capture && item.debug.netMaterial >= 0) return "駒得を見込める手";
    if (phase === "opening") return "序盤方針内で評価が近い手";
    return "評価値が近い候補から選択";
  }

  function withDebug(state, item, level, selected, forceBest, phase, options = {}) {
    const cfg = config(level, options);
    const exchange = exchangeAfterMove(state, item.move, state.turn);
    const risk = tacticalRisk(state, item.move, state.turn, level, cfg);
    const displayScore = Math.max(-9999, Math.min(9999, Math.round(item.score || 0)));
    const rawDisplayScore = Math.max(-9999, Math.min(9999, Math.round(Number.isFinite(item.rawScore) ? item.rawScore : item.score || 0)));
    const debug = Object.assign({}, exchange, {
      aiScore: displayScore,
      rawScore: rawDisplayScore,
      risk: Math.round(risk),
      reason: ""
    });
    const annotated = Object.assign({}, item, { debug, selected: !!selected });
    annotated.debug.reason = reasonText(annotated, !!selected, !!forceBest, phase || phaseOf(state));
    return annotated;
  }

  function annotateList(state, candidates, level, selectedMove, forceBest, phase, options = {}) {
    return (candidates || []).map(item => withDebug(
      state,
      item,
      level,
      !!(selectedMove && moveKey(item.move) === moveKey(selectedMove)),
      forceBest,
      phase,
      options
    ));
  }

  function chooseMoveWithRandomness(state, level, options = {}) {
    const lv = normalizedLevel(level);
    const cfg = config(lv, options);
    const base = searchRoot(state, lv, options);
    const personality = options.personality || "standard";
    const randomness = options.randomness || "normal";
    const phase = phaseOf(state);
    const scale = (RANDOMNESS_SCALE[randomness] ?? 1) * (PERSONALITY_SCALE[personality] ?? 1);

    const ranked = base.candidates
      .map(item => {
        const risk = tacticalRisk(state, item.move, state.turn, lv, cfg);
        const shallowScore = shallowRank(state, item.move, lv, cfg);
        const comparableScore = item.book
          ? (phase === "opening" ? 220 + Math.max(-35, Math.min(35, shallowScore)) : shallowScore + 90)
          : item.score;
        return Object.assign({}, item, {
          rawScore: item.score,
          score: comparableScore + personalityBonus(state, item.move, personality) - risk * Math.max(0, cfg.danger - 0.55) * 0.22,
          risk
        });
      })
      .sort((a, b) => b.score - a.score);

    if (!ranked.length) return Object.assign({}, base, { selection: null });

    const best = ranked[0];
    const windowBase = RANDOM_WINDOWS[lv] || 100;
    const openingBoost = phase === "opening" ? (lv === 10 ? 1.25 : 1.15) : 1;
    const windowSize = windowBase * scale * openingBoost;
    const temperatureBase = TEMPERATURES[lv] || 80;
    const temperature = Math.max(8, temperatureBase * Math.max(0.2, scale) * openingBoost);
    const forceBest = scale <= 0 || shouldForceBest(state, ranked, lv, cfg);

    let pool = forceBest ? [best] : ranked.filter(item => {
      if (best.score - item.score > windowSize) return false;
      if (item.risk > 620 + lv * 160) return false;
      if (item.score < best.score - Math.max(80, windowSize)) return false;
      return true;
    });

    if (!pool.length) pool = [best];
    const maxScore = best.score;
    const weighted = pool.map(item => Object.assign({}, item, {
      weight: forceBest ? 1 : Math.exp((item.score - maxScore) / temperature)
    }));
    const total = weighted.reduce((sum, item) => sum + item.weight, 0) || 1;
    let roll = Math.random() * total;
    let selected = weighted[0];
    for (const item of weighted) {
      roll -= item.weight;
      if (roll <= 0) {
        selected = item;
        break;
      }
    }

    const candidates = ranked.slice(0, Math.max(3, base.candidates.length)).map(item => {
      const chosen = weighted.find(w => moveKey(w.move) === moveKey(item.move));
      return withDebug(state, Object.assign({}, item, {
        weight: chosen ? chosen.weight / total : 0,
        selected: moveKey(item.move) === moveKey(selected.move)
      }), lv, moveKey(item.move) === moveKey(selected.move), forceBest, phase, options);
    });

    const reason = forceBest
      ? "forced-best"
      : `${personality}-${randomness}-${phase}`;
    if (DEBUG_AI) {
      console.debug("[pocket shogi ai]", {
        level: lv,
        phase,
        personality,
        randomness,
        windowSize: Math.round(windowSize),
        temperature: Math.round(temperature),
        candidates: candidates.map(item => ({ move: moveKey(item.move), score: Math.round(item.score), risk: Math.round(item.risk), weight: Number((item.weight || 0).toFixed(3)), selected: item.selected })),
        selected: moveKey(selected.move),
        reason
      });
    }

    return Object.assign({}, base, {
      bestMove: selected.move,
      candidates,
      selection: { move: selected.move, reason, forceBest, windowSize, temperature }
    });
  }

  function strategicMoveBonus(state, move) {
    const ply = state.history.length;
    if (ply > 34) return 0;
    const side = state.turn;
    let score = 0;

    if (!move.drop && move.from) {
      const p = state.board[move.from.r][move.from.c];
      if (!p) return 0;
      const advancedBefore = side === "b" ? 8 - move.from.r : move.from.r;
      const advancedAfter = side === "b" ? 8 - move.to.r : move.to.r;

      if (p.type === "P") {
        if (side === "b" && move.from.r === 6 && move.to.r === 5 && move.from.c === 2) score += 520;
        if (side === "w" && move.from.r === 2 && move.to.r === 3 && move.from.c === 6) score += 520;
        if (side === "b" && move.from.r === 6 && move.to.r === 5 && move.from.c === 7) score += 260;
        if (side === "w" && move.from.r === 2 && move.to.r === 3 && move.from.c === 1) score += 260;
        if (isEarlyBishopHeadPawnPush(state, move, side)) score -= 12000;
        score -= loosePawnPushRisk(state, move, side) * 2.4;
      }

      if (p.type === "S" && advancedAfter > advancedBefore) score += 190;
      if (p.type === "G" && advancedAfter <= 2 && (move.to.c <= 3 || move.to.c >= 5)) score += 90;
      if (p.type === "K") {
        if (ply <= 24 && Math.abs(move.to.c - 4) > Math.abs(move.from.c - 4)) score += 210;
        if (ply <= 28 && (move.to.c <= 2 || move.to.c >= 6)) score += 180;
        if (ply > 28 && !window.ShogiRules.inCheck(state, side)) score -= 260;
      }

      if ((p.type === "R" || p.type === "B") && advancedAfter >= 5 && ply < 42) score -= move.capture ? 360 : 1100;
      if ((p.type === "R" || p.type === "B") && advancedAfter >= 6 && ply < 52) score -= move.capture ? 420 : 1400;
      if (p.type !== "P" && p.type !== "K" && advancedAfter >= 6 && ply < 24 && !move.capture) score -= 420;
    }

    if (move.capture) score += ply < 18 ? -150 : 0;
    if (move.drop && ply < 24) score -= 240;
    if (move.drop && unsupportedDropRisk(state, move, side)) score -= unsupportedDropRisk(state, move, side) * 0.9;
    if (givesCheck(state, move, side) && ply < 32 && !move.capture) score -= 360;
    return score;
  }

  function moveOrderingScore(state, move, hashMove, ply) {
    const key = moveKey(move);
    let score = 0;
    if (hashMove && key === hashMove) score += 1000000;
    let exchange = null;
    if (move.capture) {
      exchange = exchangeAfterMove(state, move, state.turn);
      score += 700000 + mvvLva(state, move);
      score += Math.max(-260000, Math.min(260000, exchange.see * 180));
      if (exchange.see < -160) score -= 260000;
    }
    if (move.promote) score += 110000;
    if (givesCheck(state, move, state.turn)) {
      exchange = exchange || exchangeAfterMove(state, move, state.turn);
      if (exchange.mateThreat) score += 170000;
      else if (move.capture || exchange.see >= -40) score += 52000;
      else score += 9000;
      if (exchange.see < -120 && !exchange.mateThreat) score -= 70000;
    }
    if (killerMoves[ply] && killerMoves[ply].includes(key)) score += 40000;
    score += historyTable.get(key) || 0;
    score += strategicMoveBonus(state, move);
    if (!move.drop && move.to.c >= 2 && move.to.c <= 6) score += 800;
    if (move.drop && (move.piece === "G" || move.piece === "S")) score += 500;
    return score;
  }

  function orderedMoves(state, moves, hashMove, ply) {
    return moves
      .map(move => ({ move, order: moveOrderingScore(state, move, hashMove, ply) }))
      .sort((a, b) => b.order - a.order)
      .map(item => item.move);
  }

  function rememberKiller(ply, key) {
    if (!killerMoves[ply]) return;
    if (!killerMoves[ply].includes(key)) killerMoves[ply].unshift(key);
    killerMoves[ply] = killerMoves[ply].slice(0, 2);
  }

  function rememberHistory(key, depth) {
    historyTable.set(key, (historyTable.get(key) || 0) + depth * depth);
    if (historyTable.size > 30000) historyTable.clear();
  }

  function timeout(ctx) {
    return performance.now() >= ctx.deadline;
  }

  function terminalScore(state, side, ply) {
    const inCheck = window.ShogiRules.inCheck(state, side);
    if (inCheck) return -MATE + ply;
    return -20000 + ply;
  }

  function quiescence(state, alpha, beta, ctx, ply) {
    if (timeout(ctx) || ply > (ctx.mobile ? 5 : 8)) return evaluateForSide(state, state.turn);
    let stand = evaluateForSide(state, state.turn);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;

    const noisy = window.ShogiRules.legalMoves(state, state.turn)
      .filter(move => move.capture || move.promote || givesCheck(state, move, state.turn));
    const moves = orderedMoves(state, noisy, null, ply).slice(0, ctx.mobile ? ctx.mobileQLimit : 24);

    for (const move of moves) {
      const undo = window.ShogiBoard.makeMove(state, move);
      const score = -quiescence(state, -beta, -alpha, ctx, ply + 1);
      window.ShogiBoard.undoMove(state, undo);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function negamax(state, depth, alpha, beta, ctx, ply) {
    if (timeout(ctx)) {
      ctx.timedOut = true;
      return evaluateForSide(state, state.turn);
    }
    ctx.nodes++;

    const alphaOrig = alpha;
    const key = ctx.useTT ? stateKey(state) : "";
    let hashMove = null;
    if (ctx.useTT && tt.has(key)) {
      const entry = tt.get(key);
      hashMove = entry.bestMove;
      if (entry.depth >= depth) {
        if (entry.flag === "EXACT") return entry.score;
        if (entry.flag === "LOWER") alpha = Math.max(alpha, entry.score);
        if (entry.flag === "UPPER") beta = Math.min(beta, entry.score);
        if (alpha >= beta) return entry.score;
      }
    }

    const moves = window.ShogiRules.legalMoves(state, state.turn);
    if (!moves.length) return terminalScore(state, state.turn, ply);
    if (depth <= 0) return ctx.useQ ? quiescence(state, alpha, beta, ctx, ply) : evaluateForSide(state, state.turn);

    let bestScore = -INF;
    let bestMove = null;
    let ordered = orderedMoves(state, moves, hashMove, ply);
    if (ctx.mobile && depth >= 2) ordered = ordered.slice(0, ply <= 1 ? ctx.mobileRootLimit : ctx.mobileBranchLimit);

    for (const move of ordered) {
      const undo = window.ShogiBoard.makeMove(state, move);
      const score = -negamax(state, depth - 1, -beta, -alpha, ctx, ply + 1);
      window.ShogiBoard.undoMove(state, undo);
      if (ctx.timedOut) break;
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        const keyMove = moveKey(move);
        if (!move.capture) rememberKiller(ply, keyMove);
        rememberHistory(keyMove, depth);
        break;
      }
    }

    if (ctx.useTT && !ctx.timedOut && bestMove) {
      if (tt.size > TT_LIMIT) tt.clear();
      const flag = bestScore <= alphaOrig ? "UPPER" : bestScore >= beta ? "LOWER" : "EXACT";
      tt.set(key, { depth, score: bestScore, flag, bestMove: moveKey(bestMove) });
    }

    return bestScore;
  }

  function shallowRank(state, move, level, cfg) {
    const side = state.turn;
    const captureScore = move.capture ? mvvLva(state, move) : 0;
    const strategy = strategicMoveBonus(state, move);
    const risk = tacticalRisk(state, move, side, level, cfg);
    const exchange = exchangeAfterMove(state, move, side);
    const undo = window.ShogiBoard.makeMove(state, move);
    let score = evaluateForSide(state, side);

    if (move.capture) score += 180 + captureScore / 8;
    score += exchange.netMaterial * (level >= 8 ? 0.75 : 0.45);
    if (exchange.see < 0 && !exchange.check && !exchange.mateThreat) score += exchange.see * (level >= 8 ? 1.25 : 0.75);
    if (exchange.see > 0 && move.capture) score += exchange.see * (level >= 8 ? 0.35 : 0.2);
    if (exchange.hanging && !exchange.check && !exchange.mateThreat) score -= (exchange.immediateLoss - exchange.captureGain) * (level >= 8 ? 1.15 : 0.75);
    if (move.promote) score += 130;
    score += strategy;
    score -= risk * cfg.danger;
    if (window.ShogiRules.inCheck(state, window.ShogiBoard.opponent(side))) score += 190;
    if (window.ShogiRules.isCheckmate(state, window.ShogiBoard.opponent(side))) score += MATE / 2;
    if (exchange.check && !exchange.mateThreat && exchange.see < 0) score += exchange.see * (level >= 8 ? 1.4 : 0.9);

    if (cfg.reply) {
      const replies = orderedMoves(state, window.ShogiRules.legalMoves(state, state.turn), null, 1).slice(0, cfg.reply);
      let worst = score;
      for (const reply of replies) {
        const replyUndo = window.ShogiBoard.makeMove(state, reply);
        const replyScore = evaluateForSide(state, side);
        worst = Math.min(worst, replyScore);
        if (window.ShogiRules.isCheckmate(state, side)) worst = -MATE / 2;
        window.ShogiBoard.undoMove(state, replyUndo);
      }
      score = score * 0.55 + worst * 0.45;
    }

    window.ShogiBoard.undoMove(state, undo);
    return score + Math.random() * cfg.random;
  }

  function extractPV(state, depth, maxLen) {
    const pv = [];
    let clone = window.ShogiBoard.cloneState(state);
    for (let i = 0; i < Math.min(depth, maxLen); i++) {
      const entry = tt.get(stateKey(clone));
      if (!entry || !entry.bestMove) break;
      const move = moveByKey(window.ShogiRules.legalMoves(clone, clone.turn), entry.bestMove);
      if (!move) break;
      pv.push(move);
      clone = window.ShogiBoard.applyMove(clone, move);
    }
    return pv;
  }

  function searchRoot(state, level, options = {}) {
    const cfg = config(level, options);
    const moves = window.ShogiRules.legalMoves(state, state.turn);
    if (!moves.length) return { bestMove: null, candidates: [], nodes: 0, depth: 0 };

    const mateDepth = cfg.mobile ? cfg.mobileMateDepth : level >= 8 ? 5 : level >= 5 ? 3 : 1;
    const mate = window.ShogiRules.findMate(state, state.turn, mateDepth);
    if (mate) {
      return {
        bestMove: mate,
        candidates: [{ move: mate, score: MATE - 1, depth: mateDepth, nodes: moves.length, mate: mateDepth, pv: [mate] }],
        nodes: moves.length,
        depth: mateDepth
      };
    }

    const profile = state.aiProfile && state.aiProfile[state.turn];
    const bookMoves = window.ShogiOpening
      ? window.ShogiOpening.candidates(state, moves, { style: profile && profile.openingStyle })
      : [];
    if (level >= 1 && bookMoves.length) {
      const scoredBook = bookMoves
        .map(item => {
          const risk = tacticalRisk(state, item.move, state.turn, level, cfg);
          const policyBoost = item.policy ? Math.max(0, 40 - state.history.length) * 2600 : 0;
          return Object.assign({}, item, {
            score: item.score + policyBoost + shallowRank(state, item.move, level, cfg) - risk * (cfg.danger + 0.35),
            risk,
            depth: 1,
            nodes: moves.length,
            pv: [item.move]
          });
        })
        .filter(item => item.risk < 520 + level * 170)
        .sort((a, b) => b.score - a.score);
      const fill = moves
        .filter(move => !scoredBook.some(item => moveKey(item.move) === moveKey(move)))
        .map(move => ({ move, score: shallowRank(state, move, level, cfg), depth: 1, nodes: moves.length, pv: [move] }))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(0, 3 - scoredBook.length));
      const candidates = scoredBook.concat(fill).sort((a, b) => b.score - a.score).slice(0, 3);
      const topBook = scoredBook[0];
      const topFill = fill[0];
      const bookExchange = topBook ? exchangeAfterMove(state, topBook.move, state.turn) : null;
      const safeBook = topBook
        && topBook.risk < 520 + level * 120
        && (!bookExchange || bookExchange.netMaterial > -220)
        && (!topFill || topBook.score >= topFill.score - 180);
      const committedOpening = state.history.length < 40 && topBook && topBook.policy && topBook.risk < 420 + level * 110;
      if (candidates.length && (level < 7 || safeBook || committedOpening)) {
        return { bestMove: candidates[0].move, candidates, nodes: moves.length, depth: 1 };
      }
    }

    if (cfg.depth <= 1 && !cfg.iterative) {
      const ranked = (cfg.mobile ? orderedMoves(state, moves, null, 0).slice(0, 32) : moves)
        .map(move => ({ move, score: shallowRank(state, move, level, cfg), depth: 1, nodes: moves.length, pv: [move] }))
        .sort((a, b) => b.score - a.score);
      return { bestMove: level === 1 ? ranked[Math.floor(Math.random() * Math.min(5, ranked.length))].move : ranked[0].move, candidates: ranked.slice(0, 3), nodes: moves.length, depth: 1 };
    }

    const ctx = {
      deadline: performance.now() + cfg.time,
      timedOut: false,
      nodes: 0,
      useTT: !!cfg.tt,
      useQ: !!cfg.q,
      mobile: !!cfg.mobile,
      mobileRootLimit: cfg.mobileRootLimit || 30,
      mobileBranchLimit: cfg.mobileBranchLimit || 18,
      mobileQLimit: cfg.mobileQLimit || 12
    };
    let bestCandidates = [];
    let bestMove = null;
    let completedDepth = 0;
    const maxDepth = cfg.depth;

    for (let depth = cfg.iterative ? 1 : maxDepth; depth <= maxDepth; depth++) {
      ctx.timedOut = false;
      let rootMoves = orderedMoves(state, moves, bestMove ? moveKey(bestMove) : null, 0);
      if (cfg.mobile && depth >= 2) rootMoves = rootMoves.slice(0, cfg.mobileRootLimit || 24);
      const current = [];
      let alpha = -INF;
      for (const move of rootMoves) {
        if (timeout(ctx)) {
          ctx.timedOut = true;
          break;
        }
        const side = state.turn;
        const undo = window.ShogiBoard.makeMove(state, move);
        let score = -negamax(state, depth - 1, -INF, -alpha, ctx, 1);
        const isMate = window.ShogiRules.isCheckmate(state, window.ShogiBoard.opponent(side));
        const pv = [move].concat(extractPV(state, depth - 1, 4));
        window.ShogiBoard.undoMove(state, undo);
        if (isMate) {
          score = MATE - 1;
        } else {
          score -= tacticalRisk(state, move, state.turn, level, cfg) * cfg.danger;
        }
        current.push({ move, score, depth, nodes: ctx.nodes, pv });
        if (score > alpha) {
          alpha = score;
          bestMove = move;
        }
      }
      if (!ctx.timedOut && current.length) {
        bestCandidates = current.sort((a, b) => b.score - a.score).slice(0, 3);
        bestMove = bestCandidates[0].move;
        completedDepth = depth;
      }
      if (ctx.timedOut || !cfg.iterative) break;
    }

    if (!bestCandidates.length) {
      bestCandidates = (cfg.mobile ? orderedMoves(state, moves, bestMove ? moveKey(bestMove) : null, 0).slice(0, 32) : moves)
        .map(move => ({ move, score: shallowRank(state, move, level, cfg), depth: 1, nodes: ctx.nodes, pv: [move] }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      bestMove = bestCandidates[0].move;
    }

    bestCandidates.forEach(item => {
      item.depth = completedDepth || item.depth || 1;
      item.nodes = ctx.nodes;
    });
    return { bestMove, candidates: bestCandidates, nodes: ctx.nodes, depth: completedDepth };
  }

  function candidates(state, level, options = {}) {
    const result = searchRoot(state, level, options);
    return annotateList(state, result.candidates, normalizedLevel(level), null, false, phaseOf(state), options);
  }

  function chooseMove(state, level, options = {}) {
    return searchRoot(state, level, options).bestMove;
  }

  function ensureLegalMove(state, move, fallbackLevel) {
    if (window.ShogiRules.isLegalMove(state, move, state.turn)) return move;
    const legal = window.ShogiRules.legalMoves(state, state.turn);
    if (!legal.length) return null;
    const cfg = config(fallbackLevel || 2);
    return legal
      .map(item => ({ move: item, score: shallowRank(state, item, fallbackLevel || 2, cfg) }))
      .sort((a, b) => b.score - a.score)[0].move;
  }

  window.ShogiAI = { candidates, chooseMove, chooseMoveWithRandomness, searchRoot, ensureLegalMove };
})();
