(function () {
  const files = ["９", "８", "７", "６", "５", "４", "３", "２", "１"];
  const ranks = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

  function squareName(pos) {
    return files[pos.c] + ranks[pos.r];
  }

  function moveText(move, side) {
    const prefix = side === "b" ? "▲" : "△";
    if (move.drop) return prefix + squareName(move.to) + window.ShogiPieces.labelOf(move.piece) + "打";
    const p = move.pieceBefore || "";
    return prefix + squareName(move.to) + p + (move.promote ? "成" : "");
  }

  function enrichMove(state, move) {
    const copy = JSON.parse(JSON.stringify(move));
    if (!copy.drop) copy.pieceBefore = window.ShogiPieces.labelOf(state.board[copy.from.r][copy.from.c]);
    return copy;
  }

  window.ShogiKifu = { squareName, moveText, enrichMove };
})();
