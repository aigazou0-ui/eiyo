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
    1: { depth: 1, time: 120, random: 520, reply: 0, danger: 0.12, q: false, tt: false, nodeLimit: 1200 },
    2: { depth: 1, time: 180, random: 80, reply: 0, danger: 0.22, q: false, tt: false, nodeLimit: 1800 },
    3: { depth: 1, time: 260, random: 35, reply: 28, danger: 0.34, q: false, tt: false, nodeLimit: 2600 },
    4: { depth: 2, time: 360, random: 18, reply: 48, danger: 0.48, q: false, tt: false, nodeLimit: 4200 },
    5: { depth: 3, time: 800, random: 8, reply: 64, danger: 0.62, q: false, tt: false, iterative: true, nodeLimit: 9000 },
    6: { depth: 4, time: 900, random: 3, reply: 80, danger: 0.76, q: false, tt: false, iterative: true, nodeLimit: 13000 },
    7: { depth: 4, time: 1100, random: 2, reply: 96, danger: 0.9, q: false, tt: true, iterative: true, nodeLimit: 18000 },
    8: { depth: 4, time: 1250, random: 1, reply: 120, danger: 1.04, q: true, tt: true, iterative: true, nodeLimit: 23000 },
    9: { depth: 5, time: 1450, random: 0, reply: 140, danger: 1.18, q: true, tt: true, iterative: true, nodeLimit: 30000 },
    10: { depth: 5, time: 1850, random: 0, reply: 180, danger: 1.35, q: true, tt: true, iterative: true, nodeLimit: 38000 }
  };

  function config(level, options = {}) {
    const lv = Math.max(1, Math.min(10, Number(level) || 2));
    const cfg = Object.assign({}, LEVELS[lv] || LEVELS[2]);
    if (options.mobile) {
      cfg.mobile = true;
      cfg.time = Math.min(cfg.time, lv >= 9 ? 1500 : lv >= 7 ? 900 : lv >= 5 ? 650 : 300);
      cfg.depth = Math.min(cfg.depth, lv >= 9 ? 4 : lv >= 6 ? 3 : lv >= 5 ? 2 : cfg.depth);
      cfg.iterative = lv >= 7;
      cfg.reply = Math.min(cfg.reply || 0, lv >= 9 ? 6 : lv >= 7 ? 4 : lv >= 5 ? 2 : 1);
      cfg.q = lv >= 9;
      cfg.tt = lv >= 8;
      cfg.mobileRootLimit = lv >= 9 ? 24 : lv >= 7 ? 16 : 10;
      cfg.mobileBranchLimit = lv >= 9 ? 12 : lv >= 7 ? 8 : 6;
      cfg.mobileQLimit = lv >= 9 ? 8 : 6;
      cfg.mobileMateDepth = options.mobileMateDepth || 1;
      cfg.nodeLimit = Math.min(cfg.nodeLimit || 6000, lv >= 9 ? 22000 : lv >= 7 ? 11000 : lv >= 5 ? 4500 : 1600);
    }
    if (Number.isFinite(options.timeLimit)) cfg.time = Math.max(80, Number(options.timeLimit));
    if (Number.isFinite(options.depthLimit)) cfg.depth = Math.max(1, Math.min(8, Number(options.depthLimit)));
    if (Number.isFinite(options.nodeLimit)) cfg.nodeLimit = Math.max(500, Number(options.nodeLimit));
    if (Number.isFinite(options.rootLimit)) cfg.mobileRootLimit = Math.max(6, Number(options.rootLimit));
    if (Number.isFinite(options.branchLimit)) cfg.mobileBranchLimit = Math.max(4, Number(options.branchLimit));
    cfg.deepThinking = !!options.deepThinking;
    if (cfg.deepThinking) {
      cfg.iterative = true;
      cfg.tt = true;
      cfg.mobileRootLimit = cfg.mobileRootLimit || (lv >= 9 ? 34 : lv >= 5 ? 26 : 18);
      cfg.mobileBranchLimit = cfg.mobileBranchLimit || (lv >= 9 ? 18 : lv >= 5 ? 14 : 8);
      cfg.mobileQLimit = Math.max(cfg.mobileQLimit || 0, lv >= 9 ? 10 : 8);
      cfg.mobileMateDepth = Math.max(cfg.mobileMateDepth || 1, lv >= 9 ? 3 : lv >= 5 ? 1 : 1);
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

  function openingPriorBonus(bookScore, ply) {
    if (!bookScore || ply > 34) return 0;
    const strength = Math.max(0, Math.min(1, (bookScore - 500000) / 450000));
    const scale = ply < 16 ? 650 : ply < 28 ? 420 : 220;
    return Math.round(strength * scale);
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

  function earlyMajorDropPenalty(state, move, side) {
    if (!move || !move.drop || (move.piece !== "B" && move.piece !== "R") || state.history.length >= 42) return 0;
    const enemy = window.ShogiBoard.opponent(side);
    const enemyKing = findKing(state, enemy);
    const beforeDist = distance(move.to, enemyKing);
    const undo = window.ShogiBoard.makeMove(state, move);
    const defended = window.ShogiRules.attacksSquare(state, side, move.to);
    window.ShogiBoard.undoMove(state, undo);
    let penalty = move.piece === "B" ? 18000 : 22000;
    if (state.history.length < 30) penalty += 14000;
    if (beforeDist > 3) penalty += 6000;
    if (!defended) penalty += 5000;
    return penalty;
  }

  function forbiddenEarlyMajorDrop(state, move, side) {
    if (!move || !move.drop || (move.piece !== "B" && move.piece !== "R")) return false;
    if (window.ShogiRules.inCheck(state, side)) return false;
    if (state.history.length < 30) return true;
    if (state.history.length >= 42) return false;
    const enemy = window.ShogiBoard.opponent(side);
    const enemyKing = findKing(state, enemy);
    const undo = window.ShogiBoard.makeMove(state, move);
    const gives = window.ShogiRules.inCheck(state, enemy);
    const pressure = attacksKingZoneFrom(state, move.to, side, enemyKing);
    const defended = window.ShogiRules.attacksSquare(state, side, move.to);
    window.ShogiBoard.undoMove(state, undo);
    return !gives && (!defended || pressure <= 0);
  }

  function forbiddenEarlyKingExposure(state, move, side) {
    if (!move || move.drop || !move.from || state.history.length >= 44) return false;
    if (window.ShogiRules.inCheck(state, side)) return false;
    const piece = state.board[move.from.r][move.from.c];
    if (!piece || piece.type !== "K") return false;
    const advanced = advancedRank(side, move.to);
    if (advanced < 2) return false;
    const homeRank = side === "b" ? 8 : 0;
    const fromHomeDistance = Math.abs(move.from.r - homeRank);
    const toHomeDistance = Math.abs(move.to.r - homeRank);
    return toHomeDistance > fromHomeDistance;
  }

  function forbiddenEarlyMajorAdvance(state, move, side) {
    if (!move || move.drop || !move.from || state.history.length >= 32) return false;
    const piece = state.board[move.from.r][move.from.c];
    if (!piece || (piece.type !== "R" && piece.type !== "B")) return false;
    const advanced = advancedRank(side, move.to);
    if (advanced < 5) return false;
    const enemy = window.ShogiBoard.opponent(side);
    const enemyKing = findKing(state, enemy);
    const undo = window.ShogiBoard.makeMove(state, move);
    const gives = window.ShogiRules.inCheck(state, enemy);
    const pressure = attacksKingZoneFrom(state, move.to, side, enemyKing);
    const support = localAttackSupport(state, move.to, side, enemyKing);
    window.ShogiBoard.undoMove(state, undo);
    if (state.history.length < 30) return !gives;
    return !gives && pressure <= 0 && support < 4;
  }

  function forbiddenEarlyEdgeBishop(state, move, side) {
    if (!move || move.drop || !move.from || move.promote || state.history.length >= 72) return false;
    const piece = state.board[move.from.r][move.from.c];
    if (!piece || piece.type !== "B") return false;
    if (move.to.c !== 0 && move.to.c !== 8) return false;
    if (move.capture) return false;
    return true;
  }

  function badEdgeBishopBoard(state, side) {
    if (!state || state.history.length >= 72) return false;
    const enemy = window.ShogiBoard.opponent(side);
    const enemyKing = findKing(state, enemy);
    const ownKing = findKing(state, side);
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        const piece = state.board[r][c];
        if (!piece || piece.owner !== side || piece.type !== "B" || piece.promoted) continue;
        if (c !== 0 && c !== 8) continue;
        const square = { r, c };
        const pressure = attacksKingZoneFrom(state, square, side, enemyKing);
        const support = localAttackSupport(state, square, side, enemyKing);
        const ownKingDist = distance(square, ownKing);
        let mobility = 0;
        for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          let rr = r + dr;
          let cc = c + dc;
          while (rr >= 0 && rr < 9 && cc >= 0 && cc < 9) {
            const target = state.board[rr][cc];
            if (!target) mobility += 1;
            else {
              if (target.owner !== side) mobility += 1;
              break;
            }
            rr += dr;
            cc += dc;
          }
        }
        if (ownKingDist > 2) return true;
      }
    }
    return false;
  }

  function hasUnpromotedEdgeBishop(state, side) {
    if (!state || state.history.length >= 72) return false;
    for (let r = 0; r < 9; r += 1) {
      for (const c of [0, 8]) {
        const piece = state.board[r][c];
        if (piece && piece.owner === side && piece.type === "B" && !piece.promoted) return true;
      }
    }
    return false;
  }

  function leavesBadEdgeBishopBoard(state, move, side) {
    if (!move || state.history.length >= 72) return false;
    const moving = (!move.drop && move.from) ? state.board[move.from.r][move.from.c] : null;
    const bishopCanReachEdge = moving && moving.type === "B" && !moving.promoted && (move.to.c === 0 || move.to.c === 8);
    if (!bishopCanReachEdge && !hasUnpromotedEdgeBishop(state, side)) return false;
    const undo = window.ShogiBoard.makeMove(state, move);
    const bad = badEdgeBishopBoard(state, side);
    window.ShogiBoard.undoMove(state, undo);
    return bad;
  }

  function allowsOpponentMateInOne(state, move) {
    if (!move) return false;
    const undo = window.ShogiBoard.makeMove(state, move);
    const defender = state.turn;
    const mate = window.ShogiRules.findMate(state, defender, 1);
    window.ShogiBoard.undoMove(state, undo);
    return !!mate;
  }

  function preferNoImmediateMate(state, ordered, limit) {
    if (!ordered.length || state.history.length < 64) return ordered;
    const inCheck = window.ShogiRules.inCheck(state, state.turn);
    if (!inCheck && ordered.length > 8 && state.history.length < 70) return ordered;
    const checkLimit = Math.min(limit || 4, ordered.length);
    for (let i = 0; i < checkLimit; i += 1) {
      if (!allowsOpponentMateInOne(state, ordered[i].move)) {
        if (i === 0) return ordered;
        return [ordered[i]].concat(ordered.slice(0, i), ordered.slice(i + 1));
      }
    }
    return ordered;
  }

  function kingWanderPenalty(state, move, side) {
    if (!move || move.drop) return 0;
    const piece = state.board[move.from.r][move.from.c];
    if (!piece || piece.type !== "K") return 0;
    if (window.ShogiRules.inCheck(state, side)) return 0;
    const home = side === "b" ? 8 : 0;
    const fromCastle = Math.abs(move.from.c - 4) + Math.abs(move.from.r - home);
    const toCastle = Math.abs(move.to.c - 4) + Math.abs(move.to.r - home);
    const fromWing = Math.abs(move.from.c - 4);
    const toWing = Math.abs(move.to.c - 4);
    const advanced = advancedRank(side, move.to);
    let penalty = state.history.length < 18 ? 80 : 120;
    if (state.history.length < 44 && advanced >= 2) penalty += 7000 + (44 - state.history.length) * 90;
    if (state.history.length < 28 && advanced >= 1 && toWing > 1) penalty += 420;
    if (state.history.length > 30) penalty += 120;
    if (toWing < fromWing) penalty += 180;
    if (toCastle < fromCastle && fromWing >= 2) penalty += 180;
    return penalty;
  }

  function earlyMajorPieceSortiePenalty(state, move, side) {
    if (!move || move.drop || state.history.length > 42) return 0;
    const piece = state.board[move.from.r][move.from.c];
    if (!piece || (piece.type !== "R" && piece.type !== "B")) return 0;
    const homeRank = side === "b" ? 8 : 0;
    const advanced = advancedRank(side, move.to);
    let penalty = 0;
    if (advanced >= 5 && state.history.length < 34) penalty += move.capture ? 780 : 520;
    if (move.promote && advanced >= 6 && state.history.length < 36) penalty += move.capture ? 620 : 900;
    if (piece.type === "B" && Math.abs(move.from.r - homeRank) <= 1 && advanced < 5) penalty += 360;
    if (piece.type === "R" && Math.abs(move.to.c - move.from.c) >= 2 && state.history.length < 34) penalty += 420;
    const undo = window.ShogiBoard.makeMove(state, move);
    const attacked = window.ShogiRules.attacksSquare(state, window.ShogiBoard.opponent(side), move.to);
    const defended = window.ShogiRules.attacksSquare(state, side, move.to);
    window.ShogiBoard.undoMove(state, undo);
    if (attacked && !defended) penalty += piece.type === "R" ? 900 : 720;
    return penalty;
  }

  function majorEscapeBonus(state, move, side) {
    if (!move || move.drop || !move.from) return 0;
    const piece = state.board[move.from.r][move.from.c];
    if (!piece || (piece.type !== "R" && piece.type !== "B")) return 0;
    const enemy = window.ShogiBoard.opponent(side);
    const beforeAttacked = window.ShogiRules.attacksSquare(state, enemy, move.from);
    const beforeDefended = window.ShogiRules.attacksSquare(state, side, move.from);
    const undo = window.ShogiBoard.makeMove(state, move);
    const afterAttacked = window.ShogiRules.attacksSquare(state, enemy, move.to);
    const afterDefended = window.ShogiRules.attacksSquare(state, side, move.to);
    window.ShogiBoard.undoMove(state, undo);
    let bonus = 0;
    if (beforeAttacked && (!beforeDefended || move.capture)) bonus += piece.type === "R" ? 520 : 420;
    if (!afterAttacked || afterDefended) bonus += piece.type === "R" ? 160 : 130;
    if (afterAttacked && !afterDefended) bonus -= piece.type === "R" ? 900 : 720;
    return bonus;
  }

  function findKing(state, side) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = state.board[r][c];
        if (p && p.owner === side && p.type === "K") return { r, c };
      }
    }
    return null;
  }

  function distance(a, b) {
    if (!a || !b) return 9;
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
  }

  function attacksKingZoneFrom(state, square, side, enemyKing) {
    if (!square || !enemyKing) return 0;
    const piece = state.board[square.r][square.c];
    if (!piece || piece.owner !== side || piece.type === "K") return 0;
    let count = 0;
    for (const pseudo of window.ShogiRules.pseudoPieceMoves(state, square.r, square.c, true)) {
      const d = distance(pseudo.to, enemyKing);
      if (d <= 1) count += 3;
      else if (d <= 2) count += 1;
    }
    return count;
  }

  function nearOwnKing(state, side, square) {
    const king = findKing(state, side);
    return !!king && distance(king, square) <= 2;
  }

  function localAttackSupport(state, square, side, enemyKing) {
    let support = 0;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (!dr && !dc) continue;
        const r = square.r + dr;
        const c = square.c + dc;
        if (r < 0 || r >= 9 || c < 0 || c >= 9) continue;
        const p = state.board[r][c];
        if (!p || p.owner !== side || p.type === "K") continue;
        const d = Math.abs(dr) + Math.abs(dc);
        const kingDist = distance({ r, c }, enemyKing);
        if (d <= 1) support += 3;
        else support += 1;
        if (kingDist <= 4 && ["R", "B", "G", "S", "N"].includes(p.type)) support += 2;
      }
    }
    return support;
  }

  function unsupportedAttackProbeRisk(state, move, side) {
    if (!move || !move.to || move.capture || move.promote || window.ShogiRules.inCheck(state, side)) return 0;
    const piece = move.drop ? { type: move.piece, owner: side, promoted: false } : movingPiece(state, move);
    if (!piece || piece.type === "K") return 0;
    const enemy = window.ShogiBoard.opponent(side);
    const enemyKing = findKing(state, enemy);
    const beforeDist = (!move.drop && move.from) ? distance(move.from, enemyKing) : 9;
    const advanced = advancedRank(side, move.to);
    const undo = window.ShogiBoard.makeMove(state, move);
    const defended = window.ShogiRules.attacksSquare(state, side, move.to);
    const attacked = window.ShogiRules.attacksSquare(state, enemy, move.to);
    const gives = window.ShogiRules.inCheck(state, enemy);
    const pressure = attacksKingZoneFrom(state, move.to, side, enemyKing);
    const support = localAttackSupport(state, move.to, side, enemyKing);
    const afterDist = distance(move.to, enemyKing);
    window.ShogiBoard.undoMove(state, undo);
    if (gives || pressure > 0 || support >= 4 || (defended && !attacked)) return 0;
    if (afterDist > beforeDist && advanced < 4) return 0;
    if (piece.type === "P" && advanced >= 3) return defended ? 220 : 520;
    if (piece.type === "S" || piece.type === "N" || piece.type === "L") return defended ? 160 : 340;
    if (piece.type === "G") return nearOwnKing(state, side, move.to) ? 0 : 260;
    if (piece.type === "R" || piece.type === "B") return defended ? 420 : 920;
    return 0;
  }

  function looseMinorPieceShapeRisk(state, move, side) {
    if (!move || move.drop || !move.from || move.promote || state.history.length > 64) return 0;
    const piece = movingPiece(state, move);
    if (!piece || !["B", "S"].includes(piece.type)) return 0;
    if (move.capture && piece.type !== "B") return 0;
    const enemy = window.ShogiBoard.opponent(side);
    const enemyKing = findKing(state, enemy);
    const beforeDist = distance(move.from, enemyKing);
    const advanced = advancedRank(side, move.to);
    const undo = window.ShogiBoard.makeMove(state, move);
    const defended = window.ShogiRules.attacksSquare(state, side, move.to);
    const attacked = window.ShogiRules.attacksSquare(state, enemy, move.to);
    const gives = window.ShogiRules.inCheck(state, enemy);
    const pressure = attacksKingZoneFrom(state, move.to, side, enemyKing);
    const support = localAttackSupport(state, move.to, side, enemyKing);
    const afterDist = distance(move.to, enemyKing);
    const ownKing = findKing(state, side);
    const ownKingDist = distance(move.to, ownKing);
    let bishopMobility = 0;
    if (piece.type === "B") {
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        let r = move.to.r + dr;
        let c = move.to.c + dc;
        while (r >= 0 && r < 9 && c >= 0 && c < 9) {
          const target = state.board[r][c];
          if (!target) bishopMobility += 1;
          else {
            if (target.owner !== side) bishopMobility += 1;
            break;
          }
          r += dr;
          c += dc;
        }
      }
    }
    window.ShogiBoard.undoMove(state, undo);
    if (gives || pressure > 0) return 0;
    if (piece.type === "S") {
      if (advanced >= 4 && (!defended || attacked) && afterDist >= beforeDist - 1) return 760;
      if (state.history.length < 30 && advanced >= 3 && !defended) return 520;
    }
    if (piece.type === "B") {
      if ((move.to.c === 0 || move.to.c === 8) && bishopMobility <= 7 && ownKingDist > 2 && pressure === 0) return 2600;
      if (bishopMobility <= 4 && ownKingDist > 2 && afterDist >= beforeDist - 1) return 980;
      if (support >= 4 && bishopMobility >= 6) return 0;
      if (advanced >= 3 && afterDist >= beforeDist && (!defended || attacked)) return 880;
      if (state.history.length < 34 && support <= 1 && !defended) return 620;
    }
    return 0;
  }

  function bishopMobilityAfterMove(state, move, side) {
    if (!move || !move.to) return 0;
    const piece = move.drop ? { type: move.piece, owner: side, promoted: false } : movingPiece(state, move);
    if (!piece || piece.type !== "B") return 0;
    const undo = window.ShogiBoard.makeMove(state, move);
    let mobility = 0;
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      let r = move.to.r + dr;
      let c = move.to.c + dc;
      while (r >= 0 && r < 9 && c >= 0 && c < 9) {
        const target = state.board[r][c];
        if (!target) mobility += 1;
        else {
          if (target.owner !== side) mobility += 1;
          break;
        }
        r += dr;
        c += dc;
      }
    }
    window.ShogiBoard.undoMove(state, undo);
    return mobility;
  }

  function badBishopMoveRisk(state, move, side) {
    const piece = move && move.drop ? { type: move.piece, owner: side, promoted: false } : movingPiece(state, move);
    if (!piece || piece.type !== "B" || piece.promoted) return 0;
    if (aimlessEarlyMajorCaptureRisk(state, move, side, exchangeAfterMove(state, move, side)) > 0) return 1600;
    if (forbiddenEarlyEdgeBishop(state, move, side) || leavesBadEdgeBishopBoard(state, move, side)) return 1800;
    const mobility = bishopMobilityAfterMove(state, move, side);
    if (state.history.length < 40 && mobility <= 4 && !move.capture) return 700;
    return 0;
  }

  function trappedBishopRisk(state, move, side) {
    const piece = move && move.drop ? { type: move.piece, owner: side, promoted: false } : movingPiece(state, move);
    if (!piece || piece.type !== "B" || piece.promoted) return 0;
    const mobility = bishopMobilityAfterMove(state, move, side);
    const undo = window.ShogiBoard.makeMove(state, move);
    const attacked = window.ShogiRules.attacksSquare(state, window.ShogiBoard.opponent(side), move.to);
    const defended = window.ShogiRules.attacksSquare(state, side, move.to);
    window.ShogiBoard.undoMove(state, undo);
    if (mobility <= 3 && (attacked || !defended)) return 1400;
    return 0;
  }

  function unsupportedSilverAdvanceRisk(state, move, side) {
    if (!move || move.drop || !move.from) return 0;
    const piece = movingPiece(state, move);
    if (!piece || piece.type !== "S") return 0;
    const advanced = advancedRank(side, move.to);
    if (advanced < 3 || move.capture) return 0;
    const undo = window.ShogiBoard.makeMove(state, move);
    const attacked = window.ShogiRules.attacksSquare(state, window.ShogiBoard.opponent(side), move.to);
    const defended = window.ShogiRules.attacksSquare(state, side, move.to);
    window.ShogiBoard.undoMove(state, undo);
    if (!defended || attacked) return state.history.length < 38 ? 900 : 520;
    return 0;
  }

  function silverLeavesCastleRisk(state, move, side) {
    if (!move || move.drop || !move.from || state.history.length >= 42) return 0;
    const piece = movingPiece(state, move);
    if (!piece || piece.type !== "S") return 0;
    const king = findKing(state, side);
    if (!king) return 0;
    const fromDist = distance(move.from, king);
    const toDist = distance(move.to, king);
    if (fromDist <= 2 && toDist >= 4 && !move.capture) return 760;
    return 0;
  }

  function majorOverextensionRisk(state, move, side, type) {
    if (!move || move.drop || !move.from || state.history.length >= 46) return 0;
    const piece = movingPiece(state, move);
    if (!piece || piece.type !== type) return 0;
    const advanced = advancedRank(side, move.to);
    if (advanced < 5) return 0;
    const exchange = exchangeAfterMove(state, move, side);
    if (exchange.check || exchange.mateThreat || exchange.see > 120) return 0;
    const undo = window.ShogiBoard.makeMove(state, move);
    const attacked = window.ShogiRules.attacksSquare(state, window.ShogiBoard.opponent(side), move.to);
    const defended = window.ShogiRules.attacksSquare(state, side, move.to);
    window.ShogiBoard.undoMove(state, undo);
    if (attacked || !defended || exchange.see < -40) return type === "R" ? 1100 : 900;
    return 0;
  }

  function badSacrificeCheckRisk(state, move, side, exchange) {
    const isCheck = (exchange && exchange.check) || givesCheck(state, move, side);
    if (!exchange || !isCheck || exchange.mateThreat || state.history.length >= 74) return 0;
    const piece = movingPiece(state, move);
    if (!piece || piece.type === "P" || piece.type === "K") return 0;
    if (exchange.see < -60 || exchange.hanging) return 1300 + Math.abs(Math.min(0, exchange.see));
    return 0;
  }

  function attackPieceLostAfterCheckRisk(state, move, side, exchange) {
    const isCheck = (exchange && exchange.check) || givesCheck(state, move, side);
    if (!exchange || !isCheck || exchange.mateThreat || state.history.length >= 78 || move.drop) return 0;
    const piece = movingPiece(state, move);
    if (!piece || piece.type === "P" || piece.type === "K") return 0;
    const undo = window.ShogiBoard.makeMove(state, move);
    const enemy = state.turn;
    const replies = window.ShogiRules.legalMoves(state, enemy).slice(0, 18);
    let canTakeCheckingPiece = false;
    for (const reply of replies) {
      if (!reply.drop && reply.to && reply.to.r === move.to.r && reply.to.c === move.to.c) {
        canTakeCheckingPiece = true;
        break;
      }
    }
    const stillAttacked = window.ShogiRules.attacksSquare(state, enemy, move.to);
    const defended = window.ShogiRules.attacksSquare(state, side, move.to);
    window.ShogiBoard.undoMove(state, undo);
    if (canTakeCheckingPiece || (stillAttacked && !defended)) return piece.type === "R" ? 1500 : 1100;
    return 0;
  }

  function noFollowUpCheckRisk(state, move, side, exchange) {
    const isCheck = (exchange && exchange.check) || givesCheck(state, move, side);
    if (!exchange || !isCheck || exchange.mateThreat || state.history.length >= 78) return 0;
    const piece = movingPiece(state, move);
    if (!piece || piece.type === "P" || piece.type === "K") return 0;
    const enemy = window.ShogiBoard.opponent(side);
    const enemyKing = findKing(state, enemy);
    const undo = window.ShogiBoard.makeMove(state, move);
    const pressure = attacksKingZoneFrom(state, move.to, side, enemyKing);
    const support = localAttackSupport(state, move.to, side, enemyKing);
    const canPromote = !!move.promote;
    window.ShogiBoard.undoMove(state, undo);
    if (exchange.see > 80 || canPromote || pressure >= 2 || support >= 4) return 0;
    return 620;
  }

  function weakKingShapeRisk(state, move, side) {
    if (!move || state.history.length >= 36 || window.ShogiRules.inCheck(state, side)) return 0;
    const king = findKing(state, side);
    if (!king) return 0;
    const home = side === "b" ? 8 : 0;
    const kingStillCentral = Math.abs(king.c - 4) <= 1 && Math.abs(king.r - home) <= 1;
    if (!kingStillCentral) return 0;
    const undo = window.ShogiBoard.makeMove(state, move);
    let nearGuards = 0;
    for (let r = Math.max(0, king.r - 2); r <= Math.min(8, king.r + 2); r += 1) {
      for (let c = Math.max(0, king.c - 2); c <= Math.min(8, king.c + 2); c += 1) {
        const p = state.board[r][c];
        if (p && p.owner === side && (p.type === "G" || p.type === "S")) nearGuards += 1;
      }
    }
    window.ShogiBoard.undoMove(state, undo);
    return nearGuards < 2 ? 420 : 0;
  }

  function ignoresCastleDevelopmentRisk(state, move, side) {
    if (!move || state.history.length >= 30 || window.ShogiRules.inCheck(state, side)) return 0;
    const piece = move.drop ? { type: move.piece, owner: side } : movingPiece(state, move);
    if (!piece || piece.type === "K") return 0;
    const king = findKing(state, side);
    if (!king) return 0;
    const home = side === "b" ? 8 : 0;
    const kingMoved = Math.abs(king.c - 4) + Math.abs(king.r - home);
    const toKing = distance(move.to, king);
    if ((piece.type === "G" || piece.type === "S") && toKing <= 2) return 0;
    if ((piece.type === "R" || piece.type === "B") && kingMoved === 0 && advancedRank(side, move.to) >= 2 && !move.capture) return 340;
    if (["R", "B", "S"].includes(piece.type) && advancedRank(side, move.to) >= 3 && weakKingShapeRisk(state, move, side)) return 360;
    return 0;
  }

  function fastShapeRisk(state, move, side) {
    let risk = 0;
    if (isEarlyBishopHeadPawnPush(state, move, side)) risk += 9000;
    if (isRecentReverse(state, move)) risk += 520;
    risk += repetitionShuffleRisk(state, move);
    if (move.drop && state.history.length < 24) risk += 260;
    if (!move.drop && move.from) {
      const piece = state.board[move.from.r][move.from.c];
      if (piece) {
        const advanced = advancedRank(side, move.to);
        if (piece.type === "P" && !move.capture && advanced >= 4) risk += 360;
        if ((piece.type === "R" || piece.type === "B") && !move.capture && advanced >= 4 && state.history.length < 34) risk += 1300;
        if (move.promote && (piece.type === "R" || piece.type === "B") && !move.capture && state.history.length < 30) risk += 900;
        risk += looseMinorPieceShapeRisk(state, move, side);
      }
    }
    return risk;
  }

  function attackMomentumBonus(state, move, side) {
    if (!move) return 0;
    const ply = state.history.length;
    const enemy = window.ShogiBoard.opponent(side);
    const enemyKing = findKing(state, enemy);
    const ownInCheck = window.ShogiRules.inCheck(state, side);
    const piece = move.drop ? { type: move.piece, owner: side, promoted: false } : movingPiece(state, move);
    if (!piece || piece.type === "K") return 0;

    const beforeDist = (!move.drop && move.from) ? distance(move.from, enemyKing) : 9;
    const undo = window.ShogiBoard.makeMove(state, move);
    const afterPiece = state.board[move.to.r][move.to.c] || piece;
    const afterDist = distance(move.to, enemyKing);
    const zoneAttacks = attacksKingZoneFrom(state, move.to, side, enemyKing);
    const support = localAttackSupport(state, move.to, side, enemyKing);
    const defended = window.ShogiRules.attacksSquare(state, side, move.to);
    const gives = window.ShogiRules.inCheck(state, enemy);
    window.ShogiBoard.undoMove(state, undo);

    const phase = phaseOf(state);
    const scale = phase === "opening" ? 0.45 : phase === "middle" ? 1 : 1.25;
    let score = 0;
    if (!move.drop && beforeDist < 9 && afterDist < beforeDist) score += (beforeDist - afterDist) * 70 * scale;
    if (afterDist <= 3) score += 140 * scale;
    else if (afterDist <= 4) score += 65 * scale;
    score += zoneAttacks * 48 * scale;
    if (support >= 4) score += 90 * scale;
    else if (support >= 2) score += 42 * scale;
    if (defended && (afterDist <= 4 || zoneAttacks > 0)) score += 70 * scale;

    const advanced = advancedRank(side, move.to);
    if (["S", "N", "P", "L"].includes(afterPiece.type) && advanced >= 4) score += 45 * scale;
    if ((afterPiece.type === "R" || afterPiece.type === "B") && afterPiece.promoted && afterDist <= 4) score += 170;
    if (move.drop && afterDist <= 3) score += ["G", "S"].includes(move.piece) ? 160 : 95;
    if (gives) score += phase === "end" ? 180 : 70;

    const quiet = !move.capture && !move.promote && !gives && !ownInCheck;
    if (quiet && ply >= 26) {
      if ((afterPiece.type === "R" || afterPiece.type === "B") && afterDist >= beforeDist && zoneAttacks === 0) score -= 520;
      if ((afterPiece.type === "G" || afterPiece.type === "S") && !nearOwnKing(state, side, move.to) && afterDist >= beforeDist + 1) score -= 170;
      if (isRecentReverse(state, move)) score -= afterPiece.type === "R" || afterPiece.type === "B" ? 520 : 260;
    }

    return Math.round(score);
  }

  function centralBreakthroughRisk(state, move, side) {
    if (!move || move.drop || !move.to || state.history.length < 18 || state.history.length > 70) return 0;
    const piece = movingPiece(state, move);
    if (!piece || piece.type === "K") return 0;
    const centralFile = move.to.c === 4 || (move.from && move.from.c === 4);
    if (!centralFile) return 0;
    const advanced = advancedRank(side, move.to);
    if (advanced < 3 && !move.capture && !move.promote) return 0;
    const enemy = window.ShogiBoard.opponent(side);
    const enemyKing = findKing(state, enemy);
    const undo = window.ShogiBoard.makeMove(state, move);
    const defended = window.ShogiRules.attacksSquare(state, side, move.to);
    const attacked = window.ShogiRules.attacksSquare(state, enemy, move.to);
    const pressure = attacksKingZoneFrom(state, move.to, side, enemyKing);
    const support = localAttackSupport(state, move.to, side, enemyKing);
    const gives = window.ShogiRules.inCheck(state, enemy);
    let sameFilePower = 0;
    for (let r = 0; r < 9; r++) {
      const p = state.board[r][4];
      if (!p || p.owner !== side) continue;
      if (p.type === "R") sameFilePower += 5;
      else if (p.type === "B") sameFilePower += 3;
      else if (p.type === "G" || p.type === "S") sameFilePower += 2;
      else if (p.type === "P") sameFilePower += 1;
    }
    window.ShogiBoard.undoMove(state, undo);
    if (gives || pressure >= 2 || support >= 5 || sameFilePower >= 6) return 0;
    let risk = 0;
    if (piece.type === "P") risk += move.capture ? 180 : 320;
    else if (piece.type === "S" || piece.type === "G") risk += 240;
    else if (piece.type === "R" || piece.type === "B") risk += state.history.length < 42 ? 1600 : 760;
    if (attacked && !defended) risk += 420;
    else if (attacked > defended) risk += 180;
    if (sameFilePower <= 2) risk += piece.type === "R" || piece.type === "B" ? 720 : 260;
    if (support <= 1) risk += piece.type === "R" || piece.type === "B" ? 520 : 220;
    return risk;
  }

  function majorSacrificeRisk(state, move, side, exchange) {
    if (!move || move.drop || !move.from || !move.capture) return 0;
    const piece = movingPiece(state, move);
    if (!piece || (piece.type !== "R" && piece.type !== "B")) return 0;
    if (exchange.mateThreat || exchange.check) return 0;
    const enemy = window.ShogiBoard.opponent(side);
    const enemyKing = findKing(state, enemy);
    const undo = window.ShogiBoard.makeMove(state, move);
    const afterPiece = state.board[move.to.r][move.to.c];
    const pressure = attacksKingZoneFrom(state, move.to, side, enemyKing);
    const support = localAttackSupport(state, move.to, side, enemyKing);
    const defended = window.ShogiRules.attacksSquare(state, side, move.to);
    const attacked = window.ShogiRules.attacksSquare(state, enemy, move.to);
    const nearKing = distance(move.to, enemyKing) <= 3;
    window.ShogiBoard.undoMove(state, undo);
    const value = basePieceValue(piece);
    const gain = exchange.captureGain || 0;
    const loss = Math.max(exchange.immediateLoss || 0, value - gain);
    if (exchange.see >= -80 && (pressure || support >= 4 || nearKing)) return 0;
    let risk = Math.max(0, loss - gain * 0.35);
    if (!nearKing) risk += 420;
    if (!pressure) risk += 360;
    if (support < 3) risk += 260;
    if (attacked && !defended) risk += 260;
    if (afterPiece && afterPiece.promoted && nearKing) risk -= 240;
    return Math.max(0, Math.round(risk));
  }

  function aimlessEarlyMajorCaptureRisk(state, move, side, exchange) {
    if (!move || move.drop || !move.from || !move.capture || state.history.length >= 34) return 0;
    const piece = movingPiece(state, move);
    const target = state.board[move.to.r][move.to.c];
    if (!piece || !target || target.owner === side) return 0;
    if ((piece.type !== "R" && piece.type !== "B") || (target.type !== "R" && target.type !== "B")) return 0;
    if (exchange.mateThreat || exchange.check || exchange.see >= 260) return 0;
    const enemy = window.ShogiBoard.opponent(side);
    const enemyKing = findKing(state, enemy);
    const undo = window.ShogiBoard.makeMove(state, move);
    const pressure = attacksKingZoneFrom(state, move.to, side, enemyKing);
    const nearKing = distance(move.to, enemyKing) <= 3;
    const support = localAttackSupport(state, move.to, side, enemyKing);
    const attacked = window.ShogiRules.attacksSquare(state, enemy, move.to);
    const defended = window.ShogiRules.attacksSquare(state, side, move.to);
    window.ShogiBoard.undoMove(state, undo);
    if (nearKing || pressure >= 3 || support >= 5 || defended > attacked) return 0;
    return 1400 + Math.max(0, 34 - state.history.length) * 35;
  }

  function quietMajorPromotionPenalty(state, move, side) {
    if (!move || move.drop || !move.promote || move.capture || state.history.length >= 54) return 0;
    const piece = movingPiece(state, move);
    if (!piece || (piece.type !== "R" && piece.type !== "B")) return 0;
    const enemy = window.ShogiBoard.opponent(side);
    const enemyKing = findKing(state, enemy);
    const undo = window.ShogiBoard.makeMove(state, move);
    const afterDist = distance(move.to, enemyKing);
    const pressure = attacksKingZoneFrom(state, move.to, side, enemyKing);
    const gives = window.ShogiRules.inCheck(state, enemy);
    window.ShogiBoard.undoMove(state, undo);
    if (gives || afterDist <= 3 || pressure > 0) return 0;
    return piece.type === "R" ? 780 : 940;
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

  function kingZoneWeakness(state, side) {
    const king = findKing(state, side);
    if (!king) return 12;
    const enemy = window.ShogiBoard.opponent(side);
    let weakness = 0;
    for (let r = Math.max(0, king.r - 2); r <= Math.min(8, king.r + 2); r++) {
      for (let c = Math.max(0, king.c - 2); c <= Math.min(8, king.c + 2); c++) {
        const dist = Math.abs(r - king.r) + Math.abs(c - king.c);
        if (dist > 2) continue;
        const piece = state.board[r][c];
        if (!piece) weakness += dist <= 1 ? 2 : 1;
        else if (piece.owner === side && (piece.type === "G" || piece.type === "S" || piece.type === "P")) weakness -= dist <= 1 ? 2 : 1;
        else if (piece.owner === enemy) weakness += piece.type === "R" || piece.type === "B" ? 5 : 3;
        if (window.ShogiRules.attacksSquare(state, enemy, { r, c })) weakness += dist <= 1 ? 2 : 1;
      }
    }
    return Math.max(0, weakness);
  }

  function dropThreatNearKing(state, move, defender) {
    if (!move || !move.drop) return 0;
    const king = findKing(state, defender);
    if (!king) return 0;
    const dist = distance(move.to, king);
    if (dist > 3) return 0;
    const attacker = window.ShogiBoard.opponent(defender);
    const undo = window.ShogiBoard.makeMove(state, move);
    const gives = window.ShogiRules.inCheck(state, defender);
    const defended = window.ShogiRules.attacksSquare(state, attacker, move.to);
    window.ShogiBoard.undoMove(state, undo);
    const base = pieceValueByType(move.piece, false);
    let threat = Math.max(0, 4 - dist) * 85 + base * 0.22;
    if (gives) threat += 520;
    if (defended) threat += 130;
    if (move.piece === "G" || move.piece === "S") threat += 150;
    if (move.piece === "R" || move.piece === "B") threat += 220;
    return threat;
  }

  function promotionEntryThreat(state, move, defender) {
    if (!move || move.drop || !move.from) return 0;
    const attacker = state.board[move.from.r][move.from.c];
    if (!attacker || attacker.owner === defender || attacker.type === "K") return 0;
    const advanced = advancedRank(attacker.owner, move.to);
    let threat = 0;
    if (move.promote) {
      threat += attacker.type === "R" || attacker.type === "B" ? 760 : 260;
      if (distance(move.to, findKing(state, defender)) <= 4) threat += 220;
    } else if ((attacker.type === "R" || attacker.type === "B") && advanced >= 6) {
      threat += 420;
    } else if (advanced >= 5 && (attacker.type === "S" || attacker.type === "N" || attacker.type === "P")) {
      threat += 120;
    }
    if (move.capture) {
      const target = state.board[move.to.r][move.to.c];
      if (target && target.owner === defender) threat += basePieceValue(target) * 0.35;
    }
    return threat;
  }

  function middleTransitionReplyRisk(next, side, limit) {
    const ply = next.history.length;
    if (ply < 24 || ply > 78) return 0;
    const replies = orderedMoves(next, window.ShogiRules.legalMoves(next, next.turn), null, 1).slice(0, Math.min(limit, 18));
    const weakness = kingZoneWeakness(next, side);
    let worst = 0;
    for (const reply of replies) {
      let threat = 0;
      threat += dropThreatNearKing(next, reply, side);
      threat += promotionEntryThreat(next, reply, side);
      if (reply.capture && !reply.drop) {
        const target = next.board[reply.to.r][reply.to.c];
        if (target && target.owner === side) threat += basePieceValue(target) * 0.28;
      }
      if (threat > 0) {
        const scaled = threat * (1 + Math.min(10, weakness) * 0.08);
        worst = Math.max(worst, scaled);
      }
    }
    return Math.round(worst);
  }

  function middleTransitionReplyRiskFast(next, side, limit) {
    const ply = next.history.length;
    if (ply < 24 || ply > 78) return 0;
    const replies = window.ShogiRules.legalMoves(next, next.turn).slice(0, Math.min(limit, 24));
    const weakness = kingZoneWeakness(next, side);
    let worst = 0;
    for (const reply of replies) {
      let threat = dropThreatNearKing(next, reply, side);
      threat += promotionEntryThreat(next, reply, side);
      if (reply.capture && !reply.drop) {
        const target = next.board[reply.to.r][reply.to.c];
        if (target && target.owner === side) threat += basePieceValue(target) * 0.22;
      }
      if (threat > 0) worst = Math.max(worst, threat * (1 + Math.min(10, weakness) * 0.06));
    }
    return Math.round(worst);
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
    risk += middleTransitionReplyRisk(state, side, cfg.reply || 24) * (0.75 + level * 0.06);

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
      if (!exchange.check && !exchange.mateThreat) risk += 520 + level * 70;
      if (piece && (piece.type === "R" || piece.type === "B")) risk += 500 + level * 55;
    }
    risk += majorSacrificeRisk(state, move, side, exchange) * (0.9 + level * 0.08);
    risk += aimlessEarlyMajorCaptureRisk(state, move, side, exchange) * (0.9 + level * 0.06);
    risk += centralBreakthroughRisk(state, move, side) * (0.75 + level * 0.07);
    if (exchange.see < -80 && !exchange.check && !exchange.mateThreat) {
      risk += 420 + Math.abs(exchange.see) * (1.15 + level * 0.15);
      if (piece && (piece.type === "R" || piece.type === "B")) risk += Math.abs(exchange.see) * 0.7;
    }
    if (isOpeningPawnSacrifice(state, move, side, exchange)) {
      risk += 680 + level * 75;
    }
    if (isEarlyBishopHeadPawnPush(state, move, side)) {
      risk += 9000 + level * 420;
    }
    risk += loosePawnPushRisk(state, move, side) * (1.25 + level * 0.1);
    risk += unsupportedAttackProbeRisk(state, move, side) * (0.85 + level * 0.08);
    risk += badBishopMoveRisk(state, move, side) * (0.85 + level * 0.08);
    risk += trappedBishopRisk(state, move, side) * (0.9 + level * 0.08);
    risk += unsupportedSilverAdvanceRisk(state, move, side) * (0.85 + level * 0.08);
    risk += silverLeavesCastleRisk(state, move, side) * (0.75 + level * 0.06);
    risk += majorOverextensionRisk(state, move, side, "R") * (0.85 + level * 0.08);
    risk += majorOverextensionRisk(state, move, side, "B") * (0.85 + level * 0.08);
    risk += weakKingShapeRisk(state, move, side) * (0.45 + level * 0.04);
    risk += ignoresCastleDevelopmentRisk(state, move, side) * (0.55 + level * 0.05);
    risk += badSacrificeCheckRisk(state, move, side, exchange) * (0.95 + level * 0.08);
    risk += attackPieceLostAfterCheckRisk(state, move, side, exchange) * (0.9 + level * 0.08);
    risk += noFollowUpCheckRisk(state, move, side, exchange) * (0.75 + level * 0.06);
    if (isCheckMove && !exchange.mateThreat && exchange.see < -40) {
      risk += 420 + Math.abs(exchange.see) * (1.1 + level * 0.08);
    }
    risk += unsupportedDropRisk(state, move, side) * (0.75 + level * 0.08);
    risk += earlyMajorDropPenalty(state, move, side) * (0.9 + level * 0.08);
    risk += kingWanderPenalty(state, move, side) * (0.8 + level * 0.05);
    risk += earlyMajorPieceSortiePenalty(state, move, side) * (0.8 + level * 0.06);
    risk += quietMajorPromotionPenalty(state, move, side) * (0.9 + level * 0.08);
    risk += repetitionShuffleRisk(state, move) * (0.7 + level * 0.06);

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
      badMoveReasons: badMoveReasons(state, item.move, state.turn, level, cfg, exchange),
      reason: ""
    });
    const annotated = Object.assign({}, item, { debug, selected: !!selected });
    annotated.debug.reason = reasonText(annotated, !!selected, !!forceBest, phase || phaseOf(state));
    return annotated;
  }

  function badMoveReasons(state, move, side, level, cfg, exchange) {
    const reasons = [];
    const add = (condition, name) => {
      if (condition) reasons.push(name);
    };
    add(isOpeningPawnSacrifice(state, move, side, exchange), "openingPawnSacrifice");
    add(isEarlyBishopHeadPawnPush(state, move, side), "earlyBishopHeadPawnPush");
    add(loosePawnPushRisk(state, move, side) > 0, "loosePawnPush");
    add(unsupportedDropRisk(state, move, side) > 0, "unsupportedDrop");
    add(earlyMajorDropPenalty(state, move, side) > 0, "earlyMajorDrop");
    add(kingWanderPenalty(state, move, side) > 0, "kingWander");
    add(earlyMajorPieceSortiePenalty(state, move, side) > 0, "earlyMajorSortie");
    add(badBishopMoveRisk(state, move, side) > 0, "badBishopMove");
    add(trappedBishopRisk(state, move, side) > 0, "trappedBishop");
    add(aimlessEarlyMajorCaptureRisk(state, move, side, exchange) > 0 && movingPiece(state, move) && movingPiece(state, move).type === "B", "earlyMeaninglessBishopExchange");
    add(unsupportedSilverAdvanceRisk(state, move, side) > 0, "unsupportedSilverAdvance");
    add(silverLeavesCastleRisk(state, move, side) > 0, "silverLeavesCastle");
    add(majorOverextensionRisk(state, move, side, "R") > 0, "rookOverextension");
    add(majorOverextensionRisk(state, move, side, "B") > 0, "bishopOverextension");
    add(weakKingShapeRisk(state, move, side) > 0, "weakKingShape");
    add(ignoresCastleDevelopmentRisk(state, move, side) > 0, "ignoresCastleDevelopment");
    add(badSacrificeCheckRisk(state, move, side, exchange) > 0, "badSacrificeCheck");
    add(attackPieceLostAfterCheckRisk(state, move, side, exchange) > 0, "attackPieceLostAfterCheck");
    add(noFollowUpCheckRisk(state, move, side, exchange) > 0, "noFollowUpCheck");
    add(unsupportedAttackProbeRisk(state, move, side) > 0, "unsupportedAttackProbe");
    add(looseMinorPieceShapeRisk(state, move, side) > 0, "looseMinorShape");
    add(centralBreakthroughRisk(state, move, side) > 0, "centralBreakthroughRisk");
    add(majorSacrificeRisk(state, move, side, exchange) > 0, "majorSacrificeRisk");
    add(aimlessEarlyMajorCaptureRisk(state, move, side, exchange) > 0, "aimlessEarlyMajorCapture");
    add(quietMajorPromotionPenalty(state, move, side) > 0, "quietMajorPromotion");
    add(repetitionShuffleRisk(state, move) > 0, "repetitionShuffle");
    add(repetitionShuffleRisk(state, move) > 0, "repeatedPieceMove");
    add(isRecentReverse(state, move), "pointlessRetreat");
    add(exchange && exchange.hanging, "hangingAfterMove");
    add(exchange && exchange.see < -80 && !exchange.check && !exchange.mateThreat, "badStaticExchange");
    add(allowsOpponentMateInOne(state, move), "allowsOpponentMateInOne");
    return reasons;
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

  function safeFastSelectionItems(state, items, level, cfg) {
    const annotated = (items || []).map(item => {
      const activeLevel = level || 10;
      const activeCfg = cfg || config(activeLevel, { mobile: true });
      const exchange = exchangeAfterMove(state, item.move, state.turn);
      return Object.assign({}, item, {
        shapeRisk: looseMinorPieceShapeRisk(state, item.move, state.turn) +
          (leavesBadEdgeBishopBoard(state, item.move, state.turn) ? 9000 : 0),
        fastRisk: tacticalRisk(state, item.move, state.turn, activeLevel, activeCfg),
        badMoveReasons: badMoveReasons(state, item.move, state.turn, activeLevel, activeCfg, exchange)
      });
    });
    const severeRisk = reasons => {
      if (!Array.isArray(reasons)) return 0;
      let risk = 0;
      if (reasons.includes("allowsOpponentMateInOne")) risk += MATE / 3;
      if (reasons.includes("majorSacrificeRisk")) risk += 60000;
      if (reasons.includes("badStaticExchange")) risk += 52000;
      if (reasons.includes("hangingAfterMove")) risk += 42000;
      return risk;
    };
    const safe = annotated.filter(item => item.shapeRisk < 700 && severeRisk(item.badMoveReasons) <= 0);
    return (safe.length ? safe : annotated)
      .sort((a, b) => (b.score - b.shapeRisk * 80 - b.fastRisk - severeRisk(b.badMoveReasons)) -
        (a.score - a.shapeRisk * 80 - a.fastRisk - severeRisk(a.badMoveReasons)));
  }

  function lateSafeFastItems(state, items) {
    if (state.history.length < 70 || !items.length || !allowsOpponentMateInOne(state, items[0].move)) return items;
    const safe = items.slice(0, 8).find(item => !allowsOpponentMateInOne(state, item.move));
    if (!safe) return items;
    return [safe].concat(items.filter(item => moveKey(item.move) !== moveKey(safe.move)));
  }

  function chooseMoveWithRandomness(state, level, options = {}) {
    const lv = normalizedLevel(level);
    const cfg = config(lv, options);
    const base = searchRoot(state, lv, options);
    const personality = options.personality || "standard";
    const randomness = options.randomness || "normal";
    const phase = phaseOf(state);
    const scale = (RANDOMNESS_SCALE[randomness] ?? 1) * (PERSONALITY_SCALE[personality] ?? 1);

    if (cfg.mobile && phase === "opening" && base.candidates.some(item => item.book)) {
      const candidates = base.candidates.slice(0, Math.max(3, base.candidates.length)).map((item, index) => Object.assign({}, item, {
        selected: index === 0,
        weight: index === 0 ? 1 : 0,
        debug: item.debug || {
          aiScore: Math.max(-9999, Math.min(9999, Math.round(item.score || 0))),
          rawScore: Math.max(-9999, Math.min(9999, Math.round(item.score || 0))),
          risk: 0,
          reason: "序盤方針を優先"
        }
      }));
      return Object.assign({}, base, {
        bestMove: candidates[0].move,
        candidates,
        selection: { move: candidates[0].move, reason: "mobile-opening-book", forceBest: true, windowSize: 0, temperature: 0 }
      });
    }

    if (cfg.mobile && state.history.length < 34 && base.depth <= 1 && base.candidates.length) {
      const fastItems = lateSafeFastItems(state, safeFastSelectionItems(state, base.candidates.slice(0, Math.max(3, base.candidates.length)), lv, cfg));
      const candidates = fastItems.map((item, index) => Object.assign({}, item, {
        selected: index === 0,
        weight: index === 0 ? 1 : 0,
        debug: item.debug || {
          aiScore: Math.max(-9999, Math.min(9999, Math.round(item.score || 0))),
          rawScore: Math.max(-9999, Math.min(9999, Math.round(item.score || 0))),
          risk: 0,
          reason: "序盤方針を優先"
        }
      }));
      return Object.assign({}, base, {
        bestMove: candidates[0].move,
        candidates,
        selection: { move: candidates[0].move, reason: "mobile-opening-fast", forceBest: true, windowSize: 0, temperature: 0 }
      });
    }

    if (cfg.mobile && (state.history.length > 30 || base.nodes > 70) && base.depth <= 1) {
      const fastItems = lateSafeFastItems(state, safeFastSelectionItems(state, base.candidates.slice(0, Math.max(3, base.candidates.length)), lv, cfg));
      const candidates = fastItems.map((item, index) => Object.assign({}, item, {
        selected: index === 0,
        weight: index === 0 ? 1 : 0,
        debug: item.debug || {
          aiScore: Math.max(-9999, Math.min(9999, Math.round(item.score || 0))),
          rawScore: Math.max(-9999, Math.min(9999, Math.round(item.score || 0))),
          risk: 0,
          reason: "軽量評価を優先"
        }
      }));
      return Object.assign({}, base, {
        bestMove: candidates[0].move,
        candidates,
        selection: { move: candidates[0].move, reason: "mobile-fast-eval", forceBest: true, windowSize: 0, temperature: 0 }
      });
    }

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

    if (state.history.length >= 70 && allowsOpponentMateInOne(state, selected.move)) {
      const safeLate = ranked.slice(0, 8).find(item => !allowsOpponentMateInOne(state, item.move));
      if (safeLate) selected = Object.assign({}, safeLate, { weight: selected.weight || 1 });
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
    const side = state.turn;
    let score = 0;
    const momentum = attackMomentumBonus(state, move, side);
    const shuffleRisk = repetitionShuffleRisk(state, move);
    if (ply > 34) return momentum - shuffleRisk * 0.9;

    if (!move.drop && move.from) {
      const p = state.board[move.from.r][move.from.c];
      if (!p) return 0;
      const advancedBefore = side === "b" ? 8 - move.from.r : move.from.r;
      const advancedAfter = side === "b" ? 8 - move.to.r : move.to.r;
      const king = findKing(state, side);
      const home = side === "b" ? 8 : 0;
      const kingMoved = king ? Math.abs(king.c - 4) + Math.abs(king.r - home) : 0;
      const fromKingDist = king ? distance(move.from, king) : 9;
      const toKingDist = king ? distance(move.to, king) : 9;

      if (p.type === "P") {
        if (side === "b" && move.from.r === 6 && move.to.r === 5 && move.from.c === 2) score += 520;
        if (side === "w" && move.from.r === 2 && move.to.r === 3 && move.from.c === 6) score += 520;
        if (side === "b" && move.from.r === 6 && move.to.r === 5 && move.from.c === 7) score += 260;
        if (side === "w" && move.from.r === 2 && move.to.r === 3 && move.from.c === 1) score += 260;
        if (isEarlyBishopHeadPawnPush(state, move, side)) score -= 12000;
        score -= loosePawnPushRisk(state, move, side) * 2.4;
      }

      if (p.type === "S" && advancedAfter > advancedBefore) score += 190;
      score -= looseMinorPieceShapeRisk(state, move, side) * 4.5;
      if ((p.type === "G" || p.type === "S") && toKingDist < fromKingDist && ply < 30) score += p.type === "G" ? 170 : 140;
      if ((p.type === "G" || p.type === "S") && toKingDist > fromKingDist + 1 && kingMoved === 0 && ply < 30) score -= p.type === "G" ? 260 : 220;
      if (p.type === "G" && advancedAfter <= 2 && (move.to.c <= 3 || move.to.c >= 5)) score += 120;
      if (p.type === "G" && ply < 12 && advancedAfter > advancedBefore && move.from.c === move.to.c && move.to.c >= 3 && move.to.c <= 5) score -= 1600;
      if (p.type === "K") {
        if (ply <= 24 && Math.abs(move.to.c - 4) > Math.abs(move.from.c - 4)) score += 280;
        if (ply <= 28 && (move.to.c <= 2 || move.to.c >= 6)) score += 240;
        if (ply < 44 && advancedAfter >= 2) score -= 9000;
        if (ply > 28 && !window.ShogiRules.inCheck(state, side)) score -= 260;
      }

      if ((p.type === "R" || p.type === "B") && advancedAfter >= 5 && ply < 42) score -= move.capture ? 360 : 1100;
      if ((p.type === "R" || p.type === "B") && advancedAfter >= 6 && ply < 52) score -= move.capture ? 420 : 1400;
      if ((p.type === "R" || p.type === "B") && kingMoved === 0 && ply < 30 && !move.capture) score -= 360;
      if ((p.type === "R" || p.type === "B") && repetitionShuffleRisk(state, move) && ply < 34) score -= 520;
      if (p.type === "R" || p.type === "B") score -= earlyMajorPieceSortiePenalty(state, move, side) * (move.capture ? 0.55 : 1);
      if (p.type === "R" || p.type === "B") score += majorEscapeBonus(state, move, side);
      if (p.type !== "P" && p.type !== "K" && advancedAfter >= 6 && ply < 24 && !move.capture) score -= 420;
    }

    if (move.capture) score += ply < 18 ? -150 : 0;
    if (move.drop && ply < 24) score -= 240;
    if (move.drop && unsupportedDropRisk(state, move, side)) score -= unsupportedDropRisk(state, move, side) * 0.9;
    if (move.drop) score -= earlyMajorDropPenalty(state, move, side) * 1.2;
    score -= centralBreakthroughRisk(state, move, side) * 0.9;
    if (givesCheck(state, move, side) && ply < 32 && !move.capture) score -= 360;
    return score + momentum - shuffleRisk * 0.75;
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
      score -= majorSacrificeRisk(state, move, state.turn, exchange) * 120;
      score -= aimlessEarlyMajorCaptureRisk(state, move, state.turn, exchange) * 140;
    }
    if (move.promote) score += Math.max(12000, 110000 - quietMajorPromotionPenalty(state, move, state.turn) * 120);
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

  function cheapOrderingScore(state, move, hashMove) {
    const key = moveKey(move);
    if (hashMove && key === hashMove) return 1000000;
    let score = 0;
    if (move.capture) {
      const target = !move.drop ? state.board[move.to.r][move.to.c] : null;
      score += 50000 + basePieceValue(target);
    }
    if (isEarlyBishopHeadPawnPush(state, move, state.turn)) score -= 1000000;
    if (isRecentReverse(state, move)) score -= 260000;
    if (move.promote) score += Math.max(5000, 24000 - quietMajorPromotionPenalty(state, move, state.turn) * 45);
    score -= centralBreakthroughRisk(state, move, state.turn) * 420;
    if (move.drop) {
      if (move.piece === "G" || move.piece === "S") score += 9000;
      else if (move.piece === "P") score += 1500;
      if (move.piece === "B" || move.piece === "R") score -= earlyMajorDropPenalty(state, move, state.turn) * 12;
    } else {
      const piece = state.board[move.from.r][move.from.c];
      if (piece) {
        const advanced = advancedRank(piece.owner, move.to);
        if (piece.type === "R" || piece.type === "B") score += move.capture ? 12000 : -4000;
        if (piece.type === "S" || piece.type === "N") score += advanced * 900;
        if (piece.type === "K") score -= 6000;
        if (piece.type === "K" && state.history.length < 44 && advanced >= 2) score -= 1000000;
      }
    }
    score += attackMomentumBonus(state, move, state.turn) * 140;
    score += (4 - Math.abs(move.to.c - 4)) * 200;
    return score;
  }

  function isRecentReverse(state, move) {
    if (!move || move.drop || move.capture || !move.from || state.history.length > 96) return false;
    const piece = state.board[move.from.r][move.from.c];
    const lookback = piece && (piece.type === "R" || piece.type === "B") ? 18 : 10;
    for (let i = state.history.length - 1; i >= Math.max(0, state.history.length - lookback); i -= 1) {
      const prev = state.history[i];
      if (!prev || prev.drop || !prev.from || !prev.to) continue;
      if (prev.from.r === move.to.r && prev.from.c === move.to.c &&
          prev.to.r === move.from.r && prev.to.c === move.from.c) return true;
    }
    return false;
  }

  function repetitionShuffleRisk(state, move) {
    if (!move || move.drop || move.capture || move.promote || !move.from || !move.to) return 0;
    if (!state.history || state.history.length < 8 || state.history.length > 120) return 0;
    const piece = state.board[move.from.r][move.from.c];
    const lookback = piece && (piece.type === "R" || piece.type === "B") ? 18 : 12;
    let reverseCount = 0;
    let sameCount = 0;
    let fromToLoop = 0;
    const start = Math.max(0, state.history.length - lookback);
    for (let i = state.history.length - 1; i >= start; i -= 1) {
      const prev = state.history[i];
      if (!prev || prev.drop || prev.capture || prev.promote || !prev.from || !prev.to) continue;
      const reversed = prev.from.r === move.to.r && prev.from.c === move.to.c &&
        prev.to.r === move.from.r && prev.to.c === move.from.c;
      const repeated = prev.from.r === move.from.r && prev.from.c === move.from.c &&
        prev.to.r === move.to.r && prev.to.c === move.to.c;
      if (reversed) reverseCount += 1;
      if (repeated) sameCount += 1;
      if (reversed || repeated) fromToLoop += 1;
    }
    if (!fromToLoop) return 0;
    const majorScale = piece && (piece.type === "R" || piece.type === "B") ? 1.35 : 1;
    const lateScale = state.history.length >= 44 ? 1.25 : 1;
    return Math.round((reverseCount * 280 + sameCount * 190 + fromToLoop * 70) * majorScale * lateScale);
  }

  function fastMobileCandidates(state, moves) {
    const side = state.turn;
    let candidateMoves = moves.filter(move =>
      !isEarlyBishopHeadPawnPush(state, move, side) &&
      !forbiddenEarlyMajorDrop(state, move, side) &&
      !forbiddenEarlyKingExposure(state, move, side) &&
      !forbiddenEarlyMajorAdvance(state, move, side) &&
      !forbiddenEarlyEdgeBishop(state, move, side) &&
      !leavesBadEdgeBishopBoard(state, move, side)
    );
    if (!window.ShogiRules.inCheck(state, side) && state.history.length < 44) {
      const noKingExposure = candidateMoves.filter(move => {
        if (move.drop || !move.from) return true;
        const piece = state.board[move.from.r][move.from.c];
        return !piece || piece.type !== "K" || advancedRank(side, move.to) < 2;
      });
      if (noKingExposure.length) candidateMoves = noKingExposure;
    }
    const noQuietMajorPromotions = candidateMoves.filter(move => !quietMajorPromotionPenalty(state, move, side));
    if (noQuietMajorPromotions.length) candidateMoves = noQuietMajorPromotions;
    if (state.history.length < 34) {
      const nonDrops = candidateMoves.filter(move => !move.drop);
      if (nonDrops.length) candidateMoves = nonDrops;
    }
    const noLooseMinorShapes = candidateMoves.filter(move => looseMinorPieceShapeRisk(state, move, side) < 700);
    if (noLooseMinorShapes.length) candidateMoves = noLooseMinorShapes;
    const ordered = (candidateMoves.length ? candidateMoves : moves)
      .map(move => ({ move, score: cheapOrderingScore(state, move, null), depth: 1, nodes: moves.length, pv: [move] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(28, moves.length));
    if (state.history.length >= 22 || moves.length > 56) {
      const rescored = preferNoImmediateMate(state, ordered, 4)
        .slice(0, 6)
        .map(item => {
          const undo = window.ShogiBoard.makeMove(state, item.move);
          const positional = evaluateForSide(state, side);
          const middleRisk = middleTransitionReplyRiskFast(state, side, 6);
          const centralRisk = centralBreakthroughRisk(state, item.move, side);
          const checkBonus = window.ShogiRules.inCheck(state, window.ShogiBoard.opponent(side)) ? 45000 : 0;
          window.ShogiBoard.undoMove(state, undo);
          return Object.assign({}, item, {
            score: item.score + positional * 0.16 + checkBonus - middleRisk * 520 - centralRisk * 700
          });
        })
        .sort((a, b) => b.score - a.score);
      return preferNoImmediateMate(state, rescored, 4).slice(0, 3);
    }
    const rescored = preferNoImmediateMate(state, ordered, 4)
      .map((item, index) => {
        if (index >= 14) return item;
        const undo = window.ShogiBoard.makeMove(state, item.move);
        const positional = evaluateForSide(state, side);
        const checkBonus = window.ShogiRules.inCheck(state, window.ShogiBoard.opponent(side)) ? 60000 : 0;
        window.ShogiBoard.undoMove(state, undo);
        return Object.assign({}, item, { score: item.score + positional * 0.14 + checkBonus });
      })
      .sort((a, b) => b.score - a.score);
    return preferNoImmediateMate(state, rescored, 4).slice(0, 3);
  }

  function orderedMoves(state, moves, hashMove, ply) {
    const capped = moves.length > 80
      ? moves
        .map(move => ({ move, order: cheapOrderingScore(state, move, hashMove) }))
        .sort((a, b) => b.order - a.order)
        .slice(0, ply === 0 ? 72 : 42)
        .map(item => item.move)
      : moves;
    return capped
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
    return performance.now() >= ctx.deadline || ctx.nodes >= ctx.nodeLimit;
  }

  function terminalScore(state, side, ply) {
    const inCheck = window.ShogiRules.inCheck(state, side);
    if (inCheck) return -MATE + ply;
    return -20000 + ply;
  }

  function quiescence(state, alpha, beta, ctx, ply) {
    if (timeout(ctx)) {
      ctx.timedOut = true;
      return evaluateForSide(state, state.turn);
    }
    if (ply > (ctx.mobile ? 5 : 8)) return evaluateForSide(state, state.turn);
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
    if ((ctx.nodes & 63) === 0 && timeout(ctx)) {
      ctx.timedOut = true;
      return evaluateForSide(state, state.turn);
    }

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
    score -= majorSacrificeRisk(state, move, side, exchange) * (level >= 8 ? 1.1 : 0.75);
    score -= aimlessEarlyMajorCaptureRisk(state, move, side, exchange) * (level >= 8 ? 1.35 : 0.9);
    if (exchange.see < 0 && !exchange.check && !exchange.mateThreat) score += exchange.see * (level >= 8 ? 1.25 : 0.75);
    if (exchange.see > 0 && move.capture) score += exchange.see * (level >= 8 ? 0.35 : 0.2);
    if (exchange.hanging && !exchange.check && !exchange.mateThreat) score -= (exchange.immediateLoss - exchange.captureGain) * (level >= 8 ? 1.15 : 0.75);
    if (move.promote) score += 130;
    score += strategy;
    score += attackMomentumBonus(state, move, side) * (level >= 8 ? 1.15 : 0.85);
    score -= quietMajorPromotionPenalty(state, move, side) * (level >= 8 ? 1.1 : 0.8);
    score -= risk * cfg.danger;
    if (window.ShogiRules.inCheck(state, window.ShogiBoard.opponent(side))) score += 190;
    if (!cfg.mobile && window.ShogiRules.isCheckmate(state, window.ShogiBoard.opponent(side))) score += MATE / 2;
    if (exchange.check && !exchange.mateThreat && exchange.see < 0) score += exchange.see * (level >= 8 ? 1.4 : 0.9);

    if (cfg.reply) {
      const replies = orderedMoves(state, window.ShogiRules.legalMoves(state, state.turn), null, 1).slice(0, cfg.reply);
      let worst = score;
      for (const reply of replies) {
        const replyUndo = window.ShogiBoard.makeMove(state, reply);
        const replyScore = evaluateForSide(state, side);
        worst = Math.min(worst, replyScore);
        if (!cfg.mobile && window.ShogiRules.isCheckmate(state, side)) worst = -MATE / 2;
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
    const rootDeadline = performance.now() + cfg.time;
    const rawMoves = window.ShogiRules.legalMoves(state, state.turn);
    let moves = rawMoves.filter(move =>
      !forbiddenEarlyMajorDrop(state, move, state.turn) &&
      !forbiddenEarlyKingExposure(state, move, state.turn) &&
      !forbiddenEarlyMajorAdvance(state, move, state.turn) &&
      !forbiddenEarlyEdgeBishop(state, move, state.turn) &&
      !leavesBadEdgeBishopBoard(state, move, state.turn)
    );
    if (!moves.length) moves = rawMoves;
    if (!moves.length) return { bestMove: null, candidates: [], nodes: 0, depth: 0 };
    const fallbackMove = moves[0];

    const mateInOne = window.ShogiRules.findMate(state, state.turn, 1);
    if (mateInOne) {
      return {
        bestMove: mateInOne,
        candidates: [{ move: mateInOne, score: MATE - 1, depth: 1, nodes: moves.length, mate: 1, pv: [mateInOne] }],
        nodes: moves.length,
        depth: 1
      };
    }

    const profile = state.aiProfile && state.aiProfile[state.turn];
    const bookMoves = window.ShogiOpening
      ? window.ShogiOpening.candidates(state, moves, { style: profile && profile.openingStyle })
      : [];
    if (level >= 1 && bookMoves.length && !cfg.deepThinking && cfg.mobile && state.history.length < 28) {
      const candidates = bookMoves.slice(0, 3).map((item, index) => Object.assign({}, item, {
        selected: index === 0,
        weight: index === 0 ? 1 : 0,
        depth: 1,
        nodes: moves.length,
        pv: [item.move],
        debug: {
          aiScore: Math.max(-9999, Math.min(9999, Math.round(item.score || 0))),
          rawScore: Math.max(-9999, Math.min(9999, Math.round(item.score || 0))),
          risk: 0,
          reason: "opening-book-fast"
        }
      }));
      return { bestMove: candidates[0].move || fallbackMove, candidates, nodes: moves.length, depth: 1 };
    }

    if (cfg.mobile && !cfg.deepThinking && state.history.length >= 20 && (moves.length > 34 || state.history.length >= 24)) {
      const ranked = fastMobileCandidates(state, moves);
      return { bestMove: (ranked[0] && ranked[0].move) || fallbackMove, candidates: ranked, nodes: moves.length, depth: 1 };
    }

    const handCount = ["b", "w"].reduce((sum, side) => sum + Object.values(state.hands[side] || {}).reduce((a, b) => a + (b || 0), 0), 0);
    const canTryThreePlyMate = moves.length <= (cfg.mobile ? 34 : 48) && handCount <= (cfg.mobile ? 8 : 12);
    const mateDepth = cfg.mobile
      ? (cfg.mobileMateDepth >= 3 && canTryThreePlyMate ? 3 : 1)
      : (level >= 8 && canTryThreePlyMate ? 5 : level >= 5 && canTryThreePlyMate ? 3 : 1);
    const mate = mateDepth > 1 ? window.ShogiRules.findMate(state, state.turn, mateDepth) : null;
    if (mate) {
      return {
        bestMove: mate,
        candidates: [{ move: mate, score: MATE - 1, depth: mateDepth, nodes: moves.length, mate: mateDepth, pv: [mate] }],
        nodes: moves.length,
        depth: mateDepth
      };
    }

    if (cfg.mobile && !cfg.deepThinking && (moves.length > 56 || state.history.length >= 28)) {
      const ranked = fastMobileCandidates(state, moves);
      return { bestMove: (ranked[0] && ranked[0].move) || fallbackMove, candidates: ranked, nodes: moves.length, depth: 1 };
    }

    if (level >= 1 && bookMoves.length && !cfg.deepThinking) {
      if (cfg.mobile && !cfg.deepThinking && state.history.length < 34) {
        const scoredBook = bookMoves.slice(0, 8).map(item => {
          const risk = fastShapeRisk(state, item.move, state.turn);
          return Object.assign({}, item, {
            rawScore: item.score,
            score: item.score + cheapOrderingScore(state, item.move, null) * 0.18 - risk * 900,
            risk,
            depth: 1,
            nodes: moves.length,
            pv: [item.move]
          });
        });
        const safeBook = scoredBook
          .filter(item => item.risk < 420 + level * 135)
          .sort((a, b) => b.score - a.score);
        const fill = moves.slice(0, 24)
          .filter(move => !safeBook.some(item => moveKey(item.move) === moveKey(move)))
          .map(move => {
            const risk = fastShapeRisk(state, move, state.turn);
            return {
              move,
              score: cheapOrderingScore(state, move, null) - risk * 900,
              risk,
              depth: 1,
              nodes: moves.length,
              pv: [move]
            };
          })
          .filter(item => item.risk < 520 + level * 150)
          .sort((a, b) => b.score - a.score)
          .slice(0, Math.max(0, 3 - safeBook.length));
        const safeCandidates = safeBook.concat(fill).sort((a, b) => b.score - a.score).slice(0, 3)
          .map((item, index) => Object.assign({}, item, {
            selected: index === 0,
            weight: index === 0 ? 1 : 0,
            debug: {
              aiScore: Math.round(item.score),
              rawScore: Math.round(item.rawScore || item.score),
              risk: Math.round(item.risk || 0),
              reason: "opening-shape-safe"
            }
          }));
        if (safeCandidates.length) return { bestMove: safeCandidates[0].move || fallbackMove, candidates: safeCandidates, nodes: moves.length, depth: 1 };
        const candidates = bookMoves.slice(0, 3).map((item, index) => Object.assign({}, item, {
          score: item.score,
          depth: 1,
          nodes: moves.length,
          pv: [item.move],
          selected: index === 0,
          weight: index === 0 ? 1 : 0,
          debug: {
            aiScore: Math.round(item.score),
            rawScore: Math.round(item.score),
            risk: 0,
            reason: "序盤方針を優先"
          }
        }));
        return { bestMove: candidates[0].move || fallbackMove, candidates, nodes: moves.length, depth: 1 };
      }
      if (cfg.mobile && !cfg.deepThinking && state.history.length < 24) {
        const policyMoves = bookMoves
          .filter(item => item.policy)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);
        if (policyMoves.length) {
          const candidates = policyMoves.map(item => Object.assign({}, item, {
            score: item.score + Math.max(0, 40 - state.history.length) * 2600,
            depth: 1,
            nodes: moves.length,
            pv: [item.move]
          }));
          return { bestMove: candidates[0].move || fallbackMove, candidates, nodes: moves.length, depth: 1 };
        }
      }
      const scoredBook = [];
      for (const item of (cfg.mobile ? bookMoves.slice(0, 8) : bookMoves)) {
        if (performance.now() >= rootDeadline) break;
          const risk = tacticalRisk(state, item.move, state.turn, level, cfg);
          const policyBoost = item.policy ? Math.max(0, 40 - state.history.length) * 2600 : 0;
        scoredBook.push(Object.assign({}, item, {
            score: item.score + policyBoost + shallowRank(state, item.move, level, cfg) - risk * (cfg.danger + 0.35),
            risk,
            depth: 1,
            nodes: moves.length,
            pv: [item.move]
        }));
      }
      const safeScoredBook = scoredBook
        .filter(item => item.risk < 520 + level * 170)
        .sort((a, b) => b.score - a.score);
      const fillSource = cfg.mobile ? moves.slice(0, 14) : moves;
      const fill = fillSource
        .filter(move => !safeScoredBook.some(item => moveKey(item.move) === moveKey(move)))
        .map(move => {
          if (performance.now() >= rootDeadline) return { move, score: -INF, depth: 1, nodes: moves.length, pv: [move] };
          return { move, score: shallowRank(state, move, level, cfg), depth: 1, nodes: moves.length, pv: [move] };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(0, 3 - safeScoredBook.length));
      const candidates = safeScoredBook.concat(fill).sort((a, b) => b.score - a.score).slice(0, 3);
      const topBook = safeScoredBook[0];
      const topFill = fill[0];
      const bookExchange = topBook ? exchangeAfterMove(state, topBook.move, state.turn) : null;
      const safeBook = topBook
        && topBook.risk < 520 + level * 120
        && (!bookExchange || bookExchange.netMaterial > -220)
        && (!topFill || topBook.score >= topFill.score - 180);
      const committedOpening = state.history.length < 56 && topBook && topBook.policy && topBook.risk < 420 + level * 120;
      if (candidates.length && (level < 7 || safeBook || committedOpening)) {
        return { bestMove: candidates[0].move, candidates, nodes: moves.length, depth: 1 };
      }
      if (performance.now() >= rootDeadline && candidates.length) {
        return { bestMove: candidates[0].move || fallbackMove, candidates, nodes: moves.length, depth: 1 };
      }
    }

    if (cfg.depth <= 1 && !cfg.iterative) {
      const ranked = (cfg.mobile ? orderedMoves(state, moves, null, 0).slice(0, 32) : moves)
        .map(move => ({ move, score: shallowRank(state, move, level, cfg), depth: 1, nodes: moves.length, pv: [move] }))
        .sort((a, b) => b.score - a.score);
      return { bestMove: level === 1 ? ranked[Math.floor(Math.random() * Math.min(5, ranked.length))].move : (ranked[0] && ranked[0].move) || fallbackMove, candidates: ranked.slice(0, 3), nodes: moves.length, depth: 1 };
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
      mobileQLimit: cfg.mobileQLimit || 12,
      nodeLimit: cfg.nodeLimit || 20000
    };
    let bestCandidates = [];
    let bestMove = null;
    let completedDepth = 0;
    const maxDepth = cfg.depth;
    const deepBookScores = cfg.deepThinking && bookMoves.length
      ? new Map(bookMoves.map(item => [moveKey(item.move), item.score]))
      : null;

    for (let depth = cfg.iterative ? 1 : maxDepth; depth <= maxDepth; depth++) {
      ctx.timedOut = false;
      let rootMoves = orderedMoves(state, moves, bestMove ? moveKey(bestMove) : null, 0);
      if (deepBookScores) {
        rootMoves.sort((a, b) => (deepBookScores.get(moveKey(b)) || 0) - (deepBookScores.get(moveKey(a)) || 0));
      }
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
          if (deepBookScores) score += openingPriorBonus(deepBookScores.get(moveKey(move)), state.history.length);
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

    if (cfg.deepThinking && bookMoves.length && state.history.length < 20) {
      const bookCandidates = bookMoves.slice(0, 3).map((item, index) => Object.assign({}, item, {
        selected: index === 0,
        depth: completedDepth || item.depth || 1,
        nodes: ctx.nodes,
        pv: [item.move]
      }));
      return {
        bestMove: bookCandidates[0].move || bestMove || fallbackMove,
        candidates: bookCandidates,
        nodes: ctx.nodes,
        depth: completedDepth || 1
      };
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

  function debugMove(state, move, level, options = {}) {
    if (!move) return null;
    return withDebug(
      state,
      { move, score: 0, depth: 0, nodes: 0 },
      normalizedLevel(level),
      true,
      false,
      phaseOf(state),
      options
    ).debug;
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

  window.ShogiAI = { candidates, chooseMove, chooseMoveWithRandomness, searchRoot, ensureLegalMove, debugMove };
})();
