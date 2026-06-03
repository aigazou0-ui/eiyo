(function () {
  const { inside, opponent, applyMove } = window.ShogiBoard;
  const { HAND_ORDER, canPromote, mustPromote } = window.ShogiPieces;

  const GOLD = [[-1, 0], [-1, -1], [-1, 1], [0, -1], [0, 1], [1, 0]];
  const SILVER = [[-1, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  const KING = [[-1, 0], [-1, -1], [-1, 1], [0, -1], [0, 1], [1, 0], [1, -1], [1, 1]];

  function orient(dirs, owner) {
    const s = owner === "b" ? 1 : -1;
    return dirs.map(([r, c]) => [r * s, c]);
  }

  function addStepMoves(state, moves, from, piece, dirs, allowKingTarget) {
    for (const [dr, dc] of orient(dirs, piece.owner)) {
      const r = from.r + dr;
      const c = from.c + dc;
      if (!inside(r, c)) continue;
      const target = state.board[r][c];
      if (target && target.type === "K" && !allowKingTarget) continue;
      if (!target || target.owner !== piece.owner) addMoveWithPromotion(moves, piece, from, { r, c }, !!target);
    }
  }

  function addSlideMoves(state, moves, from, piece, dirs, allowKingTarget) {
    for (const [dr0, dc] of orient(dirs, piece.owner)) {
      let r = from.r + dr0;
      let c = from.c + dc;
      while (inside(r, c)) {
        const target = state.board[r][c];
        if (!target) {
          addMoveWithPromotion(moves, piece, from, { r, c }, false);
        } else {
          if (target.owner !== piece.owner && (target.type !== "K" || allowKingTarget)) addMoveWithPromotion(moves, piece, from, { r, c }, true);
          break;
        }
        r += dr0;
        c += dc;
      }
    }
  }

  function addMoveWithPromotion(moves, piece, from, to, capture) {
    if (mustPromote(piece, to.r)) {
      moves.push({ from, to, promote: true, capture });
      return;
    }
    moves.push({ from, to, promote: false, capture });
    if (canPromote(piece, from.r, to.r)) moves.push({ from, to, promote: true, capture });
  }

  function pseudoPieceMoves(state, r, c, allowKingTarget) {
    const piece = state.board[r][c];
    if (!piece) return [];
    const moves = [];
    const from = { r, c };
    if (piece.type === "K") addStepMoves(state, moves, from, piece, KING, allowKingTarget);
    else if (piece.promoted && ["S", "N", "L", "P"].includes(piece.type)) addStepMoves(state, moves, from, piece, GOLD, allowKingTarget);
    else if (piece.type === "G") addStepMoves(state, moves, from, piece, GOLD, allowKingTarget);
    else if (piece.type === "S") addStepMoves(state, moves, from, piece, SILVER, allowKingTarget);
    else if (piece.type === "N") addStepMoves(state, moves, from, piece, [[-2, -1], [-2, 1]], allowKingTarget);
    else if (piece.type === "P") addStepMoves(state, moves, from, piece, [[-1, 0]], allowKingTarget);
    else if (piece.type === "L") addSlideMoves(state, moves, from, piece, [[-1, 0]], allowKingTarget);
    else if (piece.type === "R") {
      addSlideMoves(state, moves, from, piece, [[-1, 0], [1, 0], [0, -1], [0, 1]], allowKingTarget);
      if (piece.promoted) addStepMoves(state, moves, from, piece, [[-1, -1], [-1, 1], [1, -1], [1, 1]], allowKingTarget);
    } else if (piece.type === "B") {
      addSlideMoves(state, moves, from, piece, [[-1, -1], [-1, 1], [1, -1], [1, 1]], allowKingTarget);
      if (piece.promoted) addStepMoves(state, moves, from, piece, [[-1, 0], [1, 0], [0, -1], [0, 1]], allowKingTarget);
    }
    return moves;
  }

  function hasPawnInFile(state, side, col) {
    for (let r = 0; r < 9; r++) {
      const p = state.board[r][col];
      if (p && p.owner === side && p.type === "P" && !p.promoted) return true;
    }
    return false;
  }

  function isPawnDropMate(state, side, move) {
    const temp = Object.assign(window.ShogiBoard.cloneState(state), { turn: side });
    const next = applyMove(temp, move);
    const defender = opponent(side);
    return inCheck(next, defender) && legalMoves(next, defender, { ignorePawnDropMate: true }).length === 0;
  }

  function dropMoves(state, side, options) {
    const moves = [];
    for (const type of HAND_ORDER) {
      if (state.hands[side][type] <= 0) continue;
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
        if (state.board[r][c]) continue;
        if ((type === "P" || type === "L") && (side === "b" ? r === 0 : r === 8)) continue;
        if (type === "N" && (side === "b" ? r <= 1 : r >= 7)) continue;
        if (type === "P" && hasPawnInFile(state, side, c)) continue;
        const move = { drop: true, piece: type, to: { r, c } };
        if (type === "P" && !options.ignorePawnDropMate && isPawnDropMate(state, side, move)) continue;
        moves.push(move);
      }
    }
    return moves;
  }

  function allPseudoMoves(state, side, options = {}) {
    const moves = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const p = state.board[r][c];
      if (p && p.owner === side) moves.push(...pseudoPieceMoves(state, r, c));
    }
    moves.push(...dropMoves(state, side, options));
    return moves;
  }

  function findKing(state, side) {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const p = state.board[r][c];
      if (p && p.owner === side && p.type === "K") return { r, c };
    }
    return null;
  }

  function attacksSquare(state, side, square) {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const p = state.board[r][c];
      if (!p || p.owner !== side) continue;
      if (pseudoPieceMoves(state, r, c, true).some(m => m.to.r === square.r && m.to.c === square.c)) return true;
    }
    return false;
  }

  function inCheck(state, side) {
    const king = findKing(state, side);
    return !king || attacksSquare(state, opponent(side), king);
  }

  function legalMoves(state, side, options = {}) {
    return allPseudoMoves(state, side, options).filter(move => {
      try {
        const temp = Object.assign(window.ShogiBoard.cloneState(state), { turn: side });
        const next = applyMove(temp, move);
        return !inCheck(next, side);
      } catch {
        return false;
      }
    });
  }

  function legalMovesFrom(state, r, c) {
    return legalMoves(state, state.turn).filter(m => !m.drop && m.from.r === r && m.from.c === c);
  }

  function legalDropsFor(state, type) {
    return legalMoves(state, state.turn).filter(m => m.drop && m.piece === type);
  }

  function isCheckmate(state, side) {
    return inCheck(state, side) && legalMoves(state, side).length === 0;
  }

  function moveKey(move) {
    if (!move) return "";
    if (move.drop) return `D${move.piece}${move.to.r}${move.to.c}`;
    return `${move.from.r}${move.from.c}${move.to.r}${move.to.c}${move.promote ? "+" : ""}`;
  }

  function givesCheck(state, move, side) {
    const temp = Object.assign(window.ShogiBoard.cloneState(state), { turn: side });
    const next = applyMove(temp, move);
    return inCheck(next, opponent(side));
  }

  function generateCheckMoves(state, side) {
    return legalMoves(state, side).filter(move => givesCheck(state, move, side));
  }

  function generateEvasionMoves(state, side) {
    return legalMoves(state, side);
  }

  function findMateInOne(state, side) {
    const moves = legalMoves(state, side);
    for (const move of moves) {
      const temp = Object.assign(window.ShogiBoard.cloneState(state), { turn: side });
      const next = applyMove(temp, move);
      const defender = opponent(side);
      if (!inCheck(next, defender)) continue;
      if (legalMoves(next, defender).length === 0) return move;
    }
    return null;
  }

  function findMate(state, side, depth) {
    if (depth <= 1) return findMateInOne(state, side);
    const checks = generateCheckMoves(state, side);
    for (const move of checks) {
      const temp = Object.assign(window.ShogiBoard.cloneState(state), { turn: side });
      const next = applyMove(temp, move);
      const defender = opponent(side);
      if (isCheckmate(next, defender)) return move;
      const replies = legalMoves(next, defender);
      if (!replies.length && inCheck(next, defender)) return move;
      const forced = replies.every(reply => {
        const afterReply = applyMove(Object.assign(window.ShogiBoard.cloneState(next), { turn: defender }), reply);
        return !!findMate(afterReply, side, depth - 2);
      });
      if (forced) return move;
    }
    return null;
  }

  function isLegalMove(state, move, side = state.turn) {
    const key = moveKey(move);
    return legalMoves(state, side).some(item => moveKey(item) === key);
  }

  function finalLegalMove(state, move, side = state.turn) {
    if (isLegalMove(state, move, side)) return move;
    return null;
  }

  window.ShogiRules = {
    pseudoPieceMoves,
    generatePseudoLegalMoves: allPseudoMoves,
    filterLegalMoves: legalMoves,
    legalMoves,
    legalMovesFrom,
    legalDropsFor,
    inCheck,
    isCheckmate,
    hasPawnInFile,
    isPawnDropMate,
    attacksSquare,
    givesCheck,
    generateCheckMoves,
    generateEvasionMoves,
    findMateInOne,
    findMate,
    isLegalMove,
    finalLegalMove
  };
})();
