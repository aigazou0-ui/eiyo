(function () {
  const { VALUES, PROMOTED_VALUES, keyOf } = window.ShogiPieces;

  const CENTER_FILES = [0, 1, 2, 3, 4, 3, 2, 1, 0];
  const CENTER_RANKS = [0, 1, 2, 3, 4, 3, 2, 1, 0];

  function pieceValue(piece) {
    if (!piece) return 0;
    return PROMOTED_VALUES[keyOf(piece)] || VALUES[piece.type] || 0;
  }

  function findKing(state, side) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const piece = state.board[r][c];
        if (piece && piece.owner === side && piece.type === "K") return { r, c };
      }
    }
    return null;
  }

  function sign(side) {
    return side === "b" ? 1 : -1;
  }

  function promotionBonus(piece, r) {
    if (!piece.promoted) return 0;
    if (piece.type === "R" || piece.type === "B") return 70;
    if (piece.type === "P") return 34;
    return 24;
  }

  function positionBonus(piece, r, c, enemyKing) {
    const forward = piece.owner === "b" ? 8 - r : r;
    const center = CENTER_FILES[c] + CENTER_RANKS[r];
    let bonus = center * 2;

    if (piece.type === "P") bonus += forward * 7;
    if (piece.type === "S" || piece.type === "G") bonus += center * 3 + forward * 3;
    if (piece.type === "N" || piece.type === "L") bonus += forward * 4;
    if (piece.type === "R" || piece.type === "B") bonus += center * 4;

    if (enemyKing && piece.type !== "K") {
      const dist = Math.abs(enemyKing.r - r) + Math.abs(enemyKing.c - c);
      bonus += Math.max(0, 9 - dist) * (piece.type === "R" || piece.type === "B" ? 10 : 5);
    }

    return bonus + promotionBonus(piece, r);
  }

  function kingShield(state, side) {
    const king = findKing(state, side);
    if (!king) return -20000;
    let shield = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = king.r + dr;
        const c = king.c + dc;
        if (!window.ShogiBoard.inside(r, c)) continue;
        const piece = state.board[r][c];
        if (!piece) continue;
        if (piece.owner === side) {
          if (piece.type === "G") shield += 34;
          else if (piece.type === "S") shield += 24;
          else if (piece.type === "P") shield += 10;
          else shield += 5;
        } else {
          shield -= piece.type === "R" || piece.type === "B" ? 34 : 18;
        }
      }
    }
    return shield;
  }

  function handBonus(type, count) {
    const base = VALUES[type] || 0;
    const flexible = type === "P" ? 1.25 : type === "G" || type === "S" ? 1.08 : 0.98;
    const stackPenalty = Math.max(0, count - 2) * (type === "P" ? 12 : 28);
    return base * flexible * count - stackPenalty;
  }

  function phaseWeights(phase) {
    if (phase === "opening") {
      return { king: 1.3, attack: 0.75, activity: 0.85, loose: 1.0, shape: 1.55, major: 1.25 };
    }
    if (phase === "endgame") {
      return { king: 1.55, attack: 1.35, activity: 0.8, loose: 1.25, shape: 0.45, major: 1.1 };
    }
    return { king: 1.15, attack: 1.05, activity: 1.0, loose: 1.25, shape: 0.9, major: 1.2 };
  }

  function detectGamePhase(state) {
    const ply = state.history.length;
    let handCount = 0;
    let promoted = 0;
    let pieces = 0;
    for (const side of ["b", "w"]) {
      for (const count of Object.values(state.hands[side])) handCount += count || 0;
    }
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      pieces += 1;
      if (p.promoted) promoted += 1;
    }
    if (ply < 24 && handCount < 3 && promoted < 2) return "opening";
    if (ply > 78 || handCount >= 8 || promoted >= 5 || pieces <= 28) return "endgame";
    return "middle";
  }

  function pieceMobility(state, r, c, piece) {
    return window.ShogiRules.pseudoPieceMoves(state, r, c, false).length;
  }

  function emptyMap() {
    return Array.from({ length: 9 }, () => Array(9).fill(0));
  }

  function buildAttackMaps(state) {
    const maps = { b: emptyMap(), w: emptyMap() };
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      for (const move of window.ShogiRules.pseudoPieceMoves(state, r, c, true)) {
        maps[p.owner][move.to.r][move.to.c] += 1;
      }
    }
    return maps;
  }

  function kingSafety(state, side, phase, attacks) {
    const king = findKing(state, side);
    if (!king) return -30000;
    const enemy = side === "b" ? "w" : "b";
    let score = kingShield(state, side);
    let escape = 0;
    let enemyAttack = 0;
    let friendlyCover = 0;

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = king.r + dr;
        const c = king.c + dc;
        if (!window.ShogiBoard.inside(r, c)) continue;
        const occupant = state.board[r][c];
        if (!occupant && !attacks[enemy][r][c]) escape += 1;
        if (attacks[enemy][r][c]) enemyAttack += attacks[enemy][r][c];
        if (attacks[side][r][c]) friendlyCover += attacks[side][r][c];
      }
    }

    score += escape * (phase === "endgame" ? 38 : 22);
    score += friendlyCover * 9;
    score -= enemyAttack * (phase === "endgame" ? 54 : 32);
    if (window.ShogiRules.inCheck(state, side)) score -= 330;
    return score;
  }

  function attackKingScore(state, side, phase, attacks) {
    const enemy = side === "b" ? "w" : "b";
    const king = findKing(state, enemy);
    if (!king) return 30000;
    let score = 0;
    for (let r = Math.max(0, king.r - 2); r <= Math.min(8, king.r + 2); r++) {
      for (let c = Math.max(0, king.c - 2); c <= Math.min(8, king.c + 2); c++) {
        if (attacks[side][r][c]) score += attacks[side][r][c] * (phase === "endgame" ? 18 : 11);
      }
    }
    for (const [type, count] of Object.entries(state.hands[side])) {
      if (!count) continue;
      if (["G", "S", "R", "B"].includes(type)) score += count * (phase === "endgame" ? 28 : 14);
      if (type === "P") score += count * (phase === "endgame" ? 7 : 3);
    }
    if (window.ShogiRules.inCheck(state, enemy)) score += phase === "endgame" ? 210 : 120;
    return score;
  }

  function loosePiecePenalty(state, side, phase, attacks) {
    const enemy = side === "b" ? "w" : "b";
    let penalty = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const p = state.board[r][c];
      if (!p || p.owner !== side || p.type === "K") continue;
      const attacked = attacks[enemy][r][c] || 0;
      if (!attacked) continue;
      const defended = attacks[side][r][c] || 0;
      const value = pieceValue(p);
      const highValue = p.type === "R" || p.type === "B";
      if (!defended) penalty += Math.min(420, value * (highValue ? 0.36 : 0.2));
      else if (attacked > defended) penalty += Math.min(220, value * 0.12);
      if (phase !== "opening" && highValue && attacked && defended <= 1) penalty += 70;
    }
    return penalty;
  }

  function majorPieceSafety(state, side, phase, attacks) {
    const enemy = side === "b" ? "w" : "b";
    let score = 0;
    const ply = state.history.length;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const p = state.board[r][c];
      if (!p || p.owner !== side || (p.type !== "R" && p.type !== "B")) continue;
      const mobility = pieceMobility(state, r, c, p);
      const attacked = attacks[enemy][r][c] || 0;
      const defended = attacks[side][r][c] || 0;
      const advanced = side === "b" ? 8 - r : r;
      if (attacked && !defended) score -= p.type === "R" ? 360 : 290;
      else if (attacked > defended) score -= p.type === "R" ? 180 : 140;
      if (mobility <= 2) score -= p.type === "R" ? 95 : 80;
      if (mobility >= 7) score += p.type === "R" ? 55 : 45;
      if (phase === "opening" && ply < 28 && advanced >= 5 && !p.promoted) score -= p.type === "R" ? 220 : 180;
      if (p.promoted) score += phase === "endgame" ? 170 : 120;
    }
    return score;
  }

  function formationScore(state, side, phase) {
    if (phase === "endgame") return 0;
    const king = findKing(state, side);
    if (!king) return -600;
    const home = side === "b" ? 8 : 0;
    let score = 0;
    const kingMoved = Math.abs(king.c - 4) + Math.abs(king.r - home);
    score += Math.min(190, kingMoved * 36);
    if (king.c <= 2 || king.c >= 6) score += 125;
    if (phase === "opening" && kingMoved === 0) score -= 70;

    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const p = state.board[r][c];
      if (!p || p.owner !== side) continue;
      const nearKing = Math.abs(r - king.r) + Math.abs(c - king.c);
      const advanced = side === "b" ? home - r : r - home;
      if ((p.type === "G" || p.type === "S") && nearKing <= 2) score += p.type === "G" ? 56 : 46;
      if ((p.type === "G" || p.type === "S") && phase === "opening" && nearKing >= 5 && advanced >= 3) score -= p.type === "G" ? 70 : 58;
      if (p.type === "S" && advanced >= 1 && advanced <= 3) score += 30;
      if (p.type === "N" && advanced === 0 && phase !== "opening") score -= 24;
      if (p.type === "P" && advanced === 1) score += 8;
    }

    const rookPawn = side === "b" ? state.board[5][7] : state.board[3][1];
    const bishopPathPawn = side === "b" ? state.board[5][2] : state.board[3][6];
    const bishopHeadPawn = side === "b" ? state.board[5][1] : state.board[3][7];
    if (rookPawn && rookPawn.owner === side && rookPawn.type === "P") score += 42;
    if (bishopPathPawn && bishopPathPawn.owner === side && bishopPathPawn.type === "P") score += 54;
    if (bishopHeadPawn && bishopHeadPawn.owner === side && bishopHeadPawn.type === "P") score -= 120;
    return score;
  }

  function endgamePressure(state, side, phase, attacks) {
    if (phase !== "endgame") return 0;
    const enemy = side === "b" ? "w" : "b";
    const king = findKing(state, enemy);
    if (!king) return 0;
    let score = 0;
    for (let r = Math.max(0, king.r - 1); r <= Math.min(8, king.r + 1); r++) {
      for (let c = Math.max(0, king.c - 1); c <= Math.min(8, king.c + 1); c++) {
        if (attacks[side][r][c]) score += attacks[side][r][c] * 20;
        if (attacks[enemy][r][c]) score -= attacks[enemy][r][c] * 8;
      }
    }
    const hands = state.hands[side] || {};
    score += (hands.G || 0) * 52 + (hands.S || 0) * 42 + (hands.R || 0) * 70 + (hands.B || 0) * 58;
    score += Math.min(5, hands.P || 0) * 8;
    return score;
  }

  function middleHandPressure(state, side, phase, attacks) {
    if (phase !== "middle") return 0;
    const enemy = side === "b" ? "w" : "b";
    const enemyKing = findKing(state, enemy);
    const ownKing = findKing(state, side);
    if (!enemyKing || !ownKing) return 0;
    const hands = state.hands[side] || {};
    const enemyHands = state.hands[enemy] || {};
    let attack = 0;
    let danger = 0;
    const enemyShield = kingShield(state, enemy);
    const ownShield = kingShield(state, side);
    attack += (hands.R || 0) * 95 + (hands.B || 0) * 80;
    attack += (hands.G || 0) * 62 + (hands.S || 0) * 52 + (hands.N || 0) * 34;
    attack += Math.min(4, hands.P || 0) * 12;
    danger += (enemyHands.R || 0) * 115 + (enemyHands.B || 0) * 96;
    danger += (enemyHands.G || 0) * 76 + (enemyHands.S || 0) * 66 + (enemyHands.N || 0) * 40;
    danger += Math.min(4, enemyHands.P || 0) * 14;
    for (let r = Math.max(0, enemyKing.r - 2); r <= Math.min(8, enemyKing.r + 2); r++) {
      for (let c = Math.max(0, enemyKing.c - 2); c <= Math.min(8, enemyKing.c + 2); c++) {
        if (attacks[side][r][c]) attack += attacks[side][r][c] * 12;
      }
    }
    for (let r = Math.max(0, ownKing.r - 2); r <= Math.min(8, ownKing.r + 2); r++) {
      for (let c = Math.max(0, ownKing.c - 2); c <= Math.min(8, ownKing.c + 2); c++) {
        if (attacks[enemy][r][c]) danger += attacks[enemy][r][c] * 16;
      }
    }
    if (enemyShield < 45) attack *= 1.12;
    if (ownShield < 45) danger *= 1.16;
    return Math.round(attack - danger * 0.72);
  }

  function enteringKingScore(state, side, phase, attacks) {
    if (phase !== "endgame") return 0;
    const king = findKing(state, side);
    if (!king) return -900;
    const enemy = side === "b" ? "w" : "b";
    const advanced = side === "b" ? 8 - king.r : king.r;
    let score = 0;
    if (advanced >= 6) score += 170 + (advanced - 5) * 78;
    else if (advanced >= 4) score += 45;
    else return score;

    let campPieces = 0;
    let supportNearKing = 0;
    let pointLike = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = state.board[r][c];
        if (!p || p.owner !== side || p.type === "K") continue;
        const inEnemyCamp = side === "b" ? r <= 2 : r >= 6;
        if (!inEnemyCamp) continue;
        campPieces += 1;
        pointLike += (p.type === "R" || p.type === "B") ? 5 : 1;
        if (Math.abs(r - king.r) + Math.abs(c - king.c) <= 2) supportNearKing += 1;
      }
    }
    const hands = state.hands[side] || {};
    pointLike += ((hands.R || 0) + (hands.B || 0)) * 5;
    pointLike += (hands.G || 0) + (hands.S || 0) + (hands.N || 0) + (hands.L || 0) + Math.min(5, hands.P || 0);
    score += campPieces * 24 + supportNearKing * 38 + Math.min(230, pointLike * 9);
    score += (attacks[side][king.r][king.c] || 0) * 22;
    score -= (attacks[enemy][king.r][king.c] || 0) * 44;
    if (attacks[enemy][king.r][king.c]) score -= 140;
    return score;
  }

  function activityScore(state, side, phase) {
    let score = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const p = state.board[r][c];
      if (!p || p.owner !== side) continue;
      const mobility = pieceMobility(state, r, c, p);
      const forward = side === "b" ? 8 - r : r;
      const center = CENTER_FILES[c] + CENTER_RANKS[r];
      score += mobility * (p.type === "R" || p.type === "B" ? 7 : 3);
      score += center * 2;
      if (p.promoted) score += p.type === "R" || p.type === "B" ? 70 : 34;
      if (phase !== "opening" && p.type !== "K") score += forward * 4;
      if ((p.type === "N" || p.type === "L") && (c === 0 || c === 8)) score -= 12;
    }
    return score;
  }

  function earlyGameBonus(state, side) {
    const ply = state.history.length;
    if (ply > 36) return 0;
    const home = side === "b" ? 8 : 0;
    const king = findKing(state, side);
    let score = 0;

    if (king) {
      const movedFromCenter = Math.abs(king.c - 4) * 24 + Math.abs(king.r - home) * 10;
      score += Math.min(110, movedFromCenter);
      if (king.c <= 2 || king.c >= 6) score += 70;
    }

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = state.board[r][c];
        if (!p || p.owner !== side) continue;
        const advanced = side === "b" ? home - r : r - home;
        if (p.type === "S" && advanced >= 1) score += 30;
        if (p.type === "G" && king && Math.abs(c - king.c) <= 2 && Math.abs(r - king.r) <= 2) score += 26;
        if ((p.type === "R" || p.type === "B") && advanced >= 4 && ply < 18) score -= 120;
        if (p.type !== "P" && p.type !== "K" && advanced >= 5 && ply < 24) score -= 55;
      }
    }

    const bishopPawn = side === "b" ? state.board[5][2] : state.board[3][6];
    const rookPawn = side === "b" ? state.board[5][7] : state.board[3][1];
    if (bishopPawn && bishopPawn.owner === side && bishopPawn.type === "P") score += 45;
    if (rookPawn && rookPawn.owner === side && rookPawn.type === "P") score += 32;

    return Math.round(score * Math.max(0.25, 1 - ply / 42));
  }

  function rawBreakdown(state) {
    const breakdown = {
      materialScore: 0,
      kingSafetyScore: 0,
      pieceActivityScore: 0,
      pieceSafetyScore: 0,
      attackScore: 0,
      openingShapeScore: 0,
      endgameScore: 0,
      checkScore: 0,
      phase: detectGamePhase(state),
      total: 0
    };
    const blackKing = findKing(state, "b");
    const whiteKing = findKing(state, "w");
    const phase = breakdown.phase;
    const attacks = buildAttackMaps(state);

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const piece = state.board[r][c];
        if (!piece) continue;
        const enemyKing = piece.owner === "b" ? whiteKing : blackKing;
        const value = pieceValue(piece) + positionBonus(piece, r, c, enemyKing);
        breakdown.materialScore += sign(piece.owner) * value;
      }
    }

    for (const side of ["b", "w"]) {
      for (const [type, count] of Object.entries(state.hands[side])) {
        if (!count) continue;
        breakdown.materialScore += sign(side) * handBonus(type, count);
      }
    }

    const weights = phaseWeights(phase);
    breakdown.kingSafetyScore = (kingSafety(state, "b", phase, attacks) - kingSafety(state, "w", phase, attacks)) * weights.king;
    breakdown.attackScore = (attackKingScore(state, "b", phase, attacks) - attackKingScore(state, "w", phase, attacks)) * weights.attack +
      middleHandPressure(state, "b", phase, attacks) - middleHandPressure(state, "w", phase, attacks);
    breakdown.endgameScore = endgamePressure(state, "b", phase, attacks) - endgamePressure(state, "w", phase, attacks) +
      enteringKingScore(state, "b", phase, attacks) - enteringKingScore(state, "w", phase, attacks);
    breakdown.pieceActivityScore = (activityScore(state, "b", phase) - activityScore(state, "w", phase)) * weights.activity;
    breakdown.pieceSafetyScore = -((loosePiecePenalty(state, "b", phase, attacks) - loosePiecePenalty(state, "w", phase, attacks)) * weights.loose) +
      (majorPieceSafety(state, "b", phase, attacks) - majorPieceSafety(state, "w", phase, attacks)) * weights.major;
    breakdown.openingShapeScore = (formationScore(state, "b", phase) - formationScore(state, "w", phase)) * weights.shape +
      earlyGameBonus(state, "b") - earlyGameBonus(state, "w");
    if (window.ShogiRules.inCheck(state, "w")) breakdown.checkScore += 260;
    if (window.ShogiRules.inCheck(state, "b")) breakdown.checkScore -= 260;
    breakdown.total = breakdown.materialScore + breakdown.kingSafetyScore + breakdown.pieceActivityScore +
      breakdown.pieceSafetyScore + breakdown.attackScore + breakdown.openingShapeScore +
      breakdown.endgameScore + breakdown.checkScore;
    Object.keys(breakdown).forEach(key => {
      if (typeof breakdown[key] === "number") breakdown[key] = Math.round(breakdown[key]);
    });
    return breakdown;
  }

  function scoreState(state) {
    return rawBreakdown(state).total;
  }

  function scoreBreakdown(state, side = "b") {
    const raw = rawBreakdown(state);
    const scale = side === "w" ? -1 : 1;
    const keys = ["materialScore", "kingSafetyScore", "pieceActivityScore", "pieceSafetyScore", "attackScore", "openingShapeScore", "endgameScore", "checkScore", "total"];
    const result = { phase: raw.phase };
    keys.forEach(key => {
      result[key] = raw[key] * scale;
    });
    return result;
  }

  function blackPercent(state) {
    const score = scoreState(state);
    return Math.max(1, Math.min(99, Math.round(100 / (1 + Math.exp(-score / 900)))));
  }

  function label(percent) {
    const diff = Math.abs(percent - 50);
    if (diff < 6) return "互角";
    const side = percent > 50 ? "先手" : "後手";
    if (diff < 16) return `${side}やや良し`;
    if (diff < 30) return `${side}優勢`;
    return `${side}勝勢`;
  }

  window.ShogiEvaluation = { scoreState, scoreBreakdown, blackPercent, label, pieceValue, detectGamePhase };
})();
