(function () {
  const { piece } = window.ShogiPieces;

  function initialBoard() {
    const b = Array.from({ length: 9 }, () => Array(9).fill(null));
    const top = ["L", "N", "S", "G", "K", "G", "S", "N", "L"];
    const bottom = ["L", "N", "S", "G", "K", "G", "S", "N", "L"];
    for (let c = 0; c < 9; c++) {
      b[0][c] = piece(top[c], "w");
      b[2][c] = piece("P", "w");
      b[6][c] = piece("P", "b");
      b[8][c] = piece(bottom[c], "b");
    }
    b[1][1] = piece("R", "w");
    b[1][7] = piece("B", "w");
    b[7][1] = piece("B", "b");
    b[7][7] = piece("R", "b");
    return b;
  }

  function emptyHands() {
    return {
      b: { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 },
      w: { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 }
    };
  }

  function newState() {
    return {
      board: initialBoard(),
      hands: emptyHands(),
      turn: "b",
      history: [],
      evalHistory: [50],
      gameOver: false,
      version: 26,
      message: "先手番です。"
    };
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function inside(r, c) {
    return r >= 0 && r < 9 && c >= 0 && c < 9;
  }

  function opponent(side) {
    return side === "b" ? "w" : "b";
  }

  function applyMove(state, move) {
    const next = cloneState(state);
    const side = state.turn;
    if (move.drop) {
      next.board[move.to.r][move.to.c] = { type: move.piece, owner: side, promoted: false };
      next.hands[side][move.piece] -= 1;
    } else {
      const moving = next.board[move.from.r][move.from.c];
      if (!moving) return next;
      const captured = next.board[move.to.r][move.to.c];
      if (captured) {
        const capturedType = window.ShogiPieces.demote(window.ShogiPieces.keyOf(captured));
        if (capturedType !== "K" && Object.prototype.hasOwnProperty.call(next.hands[side], capturedType)) {
          next.hands[side][capturedType] += 1;
        }
      }
      next.board[move.from.r][move.from.c] = null;
      moving.promoted = moving.promoted || !!move.promote;
      next.board[move.to.r][move.to.c] = moving;
    }
    next.turn = opponent(side);
    next.history.push(move);
    return next;
  }

  function makeMove(state, move) {
    const side = state.turn;
    const undo = {
      move,
      side,
      prevTurn: state.turn,
      captured: null,
      moving: null,
      promotedBefore: false,
      historyLength: state.history.length
    };

    if (move.drop) {
      undo.handBefore = state.hands[side][move.piece];
      state.board[move.to.r][move.to.c] = { type: move.piece, owner: side, promoted: false };
      state.hands[side][move.piece] -= 1;
    } else {
      const moving = state.board[move.from.r][move.from.c];
      undo.moving = moving;
      undo.promotedBefore = moving ? moving.promoted : false;
      undo.captured = state.board[move.to.r][move.to.c];
      state.board[move.from.r][move.from.c] = null;
      if (undo.captured) {
        const capturedType = window.ShogiPieces.demote(window.ShogiPieces.keyOf(undo.captured));
        undo.capturedType = capturedType;
        undo.handBefore = state.hands[side][capturedType];
        if (capturedType !== "K" && Object.prototype.hasOwnProperty.call(state.hands[side], capturedType)) {
          state.hands[side][capturedType] += 1;
        }
      }
      if (moving) {
        moving.promoted = moving.promoted || !!move.promote;
        state.board[move.to.r][move.to.c] = moving;
      }
    }

    state.turn = opponent(side);
    state.history.push(move);
    return undo;
  }

  function undoMove(state, undo) {
    const { move, side } = undo;
    state.turn = undo.prevTurn;
    state.history.length = undo.historyLength;

    if (move.drop) {
      state.board[move.to.r][move.to.c] = null;
      state.hands[side][move.piece] = undo.handBefore;
      return;
    }

    const moving = state.board[move.to.r][move.to.c];
    if (moving) moving.promoted = undo.promotedBefore;
    state.board[move.from.r][move.from.c] = moving;
    state.board[move.to.r][move.to.c] = undo.captured;
    if (undo.captured && undo.capturedType) state.hands[side][undo.capturedType] = undo.handBefore;
  }

  window.ShogiBoard = { newState, cloneState, inside, opponent, applyMove, makeMove, undoMove };
})();
