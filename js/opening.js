(function () {
  const FILES = ["9", "8", "7", "6", "5", "4", "3", "2", "1"];
  const RANKS = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

  const LINES = [
    {
      id: "gangi",
      weight: 1.15,
      moves: [
        "7g7f", "3c3d", "6g6f", "8c8d", "7i6h", "6a5b",
        "6h6g", "5a4b", "5g5f", "7a6b", "4i5h", "4a3b",
        "6i7h", "5c5d", "5h6h", "6b5c", "3i4h", "4b3a",
        "4h5g", "5c4d", "5i6i", "3a2b", "6i7i", "2c2d",
        "3g3f", "2d2e", "2g2f", "2e2f", "2h2f", "8d8e",
        "8h7g", "7c7d", "7h6h", "7d7e", "7f7e", "8e8f",
        "8g8f", "8b8f", "7g8f", "2b3c"
      ]
    },
    {
      id: "static-rapid",
      weight: 1.0,
      moves: [
        "2g2f", "3c3d", "7g7f", "8c8d", "2f2e", "8d8e",
        "7i6h", "7a6b", "3i4h", "5a4b", "4h5g", "6a5b",
        "5g4f", "4a3b", "3g3f", "7c7d", "3i3h", "6c6d",
        "3h3g", "6b6c", "4f3g", "5c5d", "3g4f", "4b3a",
        "6i7h", "3a2b", "5i6h", "2c2d", "2e2d", "2b2d",
        "2h2d", "8e8f", "8g8f", "8b8f", "2d2h", "8f8b",
        "6h7g", "5b4b", "4i5h", "4b5b"
      ]
    },
    {
      id: "yagura",
      weight: 1.25,
      moves: [
        "7g7f", "3c3d", "6i7h", "4a3b", "6g6f", "8c8d", "7i6h", "7a6b",
        "5g5f", "5a4b", "4i5h", "6a5b", "6h7g", "5c5d", "5i6i", "4b3a",
        "7h6g", "6b5c", "3i4h", "3a2b", "6i7h", "5c4d", "4h5g", "2b3c",
        "5h6g", "8d8e", "8h7g", "7c7d", "3g3f", "7d7e", "7f7e", "8e8f",
        "8g8f", "8b8f", "7g8f", "3c4b", "2g2f", "2c2d", "2f2e", "2d2e"
      ]
    },
    {
      id: "bishop-exchange",
      weight: 1.05,
      moves: [
        "7g7f", "3c3d", "2g2f", "8c8d", "8h2b+", "3a2b", "8g8f", "8d8e",
        "7i7h", "7a7b", "3i3h", "5a4b", "4i4h", "6a5b", "6i6h", "7c7d",
        "4h4g", "7b7c", "3h3g", "6c6d", "6h7g", "7c6b", "5i6h", "4b3a",
        "2i3g", "3a2b", "5g5f", "5c5d", "6g6f", "4c4d", "7h6g", "6b5c",
        "6h7h", "5c4b", "1g1f", "1c1d", "9g9f", "9c9d", "2f2e", "2c2d"
      ]
    },
    {
      id: "side-pawn-style",
      weight: 0.9,
      moves: [
        "2g2f", "8c8d", "7g7f", "3c3d", "2f2e", "8d8e", "7i7h", "7a7b",
        "3i3h", "4a3b", "5i6h", "5a4b", "4i4h", "6a5b", "8g8f", "8e8f",
        "8h2b+", "3a2b", "8g8f", "7b8c", "2i3g", "4b3a", "4h4g", "7c7d",
        "3h4i", "8c7b", "6h7g", "7b6c", "1g1f", "1c1d", "9g9f", "9c9d",
        "4g5f", "6c5d", "6g6f", "5d6c", "7g8h", "3a4b", "5f6g", "4b3a"
      ]
    },
    {
      id: "fourth-file-mino",
      weight: 1.1,
      moves: [
        "7g7f", "3c3d", "6h6f", "8c8d", "7i6h", "6a5b", "6i7h", "4a3b",
        "4i3h", "5a4b", "5i4h", "8d8e", "8h7g", "7a6b", "3h3i", "5c5d",
        "4h3h", "4b5c", "6h5g", "5c4d", "3h2h", "3a4b", "2h3h", "6b5c",
        "3i2h", "2c2d", "1g1f", "1c1d", "9g9f", "9c9d", "6f6e", "5d5e",
        "5g6f", "4d5c", "7h6h", "7c7d", "6h5h", "5b6b", "5h4h", "6b7b"
      ]
    },
    {
      id: "nakabisha-mino",
      weight: 1.0,
      moves: [
        "7g7f", "3c3d", "5h5f", "8c8d", "5g5f", "6a5b", "5i4h", "4a3b",
        "4h3h", "5a4b", "3h2h", "7a6b", "2h3h", "8d8e", "8h7g", "5c5d",
        "3i2h", "4b5c", "6i7h", "5c4d", "7i6h", "3a4b", "6h5g", "6b5c",
        "5f5e", "5d5e", "5g5f", "5c5d", "5f5e", "5d5e", "5f5e", "4d5e",
        "5h5e", "4b5c", "5e5h", "2c2d", "1g1f", "1c1d", "9g9f", "9c9d"
      ]
    },
    {
      id: "right-king",
      weight: 0.85,
      moves: [
        "2g2f", "8c8d", "7g7f", "3c3d", "3i4h", "7a6b", "4h5g", "6a5b",
        "5g4f", "5a4b", "4i5h", "4a3b", "5i4h", "6c6d", "4h3h", "6b6c",
        "3h2h", "8d8e", "8h7g", "7c7d", "6g6f", "5c5d", "5h6g", "6c5b",
        "6i7h", "4b3a", "7i6h", "5b4b", "1g1f", "1c1d", "9g9f", "9c9d",
        "2f2e", "2c2d", "2e2d", "2b2d", "2h2g", "3a2b", "2g3g", "2b3a"
      ]
    }
  ];

  const STYLE_LINES = {
    yagura: ["yagura"],
    gangi: ["gangi"],
    "right-king": ["right-king"],
    "static-rapid": ["static-rapid", "bishop-exchange", "side-pawn-style"],
    "ranging-mino": ["fourth-file-mino", "nakabisha-mino"],
    balanced: ["yagura", "gangi", "right-king"],
    static: ["yagura", "gangi", "bishop-exchange"],
    ranging: ["fourth-file-mino", "nakabisha-mino"],
    defensive: ["yagura", "gangi", "right-king"],
    attacking: ["static-rapid", "bishop-exchange", "fourth-file-mino", "nakabisha-mino"],
    varied: ["yagura", "gangi", "bishop-exchange", "fourth-file-mino", "nakabisha-mino", "right-king", "static-rapid"]
  };

  const STYLE_ALIASES = {
    rightKing: "right-king",
    staticRapid: "static-rapid",
    rangingMino: "ranging-mino"
  };

  const POLICY_MOVES = {
    yagura: {
      b: ["7g7f", "6g6f", "7i6h", "6h7g", "6i7h", "4i5h", "5i6i", "6i7i", "3i4h", "4h5g", "2g2f", "2f2e"],
      w: ["3c3d", "4c4d", "3a4b", "4b3c", "4a3b", "6a5b", "5a4b", "4b3a", "7a6b", "6b5c", "8c8d", "8d8e"]
    },
    gangi: {
      b: ["7g7f", "6g6f", "7i6h", "6h6g", "5g5f", "4i5h", "5h6h", "6i7h", "3i4h", "4h5g", "5i6i", "6i7i"],
      w: ["3c3d", "4c4d", "3a4b", "4b4c", "5c5d", "6a5b", "5b4b", "4a3b", "7a6b", "6b5c", "5a4b", "4b3a"]
    },
    "right-king": {
      b: ["2g2f", "7g7f", "3i4h", "4h5g", "5g4f", "4i5h", "5i4h", "4h3h", "3h2h", "3g3f", "2f2e"],
      w: ["8c8d", "3c3d", "7a6b", "6b5c", "5c6d", "6a5b", "5a6b", "6b7b", "7b8b", "7c7d", "8d8e"]
    },
    "static-rapid": {
      b: ["2g2f", "7g7f", "2f2e", "3i4h", "4h5g", "5g4f", "3g3f", "2i3g", "8h2b+", "2e2d"],
      w: ["8c8d", "3c3d", "8d8e", "7a6b", "6b5c", "5c6d", "7c7d", "8a7c", "2b8h+", "8e8f"]
    },
    "ranging-mino": {
      b: ["7g7f", "6h6f", "5h5f", "7i6h", "6i7h", "4i3h", "5i4h", "4h3h", "3h2h", "3i2h", "1g1f", "9g9f"],
      w: ["3c3d", "4b4d", "5b5d", "3a4b", "4a3b", "6a7b", "5a6b", "6b7b", "7b8b", "7a8b", "1c1d", "9c9d"]
    }
  };

  function usiSquare(text) {
    return { r: RANKS.indexOf(text[1]), c: FILES.indexOf(text[0]) };
  }

  function moveFromUsi(usi) {
    if (usi[1] === "*") return { drop: true, piece: usi[0], to: usiSquare(usi.slice(2, 4)) };
    return {
      from: usiSquare(usi.slice(0, 2)),
      to: usiSquare(usi.slice(2, 4)),
      promote: usi.endsWith("+")
    };
  }

  function moveKey(move) {
    if (!move) return "";
    if (move.drop) return `D${move.piece}${move.to.r}${move.to.c}`;
    return `${move.from.r}${move.from.c}${move.to.r}${move.to.c}${move.promote ? "+" : ""}`;
  }

  function moveToUsi(move) {
    const sq = pos => `${FILES[pos.c]}${RANKS[pos.r]}`;
    if (move.drop) return `${move.piece}*${sq(move.to)}`;
    return `${sq(move.from)}${sq(move.to)}${move.promote ? "+" : ""}`;
  }

  function isBishopHeadPawnPushUsi(usi) {
    return usi === "2c2d" || usi === "8g8f";
  }

  function normalizeStyle(style) {
    return STYLE_ALIASES[style] || style || "balanced";
  }

  function sameMove(a, b) {
    return moveKey(a) === moveKey(b);
  }

  function advancedRank(side, square) {
    return side === "b" ? 8 - square.r : square.r;
  }

  function isRiskyBookMove(state, move) {
    if (!move || move.drop || !move.from) return false;
    if (isBishopHeadPawnPushUsi(moveToUsi(move)) && state.history.length < 72) return true;
    if (isRecentReverseMove(state, move)) return true;
    const piece = state.board[move.from.r][move.from.c];
    if (!piece) return false;
    const ply = state.history.length;
    const advanced = advancedRank(piece.owner, move.to);
    if ((piece.type === "R" || piece.type === "B") && advanced >= 5 && ply < 42) return true;
    if (piece.type !== "P" && piece.type !== "K" && advanced >= 6 && ply < 30 && !move.capture) return true;
    return false;
  }

  function isRecentReverseMove(state, move) {
    if (!move || move.drop || move.capture || !move.from || state.history.length > 36) return false;
    const lookback = state.history.slice(Math.max(0, state.history.length - 10));
    return lookback.some(prev => {
      if (!prev || prev.drop || !prev.from || !prev.to) return false;
      return prev.from.r === move.to.r && prev.from.c === move.to.c &&
        prev.to.r === move.from.r && prev.to.c === move.from.c;
    });
  }

  function legalBookMove(state, legalMoves, usi) {
    const bookMove = moveFromUsi(usi);
    const found = legalMoves.find(move => sameMove(move, bookMove)) || null;
    if (isRiskyBookMove(state, found)) return null;
    return found;
  }

  function historyUsi(state) {
    return state.history.map(moveToUsi);
  }

  function prefixMatch(line, history) {
    let count = 0;
    while (count < history.length && count < line.moves.length && line.moves[count] === history[count]) count++;
    return count;
  }

  function activeLines(style) {
    const ids = STYLE_LINES[normalizeStyle(style)] || STYLE_LINES.balanced;
    return LINES.filter(line => ids.includes(line.id));
  }

  function styleTags(style) {
    const normalized = normalizeStyle(style);
    if (POLICY_MOVES[normalized]) return [normalized];
    const ids = STYLE_LINES[normalized] || STYLE_LINES.balanced;
    const tags = [];
    for (const id of ids) {
      if (id === "bishop-exchange" || id === "side-pawn-style") tags.push("static-rapid");
      else if (id === "fourth-file-mino" || id === "nakabisha-mino") tags.push("ranging-mino");
      else if (POLICY_MOVES[id]) tags.push(id);
    }
    return Array.from(new Set(tags));
  }

  function exactCandidates(state, legalMoves, style) {
    const history = historyUsi(state);
    const list = [];
    for (const line of activeLines(style)) {
      const ply = history.length;
      if (ply >= line.moves.length) continue;
      if (prefixMatch(line, history) !== ply) continue;
      const move = legalBookMove(state, legalMoves, line.moves[ply]);
      if (!move) continue;
      list.push({ move, score: 900000 + line.weight * 10000 - ply * 10, opening: line.id, book: true });
    }
    return merge(list);
  }

  function repairCandidates(state, legalMoves, style) {
    const ply = state.history.length;
    if (ply > 56) return [];
    const history = historyUsi(state);
    const list = [];
    for (const line of activeLines(style)) {
      const matched = prefixMatch(line, history);
      for (let i = Math.max(0, ply - 8); i < Math.min(line.moves.length, ply + 12); i++) {
        if (i % 2 !== ply % 2) continue;
        const move = legalBookMove(state, legalMoves, line.moves[i]);
        if (!move) continue;
        const distance = Math.abs(i - ply);
        const score = 620000 + matched * 20000 + line.weight * 8000 - distance * 9000 - i * 70;
        list.push({ move, score, opening: line.id, book: true });
      }
    }
    return merge(list).slice(0, 5);
  }

  function policyBonus(state, move, style) {
    const side = state.turn;
    const usi = moveToUsi(move);
    const ply = state.history.length;
    if (isBishopHeadPawnPushUsi(usi) && ply < 72) return 0;
    if (isRecentReverseMove(state, move)) return 0;
    let best = 0;
    for (const tag of styleTags(style)) {
      const list = POLICY_MOVES[tag] && POLICY_MOVES[tag][side];
      if (!list) continue;
      const exact = list.indexOf(usi);
      if (exact >= 0) best = Math.max(best, 360000 - exact * 2200);
    }
    if (!best || isRiskyBookMove(state, move)) return 0;
    if (!move.drop && move.from) {
      const piece = state.board[move.from.r][move.from.c];
      if (piece) {
        const advancedBefore = advancedRank(side, move.from);
        const advancedAfter = advancedRank(side, move.to);
        const centerTo = 4 - Math.abs(move.to.c - 4);
        if (piece.type === "P") {
          if (side === "b" && move.from.r === 6 && move.to.r === 5 && (move.from.c === 2 || move.from.c === 7)) best += 90000;
          if (side === "w" && move.from.r === 2 && move.to.r === 3 && (move.from.c === 6 || move.from.c === 1)) best += 90000;
          if (isBishopHeadPawnPushUsi(usi) && ply < 72) best = 0;
        }
        if (piece.type === "S" && advancedAfter > advancedBefore && advancedAfter <= 3) best += 65000 + centerTo * 5000;
        if (piece.type === "G" && ply < 32 && (move.to.c <= 3 || move.to.c >= 5)) best += 36000;
        if (piece.type === "K" && ply < 30 && Math.abs(move.to.c - 4) > Math.abs(move.from.c - 4)) best += 70000;
        if ((piece.type === "R" || piece.type === "B") && !move.capture && advancedAfter >= 4 && ply < 34) best -= 170000;
      }
    }
    if (move.capture && ply < 20) best -= 120000;
    if (move.drop && ply < 26) best -= 90000;
    return Math.max(0, best);
  }

  function policyCandidates(state, legalMoves, style) {
    const ply = state.history.length;
    if (ply > 56) return [];
    return merge(legalMoves
      .map(move => {
        const bonus = policyBonus(state, move, style);
        return bonus ? { move, score: 520000 + bonus - ply * 1600, opening: normalizeStyle(style), book: true, policy: true } : null;
      })
      .filter(Boolean))
      .slice(0, 8);
  }

  function merge(items) {
    const map = new Map();
    for (const item of items) {
      const key = moveKey(item.move);
      const prev = map.get(key);
      if (!prev || item.score > prev.score) map.set(key, item);
    }
    return Array.from(map.values()).sort((a, b) => b.score - a.score);
  }

  function candidates(state, legalMoves, options = {}) {
    if (state.history.length > 56) return [];
    const style = options.style || state.openingStyle || "balanced";
    const exact = exactCandidates(state, legalMoves, style);
    if (exact.length) return exact;
    return merge(repairCandidates(state, legalMoves, style).concat(policyCandidates(state, legalMoves, style))).slice(0, 8);
  }

  window.ShogiOpening = { candidates };
})();
