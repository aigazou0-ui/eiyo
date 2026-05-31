(function () {
  const BOARD_TO_SFEN = {
    K: "K", R: "R", B: "B", G: "G", S: "S", N: "N", L: "L", P: "P"
  };
  const USI_FILES = ["9", "8", "7", "6", "5", "4", "3", "2", "1"];
  const USI_RANKS = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

  function pieceToSfen(piece) {
    if (!piece) return "";
    const base = BOARD_TO_SFEN[piece.type] || piece.type;
    const c = piece.owner === "b" ? base : base.toLowerCase();
    return piece.promoted ? `+${c}` : c;
  }

  function stateToSfen(state) {
    const rows = [];
    for (let r = 0; r < 9; r++) {
      let row = "";
      let empty = 0;
      for (let c = 0; c < 9; c++) {
        const piece = state.board[r][c];
        if (!piece) {
          empty += 1;
          continue;
        }
        if (empty) {
          row += String(empty);
          empty = 0;
        }
        row += pieceToSfen(piece);
      }
      if (empty) row += String(empty);
      rows.push(row);
    }
    const hands = handToSfen(state.hands.b) + handToSfen(state.hands.w).toLowerCase();
    return `${rows.join("/")} ${state.turn} ${hands || "-"} ${state.history.length + 1}`;
  }

  function handToSfen(hand) {
    let text = "";
    for (const type of ["R", "B", "G", "S", "N", "L", "P"]) {
      const count = hand[type] || 0;
      if (count <= 0) continue;
      text += count > 1 ? `${count}${type}` : type;
    }
    return text;
  }

  function squareToUsi(pos) {
    return `${USI_FILES[pos.c]}${USI_RANKS[pos.r]}`;
  }

  function usiToSquare(text) {
    const file = text[0];
    const rank = text[1];
    return { r: USI_RANKS.indexOf(rank), c: USI_FILES.indexOf(file) };
  }

  function moveToUsi(move) {
    if (move.drop) return `${move.piece}*${squareToUsi(move.to)}`;
    return `${squareToUsi(move.from)}${squareToUsi(move.to)}${move.promote ? "+" : ""}`;
  }

  function usiToMove(usi, state) {
    if (!usi || usi === "resign" || usi === "win") return null;
    if (usi[1] === "*") {
      const to = usiToSquare(usi.slice(2, 4));
      return { drop: true, piece: usi[0].toUpperCase(), to };
    }
    const from = usiToSquare(usi.slice(0, 2));
    const to = usiToSquare(usi.slice(2, 4));
    const promote = usi.endsWith("+");
    const target = state.board[to.r] && state.board[to.r][to.c];
    return { from, to, promote, capture: !!target };
  }

  function candidateFromUsi(item, state) {
    const move = usiToMove(item.move || item.bestmove, state);
    if (!move) return null;
    const centipawn = parseScore(item.score);
    return { move, score: Number.isFinite(centipawn) ? centipawn : 0, pv: item.pv || [], usi: item.move || item.bestmove };
  }

  function parseScore(score) {
    if (!score) return NaN;
    const parts = String(score).split(/\s+/);
    if (parts[0] === "cp") return Number(parts[1]);
    if (parts[0] === "mate") return Number(parts[1]) > 0 ? 100000 : -100000;
    return NaN;
  }

  window.ShogiUsi = { stateToSfen, moveToUsi, usiToMove, candidateFromUsi };
})();
