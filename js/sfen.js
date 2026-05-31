(function () {
  function requireUsi() {
    if (!window.ShogiUsi) throw new Error("ShogiUsi is not loaded");
    return window.ShogiUsi;
  }

  function positionToSFEN(state) {
    return requireUsi().stateToSfen(state);
  }

  function moveToUSI(move) {
    return requireUsi().moveToUsi(move);
  }

  function usiToMove(usi, state) {
    return requireUsi().usiToMove(usi, state);
  }

  function sfenKey(state) {
    return positionToSFEN(state).replace(/\s+\d+$/, "");
  }

  window.ShogiSfen = { positionToSFEN, moveToUSI, usiToMove, sfenKey };
})();
