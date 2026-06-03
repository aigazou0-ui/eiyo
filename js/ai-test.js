(function () {
  function assert(name, condition, details) {
    return { name, ok: !!condition, details: condition ? "" : (details || "failed") };
  }

  function moveKey(move) {
    if (!move) return "";
    if (move.drop) return `D${move.piece}${move.to.r}${move.to.c}`;
    return `${move.from.r}${move.from.c}${move.to.r}${move.to.c}${move.promote ? "+" : ""}`;
  }

  function testInitialPosition() {
    const state = window.ShogiBoard.newState();
    let pieces = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (state.board[r][c]) pieces += 1;
    return assert("testInitialPosition", pieces === 40 && state.turn === "b", `pieces=${pieces}`);
  }

  function testLegalMoveGeneration() {
    const state = window.ShogiBoard.newState();
    const moves = window.ShogiRules.legalMoves(state, "b");
    return assert("testLegalMoveGeneration", moves.length > 0 && moves.every(m => window.ShogiRules.isLegalMove(state, m, "b")), `moves=${moves.length}`);
  }

  function testNifu() {
    const state = window.ShogiBoard.newState();
    state.hands.b.P = 1;
    const drops = window.ShogiRules.legalDropsFor(Object.assign(state, { turn: "b" }), "P");
    return assert("testNifu", drops.length === 0, `drops=${drops.length}`);
  }

  function emptyTestState(turn = "b") {
    return {
      board: Array.from({ length: 9 }, () => Array(9).fill(null)),
      hands: { b: { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 }, w: { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 } },
      turn,
      history: [],
      evalHistory: [50],
      gameOver: false
    };
  }

  function testPieceMovementBasics() {
    const state = emptyTestState("b");
    state.board[8][4] = { type: "K", owner: "b", promoted: false };
    state.board[0][4] = { type: "K", owner: "w", promoted: false };
    state.board[4][4] = { type: "R", owner: "b", promoted: false };
    state.board[5][6] = { type: "B", owner: "b", promoted: false };
    state.board[6][1] = { type: "N", owner: "b", promoted: false };
    const moves = window.ShogiRules.legalMoves(state, "b").map(moveKey);
    const ok = moves.includes("4434") && moves.includes("4445") && moves.includes("5623") && moves.includes("6140");
    return assert("testPieceMovementBasics", ok, moves.slice(0, 12).join(","));
  }

  function testMandatoryPromotion() {
    const state = emptyTestState("b");
    state.board[8][4] = { type: "K", owner: "b", promoted: false };
    state.board[0][8] = { type: "K", owner: "w", promoted: false };
    state.board[1][4] = { type: "P", owner: "b", promoted: false };
    const moves = window.ShogiRules.legalMoves(state, "b").filter(m => !m.drop && m.from.r === 1 && m.from.c === 4);
    return assert("testMandatoryPromotion", moves.length === 1 && moves[0].promote, JSON.stringify(moves));
  }

  function testPieceDrop() {
    const state = emptyTestState("b");
    state.board[8][4] = { type: "K", owner: "b", promoted: false };
    state.board[0][4] = { type: "K", owner: "w", promoted: false };
    state.hands.b.P = 1;
    const drops = window.ShogiRules.legalDropsFor(state, "P");
    return assert("testPieceDrop", drops.some(move => move.drop && move.piece === "P" && move.to.r === 4 && move.to.c === 4), `drops=${drops.length}`);
  }

  function testMateInOne() {
    const state = window.ShogiBoard.newState();
    state.board = Array.from({ length: 9 }, () => Array(9).fill(null));
    state.board[0][4] = { type: "K", owner: "w", promoted: false };
    state.board[2][4] = { type: "R", owner: "b", promoted: false };
    state.board[8][4] = { type: "K", owner: "b", promoted: false };
    state.hands = { b: { R: 0, B: 0, G: 1, S: 0, N: 0, L: 0, P: 0 }, w: { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 } };
    state.turn = "b";
    const move = window.ShogiRules.findMateInOne(state, "b");
    return assert("testMateInOne", !move || window.ShogiRules.isLegalMove(state, move, "b"), move ? moveKey(move) : "no mate found");
  }

  function testAiNeverMakesIllegalMove() {
    const state = window.ShogiBoard.newState();
    for (let level = 1; level <= 10; level++) {
      const result = window.ShogiAI.searchRoot(state, level);
      if (!window.ShogiRules.isLegalMove(state, result.bestMove, "b")) {
        return assert("testAiNeverMakesIllegalMove", false, `level=${level} move=${moveKey(result.bestMove)}`);
      }
    }
    return assert("testAiNeverMakesIllegalMove", true);
  }

  function testAiStrongTimeLimit() {
    const state = window.ShogiBoard.newState();
    const started = performance.now();
    const result = window.ShogiAI.searchRoot(state, 10, { mobile: true });
    const elapsed = performance.now() - started;
    const legal = window.ShogiRules.isLegalMove(state, result.bestMove, "b");
    return assert("testAiStrongTimeLimit", legal && elapsed < 2200, `elapsed=${Math.round(elapsed)} move=${moveKey(result.bestMove)}`);
  }

  function testCheckEvasion() {
    const state = window.ShogiBoard.newState();
    state.board = Array.from({ length: 9 }, () => Array(9).fill(null));
    state.board[8][4] = { type: "K", owner: "b", promoted: false };
    state.board[0][4] = { type: "K", owner: "w", promoted: false };
    state.board[5][4] = { type: "R", owner: "w", promoted: false };
    state.hands = { b: { R: 0, B: 0, G: 1, S: 0, N: 0, L: 0, P: 0 }, w: { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 } };
    state.turn = "b";
    const result = window.ShogiAI.searchRoot(state, 8, { mobile: true });
    const after = window.ShogiBoard.applyMove(state, result.bestMove);
    return assert("testCheckEvasion", !window.ShogiRules.inCheck(after, "b"), `move=${moveKey(result.bestMove)}`);
  }

  function runAllTests() {
    const tests = [
      testInitialPosition,
      testLegalMoveGeneration,
      testNifu,
      testPieceMovementBasics,
      testMandatoryPromotion,
      testPieceDrop,
      testMateInOne,
      testAiNeverMakesIllegalMove,
      testAiStrongTimeLimit,
      testCheckEvasion
    ];
    const results = tests.map(test => {
      try {
        return test();
      } catch (error) {
        return assert(test.name, false, error.message || String(error));
      }
    });
    console.table(results);
    return results;
  }

  window.ShogiAiTest = {
    runAllTests,
    testInitialPosition,
    testLegalMoveGeneration,
    testNifu,
    testPieceMovementBasics,
    testMandatoryPromotion,
    testPieceDrop,
    testMateInOne,
    testAiNeverMakesIllegalMove,
    testAiStrongTimeLimit,
    testCheckEvasion
  };
})();
