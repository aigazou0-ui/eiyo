(function () {
  const PIECE_NAMES = {
    K: "玉", R: "飛", B: "角", G: "金", S: "銀", N: "桂", L: "香", P: "歩",
    PR: "龍", PB: "馬", PS: "成銀", PN: "成桂", PL: "成香", PP: "と"
  };

  const HAND_ORDER = ["R", "B", "G", "S", "N", "L", "P"];
  const PROMOTABLE = new Set(["R", "B", "S", "N", "L", "P"]);
  const VALUES = { K: 0, R: 950, B: 780, G: 520, S: 450, N: 330, L: 300, P: 95 };
  const PROMOTED_VALUES = { PR: 1250, PB: 1050, PS: 540, PN: 500, PL: 480, PP: 420 };

  function piece(type, owner, promoted) {
    return { type, owner, promoted: !!promoted };
  }

  function keyOf(p) {
    if (!p) return "";
    if (!p.promoted) return p.type;
    return { R: "PR", B: "PB", S: "PS", N: "PN", L: "PL", P: "PP" }[p.type] || p.type;
  }

  function labelOf(p) {
    if (typeof p === "string") return PIECE_NAMES[p] || p;
    return PIECE_NAMES[keyOf(p)] || p.type;
  }

  function demote(type) {
    return { PR: "R", PB: "B", PS: "S", PN: "N", PL: "L", PP: "P" }[type] || type;
  }

  function canPromote(pieceObj, fromRow, toRow) {
    if (!pieceObj || !PROMOTABLE.has(pieceObj.type) || pieceObj.promoted) return false;
    const zone = pieceObj.owner === "b" ? [0, 1, 2] : [6, 7, 8];
    return zone.includes(fromRow) || zone.includes(toRow);
  }

  function mustPromote(pieceObj, toRow) {
    if (!pieceObj || pieceObj.promoted) return false;
    if (pieceObj.type === "P" || pieceObj.type === "L") return pieceObj.owner === "b" ? toRow === 0 : toRow === 8;
    if (pieceObj.type === "N") return pieceObj.owner === "b" ? toRow <= 1 : toRow >= 7;
    return false;
  }

  window.ShogiPieces = { PIECE_NAMES, HAND_ORDER, VALUES, PROMOTED_VALUES, piece, keyOf, labelOf, demote, canPromote, mustPromote };
})();
