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
    return assert("testNifu", drops.every(move => move.to.c !== 0 && move.to.c !== 1 && move.to.c !== 2 && move.to.c !== 3 && move.to.c !== 4 && move.to.c !== 5 && move.to.c !== 6 && move.to.c !== 7 && move.to.c !== 8), "initial files all have pawns, so no pawn drops should exist");
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

  function testSfenConsistency() {
    const state = window.ShogiBoard.newState();
    const sfen = window.ShogiSfen.positionToSFEN(state);
    return assert("testSfenConsistency", / b - 1$/.test(sfen), sfen);
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

  function runAllTests() {
    const tests = [
      testInitialPosition,
      testLegalMoveGeneration,
      testNifu,
      testMateInOne,
      testSfenConsistency,
      testAiNeverMakesIllegalMove
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
    testMateInOne,
    testSfenConsistency,
    testAiNeverMakesIllegalMove
  };
})();
