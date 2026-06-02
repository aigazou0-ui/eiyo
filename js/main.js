(function () {
  const els = {};
  const STATE_VERSION = 27;
  const INITIAL_CLOCK_SECONDS = 600;
  let state;
  let playerSide = "b";
  let cpuSide = "w";
  let selected = null;
  let selectedDrop = null;
  let legalTargets = [];
  let legalPreviewEnabled = true;
  let cpuThinking = false;
  let reviewPly = 0;
  let reviewHistory = [];
  const aiMode = "yaneuraou";
  const ENGINE_API_BASE = "https://shogi-yaneuraou-api.onrender.com";
  let cpuProfile = null;
  let cachedCandidates = [];
  let cachedCandidateKey = "";
  let lastCpuChoiceCandidates = [];
  let lastCpuChoicePly = -1;
  let cpuSearchToken = 0;
  let aiWorker = null;
  let aiWorkerRequest = null;
  let clockTimer = null;
  let finishingByClock = false;
  let audioContext = null;
  let audioUnlocked = false;

  const CPU_PROFILE_TABLE = {
    1: {
      personalities: [["varied", 4], ["attack", 3], ["standard", 2], ["defense", 1]],
      randomness: [["high", 5], ["normal", 3], ["low", 1]],
      openings: [["yagura", 2], ["gangi", 2], ["right-king", 2], ["static-rapid", 2], ["ranging-mino", 2]]
    },
    2: {
      personalities: [["varied", 3], ["attack", 3], ["standard", 3], ["defense", 1]],
      randomness: [["high", 3], ["normal", 4], ["low", 1]],
      openings: [["yagura", 2], ["gangi", 2], ["right-king", 2], ["static-rapid", 2], ["ranging-mino", 2]]
    },
    3: {
      personalities: [["standard", 4], ["varied", 3], ["attack", 2], ["defense", 1]],
      randomness: [["normal", 5], ["high", 2], ["low", 1]],
      openings: [["yagura", 3], ["gangi", 3], ["right-king", 2], ["static-rapid", 2], ["ranging-mino", 2]]
    },
    4: {
      personalities: [["standard", 4], ["varied", 2], ["attack", 2], ["defense", 2]],
      randomness: [["normal", 5], ["low", 2], ["high", 1]],
      openings: [["yagura", 3], ["gangi", 3], ["right-king", 2], ["static-rapid", 2], ["ranging-mino", 2]]
    },
    5: {
      personalities: [["standard", 4], ["defense", 2], ["attack", 2], ["varied", 1], ["stable", 1]],
      randomness: [["normal", 4], ["low", 3], ["high", 1]],
      openings: [["yagura", 4], ["gangi", 4], ["right-king", 2], ["static-rapid", 2], ["ranging-mino", 2]]
    },
    6: {
      personalities: [["standard", 4], ["stable", 2], ["defense", 2], ["attack", 1], ["varied", 1]],
      randomness: [["low", 4], ["normal", 3], ["high", 1]],
      openings: [["yagura", 4], ["gangi", 4], ["right-king", 2], ["static-rapid", 2], ["ranging-mino", 1]]
    },
    7: {
      personalities: [["standard", 4], ["stable", 3], ["defense", 2], ["attack", 1]],
      randomness: [["low", 5], ["normal", 3]],
      openings: [["yagura", 4], ["gangi", 4], ["right-king", 2], ["static-rapid", 2], ["ranging-mino", 1]]
    },
    8: {
      personalities: [["stable", 4], ["standard", 4], ["defense", 1], ["attack", 1]],
      randomness: [["low", 5], ["normal", 2]],
      openings: [["yagura", 4], ["gangi", 4], ["right-king", 2], ["static-rapid", 2], ["ranging-mino", 1]]
    },
    9: {
      personalities: [["stable", 5], ["standard", 4], ["defense", 1]],
      randomness: [["low", 6], ["normal", 1]],
      openings: [["yagura", 4], ["gangi", 4], ["right-king", 2], ["static-rapid", 2], ["ranging-mino", 1]]
    },
    10: {
      personalities: [["stable", 5], ["standard", 4], ["defense", 1]],
      randomness: [["low", 7], ["normal", 1]],
      openings: [["yagura", 4], ["gangi", 4], ["right-king", 2], ["static-rapid", 2], ["ranging-mino", 1]]
    }
  };

  function $(id) { return document.getElementById(id); }

  function save() {
    try {
      localStorage.setItem("offline-shogi-state", JSON.stringify(state));
    } catch (error) {
      console.warn("Save skipped:", error);
    }
  }

  function ensureClock(gameState = state) {
    if (!gameState) return null;
    if (!gameState.clocks || typeof gameState.clocks.b !== "number" || typeof gameState.clocks.w !== "number") {
      gameState.clocks = { b: INITIAL_CLOCK_SECONDS, w: INITIAL_CLOCK_SECONDS, lastAt: Date.now() };
    }
    if (!gameState.clocks.lastAt) gameState.clocks.lastAt = Date.now();
    return gameState.clocks;
  }

  function updateActiveClock() {
    if (!state || state.gameOver) return;
    const clocks = ensureClock(state);
    const now = Date.now();
    const elapsed = Math.max(0, Math.floor((now - clocks.lastAt) / 1000));
    if (elapsed > 0) {
      clocks[state.turn] = Math.max(0, clocks[state.turn] - elapsed);
      clocks.lastAt += elapsed * 1000;
    }
  }

  function resetClockAnchor() {
    const clocks = ensureClock(state);
    clocks.lastAt = Date.now();
  }

  function formatClock(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    const min = Math.floor(value / 60);
    const sec = value % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  }

  function clockText(side, displayState = state) {
    const clocks = ensureClock(displayState);
    return formatClock(clocks[side]);
  }

  function updateClockDisplays() {
    if (!state) return;
    updateActiveClock();
    document.querySelectorAll(".komadai-clock[data-side]").forEach(node => {
      const side = node.dataset.side;
      node.textContent = clockText(side, state);
      const parent = node.closest(".hand");
      if (parent) parent.classList.toggle("clock-danger", (state.clocks && state.clocks[side] || 0) <= 60);
    });
  }

  async function checkClockFlag() {
    if (!state || state.gameOver || finishingByClock) return;
    updateActiveClock();
    const clocks = ensureClock(state);
    const lostSide = clocks.b <= 0 ? "b" : clocks.w <= 0 ? "w" : null;
    if (!lostSide) return;
    finishingByClock = true;
    await finishGame(`${sideName(lostSide)}の時間が切れました。${sideName(window.ShogiBoard.opponent(lostSide))}の勝ちです。`);
    finishingByClock = false;
  }

  function startClockTimer() {
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      updateClockDisplays();
      checkClockFlag();
    }, 500);
  }

  function unlockAudio() {
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const resume = audioContext.state === "suspended" ? audioContext.resume() : Promise.resolve();
      resume.then(() => {
        if (audioUnlocked || !audioContext) return;
        const buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);
        audioUnlocked = true;
      }).catch(() => {});
    } catch {
      audioContext = null;
    }
  }

  function bindAudioUnlock() {
    const unlock = () => unlockAudio();
    document.addEventListener("pointerdown", unlock, { once: true, passive: true });
    document.addEventListener("click", unlock, { once: true, passive: true });
    document.addEventListener("touchstart", unlock, { once: true, passive: true });
    document.addEventListener("keydown", unlock, { once: true });
  }

  function playSound(kind) {
    try {
      unlockAudio();
      if (!audioContext) return;
      if (audioContext.state === "suspended") {
        audioContext.resume().then(() => playSound(kind)).catch(() => {});
        return;
      }
      const now = audioContext.currentTime;
      const tone = {
        move: { high: 520, low: 150, duration: 0.085, volume: 0.2 },
        capture: { high: 340, low: 105, duration: 0.12, volume: 0.24 },
        promote: { high: 720, low: 180, duration: 0.14, volume: 0.22 },
        check: { high: 880, low: 220, duration: 0.16, volume: 0.23 },
        end: { high: 260, low: 90, duration: 0.24, volume: 0.2 }
      }[kind] || { high: 480, low: 140, duration: 0.09, volume: 0.18 };
      const master = audioContext.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(tone.volume, now + 0.006);
      master.gain.exponentialRampToValueAtTime(0.001, now + tone.duration);
      master.connect(audioContext.destination);
      [
        [tone.high, "triangle", 1],
        [tone.low, "square", 0.32]
      ].forEach(([frequency, type, level]) => {
        const gain = audioContext.createGain();
        const osc = audioContext.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * 0.7), now + tone.duration);
        gain.gain.setValueAtTime(level, now);
        osc.connect(gain).connect(master);
        osc.start(now);
        osc.stop(now + tone.duration);
      });
    } catch {}
  }

  function soundKindForMove(beforeState, move, afterState) {
    if (afterState && window.ShogiRules.inCheck(afterState, afterState.turn)) return "check";
    if (move && move.promote) return "promote";
    const captured = move && !move.drop ? beforeState.board[move.to.r][move.to.c] : null;
    if (captured) return "capture";
    return "move";
  }

  function clearSelection() {
    selected = null;
    selectedDrop = null;
    legalTargets = [];
  }

  function hasOwnPawnInFileFast(boardState, side, file) {
    for (let r = 0; r < 9; r++) {
      const piece = boardState.board[r][file];
      if (piece && piece.owner === side && piece.type === "P" && !piece.promoted) return true;
    }
    return false;
  }

  function fastDropsFor(boardState, side, type) {
    const moves = [];
    if (!boardState.hands?.[side]?.[type]) return moves;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (boardState.board[r][c]) continue;
      if ((type === "P" || type === "L") && (side === "b" ? r === 0 : r === 8)) continue;
      if (type === "N" && (side === "b" ? r <= 1 : r >= 7)) continue;
      if (type === "P" && hasOwnPawnInFileFast(boardState, side, c)) continue;
      moves.push({ drop: true, piece: type, to: { r, c }, fastOnly: true });
    }
    return moves;
  }

  function fastMovesFrom(boardState, r, c) {
    return window.ShogiRules
      .pseudoPieceMoves(boardState, r, c)
      .map(move => Object.assign({}, move, { fastOnly: true }));
  }

  function legalPreviewBudgetMs() {
    return window.matchMedia && window.matchMedia("(max-width: 768px)").matches ? 45 : 80;
  }

  function legalPreview(compute) {
    if (!legalPreviewEnabled) return [];
    const started = performance.now();
    const moves = compute();
    if (performance.now() - started > legalPreviewBudgetMs()) {
      legalPreviewEnabled = false;
      return [];
    }
    return moves;
  }

  function previewDropsFor(boardState, side, type) {
    return legalPreview(() => window.ShogiRules.legalDropsFor(boardState, type));
  }

  function previewMovesFrom(boardState, r, c) {
    return legalPreview(() => window.ShogiRules.legalMovesFrom(boardState, r, c));
  }

  function strictCandidatesForTarget(move) {
    const source = move.drop
      ? window.ShogiRules.legalDropsFor(state, move.piece)
      : window.ShogiRules.legalMovesFrom(state, move.from.r, move.from.c);
    return source.filter(candidate => {
      if (candidate.to.r !== move.to.r || candidate.to.c !== move.to.c) return false;
      if (candidate.drop || move.drop) return candidate.drop === move.drop && candidate.piece === move.piece;
      return true;
    });
  }

  function sideName(side) {
    const base = side === "b" ? "先手" : "後手";
    return side === playerSide ? `${base} あなた` : `${base} CPU`;
  }

  function turnText() {
    if (state.gameOver) return "対局終了";
    if (cpuThinking) return "CPU思考中";
    return state.turn === playerSide ? "あなたの手番" : "CPU手番";
  }

  function playerPercentFromBlack(blackPercent) {
    return playerSide === "b" ? blackPercent : 100 - blackPercent;
  }

  function playerEvalValues(values) {
    return playerSide === "b" ? values : values.map(value => 100 - value);
  }

  function sideWinPercent(side, displayState = state) {
    const black = window.ShogiEvaluation.blackPercent(displayState);
    return side === "b" ? black : 100 - black;
  }

  function shouldCpuResign(displayState = state) {
    if (!displayState || displayState.gameOver || displayState.turn !== cpuSide) return false;
    if (displayState.history.length < 40) {
      displayState.cpuResignStreak = 0;
      return false;
    }
    const cpuPercent = sideWinPercent(cpuSide, displayState);
    if (cpuPercent > 1) {
      displayState.cpuResignStreak = 0;
      return false;
    }
    const score = window.ShogiEvaluation.scoreState(displayState) * (cpuSide === "b" ? 1 : -1);
    if (score > -4200) {
      displayState.cpuResignStreak = 0;
      return false;
    }
    const legal = window.ShogiRules.legalMoves(displayState, cpuSide);
    if (!legal.length) {
      displayState.cpuResignStreak = 0;
      return false;
    }
    if (window.ShogiRules.inCheck(displayState, cpuSide) && legal.length <= 2) {
      displayState.cpuResignStreak = 0;
      return false;
    }
    displayState.cpuResignStreak = (displayState.cpuResignStreak || 0) + 1;
    return displayState.cpuResignStreak >= 2;
  }

  function playerEvalLabel(percent) {
    const diff = Math.abs(percent - 50);
    if (diff < 6) return "互角";
    const side = percent > 50 ? "あなた" : "相手";
    if (diff < 16) return side + "やや良し";
    if (diff < 30) return side + "優勢";
    return side + "勝勢";
  }

  function levelName() {
    return { 1: "弱い", 2: "普通", 3: "強い" }[getDisplayLevel()] || "普通";
  }

  function getDisplayLevel() {
    return Math.max(1, Math.min(3, Number(els.titleLevelSelect.value || 2)));
  }

  function getLevel() {
    const displayLevel = getDisplayLevel();
    return { 1: 1, 2: 5, 3: 10 }[displayLevel] || 5;
  }

  function levelLabel() {
    return `CPU ${levelName()}`;
  }

  function weightedPick(items) {
    const total = items.reduce((sum, item) => sum + item[1], 0);
    let roll = Math.random() * total;
    for (const [value, weight] of items) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    return items[items.length - 1][0];
  }

  function createCpuProfile(level) {
    const lv = Math.max(1, Math.min(10, Number(level) || 2));
    const table = CPU_PROFILE_TABLE[lv] || CPU_PROFILE_TABLE[2];
    const personality = weightedPick(table.personalities);
    let randomness = weightedPick(table.randomness);
    let openingStyle = weightedPick(table.openings);

    if (personality === "attack" && Math.random() < 0.55) openingStyle = weightedPick([["static-rapid", 3], ["ranging-mino", 2], ["right-king", 1]]);
    if (personality === "defense" && Math.random() < 0.6) openingStyle = weightedPick([["yagura", 3], ["gangi", 3], ["right-king", 2]]);
    if (personality === "varied" && Math.random() < 0.6) openingStyle = weightedPick([["right-king", 2], ["ranging-mino", 2], ["static-rapid", 2], ["gangi", 1], ["yagura", 1]]);
    if (personality === "stable" && randomness === "normal" && lv >= 8 && Math.random() < 0.65) randomness = "low";

    return { personality, randomness, openingStyle };
  }

  function currentCpuProfile() {
    if (state && state.aiProfile && state.aiProfile[cpuSide]) return state.aiProfile[cpuSide];
    if (!cpuProfile) cpuProfile = createCpuProfile(getLevel());
    return cpuProfile;
  }

  function isMobileAiMode() {
    return !!(window.matchMedia && window.matchMedia("(max-width: 768px)").matches);
  }

  function aiSearchOptions(profile) {
    return {
      personality: profile && profile.personality,
      randomness: profile && profile.randomness,
      mobile: isMobileAiMode()
    };
  }

  function emergencyCpuMove(level) {
    const legal = window.ShogiRules.legalMoves(state, state.turn);
    if (!legal.length) return { move: null, candidates: [] };
    const scored = legal.map(move => {
      let score = 0;
      if (!move.drop && move.capture) score += 1000 + window.ShogiEvaluation.pieceValue(move.capture);
      if (move.promote) score += 180;
      const side = state.turn;
      const undo = window.ShogiBoard.makeMove(state, move);
      if (window.ShogiRules.inCheck(state, window.ShogiBoard.opponent(side))) score += 450;
      const percent = cpuSide === "b"
        ? window.ShogiEvaluation.blackPercent(state)
        : 100 - window.ShogiEvaluation.blackPercent(state);
      score += percent * 2;
      window.ShogiBoard.undoMove(state, undo);
      score += Math.random() * Math.max(1, 12 - level);
      return { move, score, depth: 0, nodes: legal.length, emergency: true };
    }).sort((a, b) => b.score - a.score);
    return { move: scored[0].move, candidates: scored.slice(0, 3) };
  }

  function displayToStatePos(r, c) {
    return playerSide === "b" ? { r, c } : { r: 8 - r, c: 8 - c };
  }

  function stateToDisplayPos(r, c) {
    return playerSide === "b" ? { r, c } : { r: 8 - r, c: 8 - c };
  }

  function askModal({ title, message, okText = "OK", cancelText = "キャンセル", showCancel = true, reverseButtons = false, tone = "" }) {
    return new Promise(resolve => {
      els.modalTitle.textContent = title;
      els.modalMessage.textContent = message;
      els.modalOkBtn.textContent = okText;
      els.modalCancelBtn.textContent = cancelText;
      els.modalCancelBtn.classList.toggle("hidden", !showCancel);
      els.modalOverlay.classList.toggle("modal-classic", tone === "classic");
      els.modalOkBtn.style.order = reverseButtons ? "1" : "";
      els.modalCancelBtn.style.order = reverseButtons ? "2" : "";
      els.modalOverlay.classList.remove("hidden");

      const cleanup = result => {
        els.modalOverlay.classList.add("hidden");
        els.modalOverlay.classList.remove("modal-classic");
        els.modalOkBtn.style.order = "";
        els.modalCancelBtn.style.order = "";
        els.modalOkBtn.removeEventListener("click", ok);
        els.modalCancelBtn.removeEventListener("click", cancel);
        els.modalOverlay.removeEventListener("click", backdrop);
        document.removeEventListener("keydown", keydown);
        resolve(result);
      };
      const ok = () => cleanup(true);
      const cancel = () => cleanup(false);
      const backdrop = event => {
        if (event.target === els.modalOverlay && showCancel) cleanup(false);
      };
      const keydown = event => {
        if (event.key === "Escape" && showCancel) cleanup(false);
        if (event.key === "Enter") cleanup(true);
      };

      els.modalOkBtn.addEventListener("click", ok);
      els.modalCancelBtn.addEventListener("click", cancel);
      els.modalOverlay.addEventListener("click", backdrop);
      document.addEventListener("keydown", keydown);
      els.modalOkBtn.focus();
    });
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("toast-hide"), 1800);
    setTimeout(() => toast.remove(), 2400);
  }

  function renderBoardInto(boardEl, displayState, interactive) {
    const fragment = document.createDocumentFragment();
    const bInCheck = window.ShogiRules.inCheck(displayState, "b");
    const wInCheck = window.ShogiRules.inCheck(displayState, "w");

    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const pos = displayToStatePos(r, c);
      const sq = document.createElement("div");
      sq.className = "square";
      sq.role = interactive ? "button" : "presentation";
      sq.tabIndex = interactive ? 0 : -1;
      sq.dataset.r = pos.r;
      sq.dataset.c = pos.c;

      const legal = interactive && legalTargets.find(m => m.to.r === pos.r && m.to.c === pos.c);
      if (interactive && selected && selected.r === pos.r && selected.c === pos.c) sq.classList.add("selected");
      if (legal) {
        sq.classList.add("legal");
        if (legal.capture) sq.classList.add("capture");
      }

      const p = displayState.board[pos.r][pos.c];
      if (p && p.type === "K" && ((p.owner === "b" && bInCheck) || (p.owner === "w" && wInCheck))) sq.classList.add("check");
      if (p) {
        const pieceEl = document.createElement("div");
        const selectedClass = interactive && selected && selected.r === pos.r && selected.c === pos.c ? "selected-piece" : "";
        const perspectiveClass = p.owner === playerSide ? "player-piece" : "opponent-piece";
        pieceEl.className = `piece ${perspectiveClass} ${p.promoted ? "promoted" : ""} ${selectedClass}`;
        const label = window.ShogiPieces.labelOf(p);
        if (label.length > 1) pieceEl.classList.add("long-label");
        pieceEl.textContent = label;
        sq.appendChild(pieceEl);
      }

      if (interactive) {
        sq.addEventListener("click", () => onSquareClick(pos.r, pos.c));
        sq.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSquareClick(pos.r, pos.c);
          }
        });
      }
      fragment.appendChild(sq);
    }

    boardEl.replaceChildren(fragment);
  }

  function renderKomadai(side, container, displayState, interactive) {
    container.innerHTML = "";
    container.classList.toggle("active-turn", !displayState.gameOver && displayState.turn === side);

    const turnBar = document.createElement("div");
    turnBar.className = "turn-bar";
    container.appendChild(turnBar);

    const title = document.createElement("div");
    title.className = "komadai-title";
    title.textContent = sideName(side);
    container.appendChild(title);

    const clock = document.createElement("div");
    clock.className = "komadai-clock";
    clock.dataset.side = side;
    clock.textContent = clockText(side, displayState);
    container.classList.toggle("clock-danger", (displayState.clocks && displayState.clocks[side] || INITIAL_CLOCK_SECONDS) <= 60);
    container.appendChild(clock);

    const tray = document.createElement("div");
    tray.className = "komadai-tray";
    container.appendChild(tray);

    for (const type of window.ShogiPieces.HAND_ORDER) {
      const count = displayState.hands[side][type];
      if (count <= 0) continue;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hand-piece";
      if (interactive && selectedDrop === type && displayState.turn === side) btn.classList.add("selected");

      const pieceFace = document.createElement("span");
      pieceFace.className = `piece hand-face ${side === playerSide ? "player-piece" : "opponent-piece"}`;
      const label = window.ShogiPieces.labelOf(type);
      if (label.length > 1) pieceFace.classList.add("long-label");
      pieceFace.textContent = label;

      const countFace = document.createElement("span");
      countFace.className = "hand-count";
      countFace.textContent = `x${count}`;
      btn.append(pieceFace, countFace);

      btn.disabled = !interactive || displayState.turn !== side || side !== playerSide || displayState.gameOver || cpuThinking;
      if (interactive) btn.addEventListener("click", () => selectDrop(type));
      tray.appendChild(btn);
    }
  }

  function renderKifuTo(listEl, countEl, history, currentPly) {
    if (!listEl || !countEl) return;
    listEl.innerHTML = "";
    history.forEach((m, i) => {
      const li = document.createElement("li");
      li.textContent = window.ShogiKifu.moveText(m, i % 2 === 0 ? "b" : "w");
      if (typeof currentPly === "number" && i === currentPly - 1) li.classList.add("kifu-current");
      listEl.appendChild(li);
    });
    countEl.textContent = `${history.length}手`;
    listEl.scrollTop = typeof currentPly === "number" ? Math.max(0, currentPly - 3) * 28 : listEl.scrollHeight;
  }

  function updateEval() {
    const percent = window.ShogiEvaluation.blackPercent(state);
    if (state.evalHistory[state.evalHistory.length - 1] !== percent) state.evalHistory.push(percent);
    els.blackPercent.textContent = `先手 ${percent}%`;
    els.whitePercent.textContent = `後手 ${100 - percent}%`;
    els.meterFill.style.width = `${percent}%`;
    if (els.mobileEvalText) els.mobileEvalText.textContent = playerEvalLabel(playerPercentFromBlack(percent));
    if (els.mobileEvalGraph) window.ShogiGraph.draw(els.mobileEvalGraph, playerEvalValues(state.evalHistory));
  }

  function getCpuCandidates(level) {
    if (state.gameOver) return [];
    if (cpuThinking || state.turn === cpuSide) return cachedCandidates;
    if (state.turn === playerSide && lastCpuChoicePly === state.history.length && lastCpuChoiceCandidates.length) {
      return lastCpuChoiceCandidates;
    }
    const profile = currentCpuProfile();
    const mobile = isMobileAiMode();
    const key = `${state.history.length}:${state.turn}:${level}:${aiMode}:${profile.personality}:${profile.randomness}:${profile.openingStyle}:${mobile ? "m" : "p"}`;
    if (cachedCandidateKey === key) return cachedCandidates;
    const cpuState = window.ShogiBoard.cloneState(state);
    cpuState.turn = cpuSide;
    cpuState.aiProfile = Object.assign({}, state.aiProfile, { [cpuSide]: profile });
    const previewLevel = Math.min(level, 3);
    cachedCandidates = window.ShogiAI.candidates(cpuState, previewLevel, { mobile, preview: true }).slice(0, 3);
    cachedCandidateKey = key;
    return cachedCandidates;
  }

  async function getEngineBestMove(level) {
    if (aiMode !== "yaneuraou") return null;
    const engineLevel = level >= 8 ? "strong" : "normal";
    const movetime = engineLevel === "strong" ? 1000 : 500;
    const response = await fetch(`${ENGINE_API_BASE}/bestmove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sfen: window.ShogiUsi.stateToSfen(state),
        level: engineLevel,
        purpose: "cpu",
        side: cpuSide,
        ply: state.history.length + 1,
        byoyomi: 1000,
        movetime
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.error || "USI engine is unavailable");
    const move = window.ShogiUsi.usiToMove(payload.bestmove, state);
    const candidates = (payload.candidates || [])
      .map(item => window.ShogiUsi.candidateFromUsi(item, state))
      .filter(Boolean)
      .slice(0, 3);
    return { move, candidates };
  }

  function candidateEmptyText() {
    if (state.gameOver) return "対局終了";
    if (cpuThinking || state.turn === cpuSide) return "CPU思考中";
    if (state.turn === playerSide) return "CPU待機中";
    if (window.ShogiRules.legalMoves(state, cpuSide).length === 0) return "合法手なし";
    return "候補生成中";
  }

  function renderCandidateList(container, list) {
    if (!container) return;
    container.innerHTML = "";
    const data = list || getCpuCandidates(getLevel());
    if (!data.length) {
      const div = document.createElement("div");
      div.className = "candidate";
      const strong = document.createElement("strong");
      strong.textContent = candidateEmptyText();
      const span = document.createElement("span");
      span.textContent = "-";
      div.append(strong, span);
      container.appendChild(div);
      return;
    }

    data.forEach((item, idx) => {
      const div = document.createElement("div");
      div.className = "candidate";
      if (item.selected) div.classList.add("selected-candidate");
      const baseState = data.baseState || state;
      const text = window.ShogiKifu.moveText(window.ShogiKifu.enrichMove(baseState, item.move), cpuSide);
      const strong = document.createElement("strong");
      strong.textContent = `${idx + 1}. ${text}`;
      const span = document.createElement("span");
      const cpuScore = Number(item.debug && Number.isFinite(item.debug.aiScore) ? item.debug.aiScore : item.score || 0);
      span.className = cpuScore > 0 ? "delta-up" : cpuScore < 0 ? "delta-down" : "delta-flat";
      span.textContent = `${cpuScore >= 0 ? "+" : ""}${Math.round(cpuScore)}`;
      div.append(strong, span);
      container.appendChild(div);
    });
  }

  function pvText(baseState, pv) {
    if (!pv || !pv.length) return "";
    let replay = window.ShogiBoard.cloneState(baseState);
    const texts = [];
    for (const move of pv.slice(0, 4)) {
      try {
        const side = replay.turn;
        texts.push(window.ShogiKifu.moveText(window.ShogiKifu.enrichMove(replay, move), side));
        replay = window.ShogiBoard.applyMove(replay, move);
      } catch {
        break;
      }
    }
    return texts.join(" ");
  }

  function renderCandidates(list) {
    if (list) {
      cachedCandidates = list.slice(0, 3);
      if (list.baseState) cachedCandidates.baseState = list.baseState;
      const profile = currentCpuProfile();
      cachedCandidateKey = `${state.history.length}:${state.turn}:${getLevel()}:${aiMode}:${profile.personality}:${profile.randomness}:${profile.openingStyle}:${isMobileAiMode() ? "m" : "p"}`;
    }
    renderCandidateList(els.candidates, list);
    renderCandidateList(els.mobileCandidates, list);
  }

  function renderMobileStatus() {
    const text = turnText();
    if (els.mobileTurnLabel) els.mobileTurnLabel.textContent = text;
    if (els.mobileThinkingBadge) els.mobileThinkingBadge.textContent = cpuThinking ? "CPU思考中" : "待機中";
    if (els.mobileSettingsTurn) els.mobileSettingsTurn.textContent = text;
    if (els.mobileLevelLabel) els.mobileLevelLabel.textContent = levelName();
    if (els.mobileTitleBtn) els.mobileTitleBtn.classList.toggle("hidden", !state.gameOver);
  }

  function render() {
    updateActiveClock();
    if (els.gamePopup) {
      els.gamePopup.textContent = state.gameOver ? state.message : "";
      els.gamePopup.classList.toggle("hidden", !state.gameOver);
    }
    if (els.gameTitleBtn) els.gameTitleBtn.classList.toggle("hidden", !state.gameOver);
    els.thinkingBadge.textContent = cpuThinking ? "\u8aad\u3093\u3067\u3044\u307e\u3059" : "\u5f85\u6a5f\u4e2d";

    const steps = [
      () => renderBoardInto(els.board, state, true),
      () => renderKomadai(playerSide, els.blackHand, state, true),
      () => renderKomadai(cpuSide, els.whiteHand, state, true),
      () => renderKifuTo(els.kifuList, els.moveCount, state.history),
      () => renderKifuTo(els.mobileKifuList, els.mobileMoveCount, state.history),
      updateEval,
      renderCandidates,
      renderMobileStatus,
      save
    ];

    for (const step of steps) {
      try {
        step();
      } catch (error) {
        console.error(error);
      }
    }
  }

  function selectDrop(type) {
    if (state.turn !== playerSide || state.gameOver || cpuThinking) return;
    selected = null;
    selectedDrop = type;
    legalTargets = previewDropsFor(state, playerSide, type);
    render();
  }

  async function onSquareClick(r, c) {
    if (state.turn !== playerSide || state.gameOver || cpuThinking) return;
    const targetMove = legalTargets.find(m => m.to.r === r && m.to.c === c);
    if (targetMove) {
      commitPlayerMove(targetMove);
      return;
    }

    if (selectedDrop === "P" && !state.board[r][c]) {
      const illegalPawnDrop = { drop: true, piece: "P", to: { r, c } };
      if (window.ShogiRules.isPawnDropMate(state, playerSide, illegalPawnDrop)) {
        await finishGame(`打ち歩詰めは反則です。${sideName(playerSide)}の負けです。`);
        return;
      }
    }

    const p = state.board[r][c];
    if (p && p.owner === playerSide) {
      selected = { r, c };
      selectedDrop = null;
      legalTargets = previewMovesFrom(state, r, c);
    } else {
      clearSelection();
    }
    render();
  }

  async function choosePromotion(move, strictCandidates) {
    if (move.drop || !move.from) return move;
    const p = state.board[move.from.r][move.from.c];
    if (!window.ShogiPieces.canPromote(p, move.from.r, move.to.r) || move.promote) return move;
    const sameDest = strictCandidates.filter(m => !m.drop && m.to.r === move.to.r && m.to.c === move.to.c);
    if (sameDest.length > 1) {
      const promote = await askModal({
        title: "成りますか？",
        message: "この駒は成ることができます。",
        okText: "成る",
        cancelText: "成らない",
        reverseButtons: true,
        tone: "classic"
      });
      if (promote) return sameDest.find(m => m.promote) || move;
    }
    return move;
  }

  async function commitPlayerMove(move) {
    lastCpuChoiceCandidates = [];
    lastCpuChoicePly = -1;
    if (move.drop && move.piece === "P" && window.ShogiRules.isPawnDropMate(state, playerSide, move)) {
      await finishGame(`打ち歩詰めは反則です。${sideName(playerSide)}の負けです。`);
      return;
    }

    const strictCandidates = strictCandidatesForTarget(move);
    if (!strictCandidates.length) {
      clearSelection();
      state.message = "その手は指せません。";
      render();
      return;
    }

    const strictMove = strictCandidates.find(candidate => !!candidate.promote === !!move.promote) || strictCandidates[0];
    const chosen = await choosePromotion(strictMove, strictCandidates);
    updateActiveClock();
    if (state.clocks && state.clocks[playerSide] <= 0) {
      await finishGame(`${sideName(playerSide)}の時間が切れました。${sideName(cpuSide)}の勝ちです。`);
      return;
    }
    const before = window.ShogiBoard.cloneState(state);
    const enriched = window.ShogiKifu.enrichMove(state, chosen);
    state = window.ShogiBoard.applyMove(state, enriched);
    resetClockAnchor();
    playSound(soundKindForMove(before, enriched, state));
    await afterMove();
    if (!state.gameOver && state.turn === cpuSide) {
      cpuThinking = true;
      cachedCandidates = [];
      cachedCandidateKey = "";
      render();
      setTimeout(cpuMove, 40);
      return;
    }
    render();
  }

  async function finishGame(message) {
    cpuSearchToken++;
    updateActiveClock();
    clearSelection();
    state.gameOver = true;
    state.message = message;
    playSound("end");
    render();
    const review = await askModal({
      title: "対局終了",
      message: `${message}\n\n感想戦に進みますか？`,
      okText: "感想戦へ",
      cancelText: "タイトルに戻る",
      reverseButtons: true,
      tone: "classic"
    });
    if (review) showReview(state.history.length);
    else showTitle();
  }

  async function afterMove() {
    clearSelection();
    const percent = window.ShogiEvaluation.blackPercent(state);
    state.evalHistory.push(percent);
    const side = state.turn;
    if (window.ShogiRules.isCheckmate(state, side)) {
      const winner = sideName(window.ShogiBoard.opponent(side));
      await finishGame(`${sideName(side)}が詰みました。${winner}の勝ちです。`);
    } else if (window.ShogiRules.legalMoves(state, side).length === 0) {
      const winner = sideName(window.ShogiBoard.opponent(side));
      await finishGame(`${sideName(side)}に合法手がありません。${winner}の勝ちです。`);
    }
  }

  async function cpuMove() {
    if (state.turn !== cpuSide || state.gameOver) return;
    const token = ++cpuSearchToken;
    cpuThinking = true;
    cachedCandidates = [];
    cachedCandidateKey = "";
    render();

    setTimeout(async () => {
      try {
        const level = getLevel();
        const profile = currentCpuProfile();
        state.aiProfile = Object.assign({}, state.aiProfile, { [cpuSide]: profile });
        let list = [];
        let move = null;
        if (token !== cpuSearchToken || state.gameOver || state.turn !== cpuSide) return;
        if (level >= 5) {
          try {
            const engineResult = await getEngineBestMove(level);
            if (token !== cpuSearchToken || state.gameOver || state.turn !== cpuSide) return;
            if (engineResult && engineResult.move) {
              list = engineResult.candidates || [];
              move = engineResult.move;
            }
          } catch (error) {
            console.warn("Render engine fallback:", error);
          }
        }
        if (!move) {
          const builtInResult = await getBuiltInBestMove(level, profile, token);
          if (token !== cpuSearchToken || state.gameOver || state.turn !== cpuSide) return;
          list = builtInResult.candidates || [];
          move = builtInResult.move;
        }
        list = list.map(item => Object.assign({}, item, {
          selected: JSON.stringify(item.move) === JSON.stringify(move)
        }));
        move = window.ShogiAI.ensureLegalMove(state, move, level);
        const displayList = list.slice(0, 3);
        displayList.baseState = window.ShogiBoard.cloneState(state);
        renderCandidates(displayList);
        if (shouldCpuResign(state)) {
          await finishGame(`${sideName(cpuSide)}が投了しました。${sideName(playerSide)}の勝ちです。`);
          return;
        }
        if (!move) {
          await finishGame("CPUに合法手がありません。あなたの勝ちです。");
        } else {
          updateActiveClock();
          if (state.clocks && state.clocks[cpuSide] <= 0) {
            await finishGame(`${sideName(cpuSide)}の時間が切れました。${sideName(playerSide)}の勝ちです。`);
            return;
          }
          const before = window.ShogiBoard.cloneState(state);
          const enriched = window.ShogiKifu.enrichMove(state, move);
          state = window.ShogiBoard.applyMove(state, enriched);
          resetClockAnchor();
          playSound(soundKindForMove(before, enriched, state));
          lastCpuChoiceCandidates = displayList;
          lastCpuChoicePly = state.history.length;
          await afterMove();
        }
      } catch (error) {
        console.error(error);
        await finishGame(`CPU処理でエラーが発生しました: ${error.message || error}`);
      } finally {
        cpuThinking = false;
        render();
      }
    }, 20);
  }

  function getBuiltInBestMove(level, profile, token) {
    return new Promise(resolve => {
      if (!window.Worker) {
        const choice = emergencyCpuMove(level);
        resolve({ move: choice.move, candidates: choice.candidates || [], depth: 0, nodes: 0, emergency: true });
        return;
      }

      let settled = false;
      if (!aiWorker) aiWorker = new Worker("js/ai-worker.js?v=78");
      const id = `${Date.now()}-${Math.random()}`;
      const cleanup = () => {
        aiWorkerRequest = null;
      };
      const resetWorker = () => {
        try { if (aiWorker) aiWorker.terminate(); } catch {}
        aiWorker = null;
        aiWorkerRequest = null;
      };
      aiWorkerRequest = id;
      aiWorker.onmessage = event => {
        const payload = event.data || {};
        if (payload.id !== id || settled || aiWorkerRequest !== id) return;
        settled = true;
        cleanup();
        if (!payload.ok) {
          console.warn("AI worker emergency move:", payload.error);
          const choice = emergencyCpuMove(level);
          resolve({ move: choice.move, candidates: choice.candidates || [], depth: 0, nodes: 0, emergency: true });
          return;
        }
        resolve(payload);
      };
      aiWorker.onerror = error => {
        if (settled) return;
        settled = true;
        console.warn("AI worker failed:", error.message || error);
        resetWorker();
        const choice = emergencyCpuMove(level);
        resolve({ move: choice.move, candidates: choice.candidates || [], depth: 0, nodes: 0, emergency: true });
      };
      aiWorker.postMessage({ id, state: window.ShogiBoard.cloneState(state), level, profile, mobile: isMobileAiMode() });

      const fallbackTimeout = isMobileAiMode()
        ? (level >= 9 ? 1800 : level >= 5 ? 1100 : 550)
        : Math.max(2500, 250 + level * 450);
      setTimeout(() => {
        if (settled) return;
        if (token !== cpuSearchToken) {
          settled = true;
          resetWorker();
          resolve({ move: null, candidates: [], canceled: true });
          return;
        }
        settled = true;
        resetWorker();
        const choice = emergencyCpuMove(level);
        resolve({ move: choice.move, candidates: choice.candidates || [], depth: 0, nodes: 0, emergency: true });
      }, fallbackTimeout);
    });
  }

  async function resignGame() {
    if (state.gameOver || cpuThinking) return;
    const ok = await askModal({
      title: "投了しますか？",
      message: "この対局を終了します。",
      okText: "投了する",
      cancelText: "続ける",
      reverseButtons: true,
      tone: "classic"
    });
    if (!ok) return;
    await finishGame(`${sideName(playerSide)}が投了しました。${sideName(cpuSide)}の勝ちです。`);
  }

  function replayStateAt(ply) {
    let replay = window.ShogiBoard.newState();
    replay.version = STATE_VERSION;
    replay.evalHistory = [50];
    replay.aiProfile = cpuProfile ? { [cpuSide]: cpuProfile } : {};
    for (let i = 0; i < ply; i++) {
      replay = window.ShogiBoard.applyMove(replay, reviewHistory[i]);
      replay.evalHistory.push(window.ShogiEvaluation.blackPercent(replay));
    }
    replay.history = reviewHistory.slice(0, ply);
    replay.gameOver = false;
    return replay;
  }

  function renderReview() {
    const replay = replayStateAt(reviewPly);
    renderBoardInto(els.reviewBoard, replay, false);
    renderKomadai(playerSide, els.reviewBlackHand, replay, false);
    renderKomadai(cpuSide, els.reviewWhiteHand, replay, false);
    renderKifuTo(els.reviewKifuList, els.reviewMoveCount, reviewHistory, reviewPly);
    els.reviewPlyLabel.textContent = `${reviewPly} / ${reviewHistory.length}?`;
    const percent = playerPercentFromBlack(replay.evalHistory[replay.evalHistory.length - 1] || 50);
    els.reviewEvalText.textContent = playerEvalLabel(percent);
    window.ShogiGraph.draw(els.reviewEvalGraph, playerEvalValues(replay.evalHistory));
  }

  function showTitle() {
    closeMobileSheet();
    els.titleScreen.classList.remove("hidden");
    els.gameScreen.classList.add("hidden");
    els.reviewScreen.classList.add("hidden");
    if (els.licenseScreen) els.licenseScreen.classList.add("hidden");
  }

  function showGame() {
    els.titleScreen.classList.add("hidden");
    els.gameScreen.classList.remove("hidden");
    els.reviewScreen.classList.add("hidden");
    if (els.licenseScreen) els.licenseScreen.classList.add("hidden");
  }

  function showReview(ply) {
    reviewHistory = state.history.slice();
    reviewPly = Math.max(0, Math.min(ply, reviewHistory.length));
    els.titleScreen.classList.add("hidden");
    els.gameScreen.classList.add("hidden");
    els.reviewScreen.classList.remove("hidden");
    if (els.licenseScreen) els.licenseScreen.classList.add("hidden");
    renderReview();
  }

  function showLicense() {
    closeMobileSheet();
    els.titleScreen.classList.add("hidden");
    els.gameScreen.classList.add("hidden");
    els.reviewScreen.classList.add("hidden");
    els.licenseScreen.classList.remove("hidden");
  }

  function startGame() {
    unlockAudio();
    cpuSearchToken++;
    playerSide = Math.random() < 0.5 ? "b" : "w";
    cpuSide = window.ShogiBoard.opponent(playerSide);
    legalPreviewEnabled = true;
    els.gameLevelLabel.textContent = levelLabel();
    if (els.mobileLevelLabel) els.mobileLevelLabel.textContent = levelName();
    state = window.ShogiBoard.newState();
    state.version = STATE_VERSION;
    state.clocks = { b: INITIAL_CLOCK_SECONDS, w: INITIAL_CLOCK_SECONDS, lastAt: Date.now() };
    cpuProfile = createCpuProfile(getLevel());
    state.aiProfile = { [cpuSide]: cpuProfile };
    clearSelection();
    showGame();
    render();
    if (state.turn === cpuSide) setTimeout(cpuMove, 120);
  }

  function resumeFromReview() {
    cpuSearchToken++;
    state = replayStateAt(reviewPly);
    state.version = STATE_VERSION;
    state.clocks = { b: INITIAL_CLOCK_SECONDS, w: INITIAL_CLOCK_SECONDS, lastAt: Date.now() };
    if (!cpuProfile) cpuProfile = createCpuProfile(getLevel());
    state.aiProfile = { [cpuSide]: cpuProfile };
    state.message = "";
    state.gameOver = false;
    clearSelection();
    showGame();
    render();
    if (state.turn === cpuSide) setTimeout(cpuMove, 120);
  }

  function bindReviewControls() {
    els.reviewFirstBtn.addEventListener("click", () => { reviewPly = 0; renderReview(); });
    els.reviewPrevBtn.addEventListener("click", () => { reviewPly = Math.max(0, reviewPly - 1); renderReview(); });
    els.reviewNextBtn.addEventListener("click", () => { reviewPly = Math.min(reviewHistory.length, reviewPly + 1); renderReview(); });
    els.reviewLastBtn.addEventListener("click", () => { reviewPly = reviewHistory.length; renderReview(); });
    els.reviewRestartBtn.addEventListener("click", resumeFromReview);
    els.reviewTitleBtn.addEventListener("click", showTitle);
  }

  function openMobileSheet(kind) {
    const titles = {
      kifu: "棋譜",
      candidates: "AI候補",
      graph: "評価グラフ",
      settings: "設定"
    };
    const panels = {
      kifu: els.mobilePanelKifu,
      candidates: els.mobilePanelCandidates,
      graph: els.mobilePanelGraph,
      settings: els.mobilePanelSettings
    };
    if (!els.mobileSheet || !panels[kind]) return;
    els.mobileSheetTitle.textContent = titles[kind] || "";
    Object.values(panels).forEach(panel => panel.classList.add("hidden"));
    panels[kind].classList.remove("hidden");
    els.mobileSheet.classList.remove("hidden");
    if (kind === "graph" && els.mobileEvalGraph) window.ShogiGraph.draw(els.mobileEvalGraph, playerEvalValues(state.evalHistory));
  }

  function closeMobileSheet() {
    if (els.mobileSheet) els.mobileSheet.classList.add("hidden");
  }

  function bindMobileControls() {
    document.querySelectorAll("[data-mobile-panel]").forEach(button => {
      button.addEventListener("click", () => openMobileSheet(button.dataset.mobilePanel));
    });
    if (els.mobileSheetClose) els.mobileSheetClose.addEventListener("click", closeMobileSheet);
    document.querySelectorAll("[data-mobile-close]").forEach(node => {
      node.addEventListener("click", closeMobileSheet);
    });
    if (els.mobileResignBtn) els.mobileResignBtn.addEventListener("click", resignGame);
    if (els.mobileTitleBtn) els.mobileTitleBtn.addEventListener("click", showTitle);
  }

  function init() {
    [
      "titleScreen", "gameScreen", "reviewScreen", "licenseScreen", "titleLevelSelect", "startGameBtn", "titleLicenseBtn", "licenseTitleBtn",
      "board", "blackHand", "whiteHand", "gamePopup", "kifuList", "moveCount",
      "blackPercent", "whitePercent", "meterFill", "gameLevelLabel", "resignBtn", "gameTitleBtn",
      "candidates", "thinkingBadge", "reviewBoard", "reviewBlackHand", "reviewWhiteHand",
      "reviewKifuList", "reviewMoveCount", "reviewPlyLabel", "reviewEvalText",
      "reviewEvalGraph", "reviewFirstBtn", "reviewPrevBtn", "reviewNextBtn",
      "reviewLastBtn", "reviewRestartBtn", "reviewTitleBtn", "modalOverlay",
      "modalTitle", "modalMessage", "modalOkBtn", "modalCancelBtn",
      "mobileSheet", "mobileSheetTitle", "mobileSheetClose", "mobileKifuList",
      "mobileMoveCount", "mobileCandidates", "mobileThinkingBadge",
      "mobileEvalGraph", "mobileEvalText", "mobileLevelLabel",
      "mobileSettingsTurn", "mobileResignBtn", "mobileTitleBtn", "mobileTurnLabel",
      "mobilePanelKifu", "mobilePanelCandidates", "mobilePanelGraph",
      "mobilePanelSettings"
    ].forEach(id => els[id] = $(id));

    state = window.ShogiBoard.newState();
    state.version = STATE_VERSION;
    bindAudioUnlock();
    els.startGameBtn.addEventListener("click", startGame);
    if (els.titleLicenseBtn) els.titleLicenseBtn.addEventListener("click", showLicense);
    els.licenseTitleBtn.addEventListener("click", showTitle);
    els.resignBtn.addEventListener("click", resignGame);
    els.gameTitleBtn.addEventListener("click", showTitle);
    bindReviewControls();
    bindMobileControls();
    startClockTimer();
    showTitle();
  }

  document.addEventListener("DOMContentLoaded", init);
})();

