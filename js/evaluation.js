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

  function scoreState(state) {
    let score = 0;
    const blackKing = findKing(state, "b");
    const whiteKing = findKing(state, "w");
    const phase = detectGamePhase(state);
    const attacks = buildAttackMaps(state);

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const piece = state.board[r][c];
        if (!piece) continue;
        const enemyKing = piece.owner === "b" ? whiteKing : blackKing;
        const value = pieceValue(piece) + positionBonus(piece, r, c, enemyKing);
        score += sign(piece.owner) * value;
      }
    }

    for (const side of ["b", "w"]) {
      for (const [type, count] of Object.entries(state.hands[side])) {
        if (!count) continue;
        score += sign(side) * handBonus(type, count);
      }
    }

    score += kingSafety(state, "b", phase, attacks) - kingSafety(state, "w", phase, attacks);
    score += attackKingScore(state, "b", phase, attacks) - attackKingScore(state, "w", phase, attacks);
    score += endgamePressure(state, "b", phase, attacks) - endgamePressure(state, "w", phase, attacks);
    score += activityScore(state, "b", phase) - activityScore(state, "w", phase);
    score -= loosePiecePenalty(state, "b", phase, attacks) - loosePiecePenalty(state, "w", phase, attacks);
    score += earlyGameBonus(state, "b") - earlyGameBonus(state, "w");
    if (window.ShogiRules.inCheck(state, "w")) score += 260;
    if (window.ShogiRules.inCheck(state, "b")) score -= 260;
    return Math.round(score);
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

  window.ShogiEvaluation = { scoreState, blackPercent, label, pieceValue, detectGamePhase };
})();
