self.window = self;

importScripts(
  "pieces.js?v=75",
  "board.js?v=75",
  "rules.js?v=80",
  "evaluation.js?v=84",
  "opening-book.js?v=1",
  "opening.js?v=86",
  "ai.js?v=101"
);

self.onmessage = event => {
  const { id, state, level, profile, mobile, searchOptions } = event.data || {};
  try {
    const searchState = window.ShogiBoard.cloneState(state);
    searchState.aiProfile = Object.assign({}, searchState.aiProfile, { [searchState.turn]: profile });
    const started = performance.now();
    const result = window.ShogiAI.chooseMoveWithRandomness(searchState, level, Object.assign({
      personality: profile && profile.personality,
      randomness: profile && profile.randomness,
      mobile: !!mobile
    }, searchOptions || {}));
    const move = window.ShogiAI.ensureLegalMove(searchState, result.bestMove, level);
    self.postMessage({
      id,
      ok: true,
      move,
      candidates: result.candidates || [],
      depth: result.depth || 0,
      nodes: result.nodes || 0,
      elapsedMs: Math.round(performance.now() - started),
      selection: result.selection || null
    });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
};


