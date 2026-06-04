(function () {
  window.ShogiOpeningBook = {
    id: "seed-opening-pack",
    version: 1,
    maxPly: 30,
    entries: [
      {
        id: "common-first-move",
        prefix: "",
        tags: ["balanced", "static", "yagura", "gangi", "bishop-exchange"],
        moves: [
          { usi: "7g7f", count: 60, weight: 1.15 },
          { usi: "2g2f", count: 42, weight: 1.0 }
        ]
      },
      {
        id: "white-common-reply",
        prefix: "7g7f",
        tags: ["balanced", "static", "yagura", "gangi", "bishop-exchange"],
        moves: [
          { usi: "3c3d", count: 70, weight: 1.15 },
          { usi: "8c8d", count: 35, weight: 0.95 }
        ]
      },
      {
        id: "white-rook-pawn-reply",
        prefix: "2g2f",
        tags: ["balanced", "static", "right-king", "static-rapid"],
        moves: [
          { usi: "8c8d", count: 52, weight: 1.1 },
          { usi: "3c3d", count: 40, weight: 1.0 }
        ]
      }
    ]
  };
})();
