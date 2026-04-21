import { useState, useEffect, useCallback, useRef } from "react";

// ── API base ──────────────────────────────────────────────────────────────────
const API = "http://localhost:8000";

// ── Knight SVG ────────────────────────────────────────────────────────────────
const KnightIcon = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill={color}>
    <path d="M30 85 L70 85 L65 65 Q80 55 75 35 Q65 10 40 15 Q25 20 28 40 L20 50 L35 50 L30 65 Z" />
    <circle cx="55" cy="28" r="5" fill="#1a1a2e" />
  </svg>
);

// ── Knight move directions ─────────────────────────────────────────────────────
const MOVES = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];

function validKnightMove(r1, c1, r2, c2) {
  const dr = Math.abs(r2 - r1), dc = Math.abs(c2 - c1);
  return (dr === 1 && dc === 2) || (dr === 2 && dc === 1);
}

function getReachable(r, c, n, visited) {
  return MOVES
    .map(([dr, dc]) => [r + dr, c + dc])
    .filter(([nr, nc]) =>
      nr >= 0 && nr < n && nc >= 0 && nc < n && !visited[`${nr},${nc}`]
    );
}

// ── Toast notification ────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = { success: "#00d4aa", error: "#ff4757", info: "#ffd700" };
  return (
    <div style={{
      position: "fixed", top: 24, right: 24, zIndex: 9999,
      background: "#1a1a3e", border: `2px solid ${colors[type] || colors.info}`,
      color: "#fff", borderRadius: 12, padding: "14px 20px", maxWidth: 340,
      boxShadow: `0 0 30px ${colors[type]}44`, fontSize: 15,
      animation: "slideIn .3s ease", display: "flex", alignItems: "center", gap: 10,
    }}>
      <span>{msg}</span>
      <button onClick={onClose} style={{
        background: "none", border: "none", color: "#aaa",
        cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 0,
      }}>×</button>
    </div>
  );
}

// ── Confetti ──────────────────────────────────────────────────────────────────
function Confetti() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 8888 }}>
      {Array.from({ length: 70 }).map((_, i) => (
        <div key={i} style={{
          position: "absolute",
          left: `${Math.random() * 100}%`,
          top: "-12px",
          width: 10, height: 10,
          borderRadius: Math.random() > 0.5 ? "50%" : 2,
          background: ["#ffd700","#00d4aa","#ff6b9d","#a78bfa","#60a5fa","#fb923c"][i % 6],
          animation: `fall ${1.5 + Math.random() * 2}s linear ${Math.random() * 1.5}s forwards`,
          transform: `rotate(${Math.random() * 360}deg)`,
        }} />
      ))}
    </div>
  );
}

// ── Global CSS ────────────────────────────────────────────────────────────────
const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d0d1a; font-family: 'Cinzel', Georgia, serif; color: #e0e0e0; }
  button { font-family: 'Cinzel', Georgia, serif; }
  input  { font-family: 'Cinzel', Georgia, serif; }
  button:hover:not(:disabled) { opacity: .88; transform: translateY(-1px); }
  button:active:not(:disabled) { transform: translateY(0); }
  button:disabled { opacity: .4; cursor: not-allowed !important; }

  @keyframes slideIn {
    from { transform: translateX(120%); opacity: 0; }
    to   { transform: translateX(0);   opacity: 1; }
  }
  @keyframes fall {
    to { transform: translateY(110vh) rotate(720deg); opacity: 0; }
  }
  @keyframes pulse {
    0%,100% { opacity: 1; }
    50%      { opacity: .5; }
  }
  @keyframes glow {
    0%,100% { box-shadow: 0 0 10px #ffd70066; }
    50%      { box-shadow: 0 0 30px #ffd700cc; }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0d0d1a; }
  ::-webkit-scrollbar-thumb { background: #2a2a5e; border-radius: 3px; }
`;

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN APP
// ═════════════════════════════════════════════════════════════════════════════
export default function KnightsTour() {

  // ── screens: menu | setup | game | leaderboard ───────────────────────────
  const [screen,      setScreen]      = useState("menu");
  const [boardSize,   setBoardSize]   = useState(8);
  const [algorithm,   setAlgorithm]   = useState("warnsdorff");
  const [playerName,  setPlayerName]  = useState("");
  const [nameError,   setNameError]   = useState("");

  const [startPos,    setStartPos]    = useState(null);
  const [solution,    setSolution]    = useState([]);
  const [solveTimeMs, setSolveTimeMs] = useState(0);

  const [playerPath,  setPlayerPath]  = useState([]);
  const [visited,     setVisited]     = useState({});
  const [highlighted, setHighlighted] = useState([]);
  const [gameStatus,  setGameStatus]  = useState("playing"); // playing | won | lost

  const [loading,      setLoading]      = useState(false);
  const [toast,        setToast]        = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [leaderboard,  setLeaderboard]  = useState([]);
  const [elapsedMs,    setElapsedMs]    = useState(0);

  const timerRef     = useRef(null);
  const startTimeRef = useRef(null);

  // ── Timer helpers ─────────────────────────────────────────────────────────
  const startTimer = () => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(
      () => setElapsedMs(Date.now() - startTimeRef.current), 200
    );
  };
  const stopTimer = () => clearInterval(timerRef.current);
  useEffect(() => () => clearInterval(timerRef.current), []);

  const showToast = useCallback((msg, type = "info") => setToast({ msg, type }), []);

  // ── Fetch solution from backend ───────────────────────────────────────────
  const fetchSolution = async (size, row, col, algo) => {
    const res = await fetch(`${API}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        board_size: size, start_row: row, start_col: col, algorithm: algo,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Solve failed");
    }
    return res.json();
  };

  // ── Start game ────────────────────────────────────────────────────────────
  const startGame = async () => {
    const name = playerName.trim();
    if (!name)          { setNameError("Name is required");       return; }
    if (name.length > 50) { setNameError("Maximum 50 characters"); return; }
    setNameError("");
    setLoading(true);

    try {
      // 1. Random start position from backend
      const posRes = await fetch(`${API}/random-start/${boardSize}`);
      if (!posRes.ok) throw new Error("Could not get random start");
      const { row, col } = await posRes.json();
      setStartPos({ row, col });

      // 2. Solve
      const data = await fetchSolution(boardSize, row, col, algorithm);
      setSolution(data.path);
      setSolveTimeMs(data.time_ms);

      // 3. Init board state
      const initVisited = { [`${row},${col}`]: 1 };
      setVisited(initVisited);
      setPlayerPath([[row, col]]);
      setHighlighted(
        getReachable(row, col, boardSize, initVisited).map(([r,c]) => `${r},${c}`)
      );
      setGameStatus("playing");
      setElapsedMs(0);
      startTimer();
      setScreen("game");

    } catch (e) {
      showToast(e.message || "Failed to start game", "error");
    } finally {
      setLoading(false);
    }
  };

  // ── Handle cell click ─────────────────────────────────────────────────────
  const handleCellClick = useCallback((r, c) => {
    if (gameStatus !== "playing") return;
    const key  = `${r},${c}`;
    const last = playerPath[playerPath.length - 1];
    const [lr, lc] = last;

    // Clicking current cell = undo last move
    if (r === lr && c === lc && playerPath.length > 1) {
      const newPath    = playerPath.slice(0, -1);
      const newVisited = { ...visited };
      delete newVisited[key];
      const [nr, nc]   = newPath[newPath.length - 1];
      setPlayerPath(newPath);
      setVisited(newVisited);
      setHighlighted(
        getReachable(nr, nc, boardSize, newVisited).map(([rr,cc]) => `${rr},${cc}`)
      );
      return;
    }

    // Already visited = ignore
    if (visited[key]) return;

    // Validate knight move
    if (!validKnightMove(lr, lc, r, c)) {
      showToast("Invalid move! Knights move in an L-shape (2+1 squares).", "error");
      return;
    }

    const newPath    = [...playerPath, [r, c]];
    const newVisited = { ...visited, [key]: newPath.length };
    setPlayerPath(newPath);
    setVisited(newVisited);

    const reachable = getReachable(r, c, boardSize, newVisited);

    // Win condition
    if (newPath.length === boardSize * boardSize) {
      stopTimer();
      const finalMs = Date.now() - startTimeRef.current;
      setElapsedMs(finalMs);
      setGameStatus("won");
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
      saveResult(newPath, true, finalMs);
      return;
    }

    // Stuck
    if (reachable.length === 0) {
      stopTimer();
      setGameStatus("lost");
      showToast("No more moves! The knight is stuck.", "error");
      return;
    }

    setHighlighted(reachable.map(([rr,cc]) => `${rr},${cc}`));
  }, [gameStatus, playerPath, visited, boardSize, showToast]);

  // ── Save result to backend ────────────────────────────────────────────────
  const saveResult = async (moves, isCorrect, ms) => {
    try {
      await fetch(`${API}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_name:    playerName.trim(),
          board_size:     boardSize,
          start_row:      startPos.row,
          start_col:      startPos.col,
          player_moves:   moves,
          correct_moves:  solution,
          algorithm_used: algorithm,
          time_taken_ms:  ms,
        }),
      });
    } catch { /* silent — don't break UX */ }
  };

  // ── Undo one move ─────────────────────────────────────────────────────────
  const undoMove = () => {
    if (playerPath.length <= 1 || gameStatus !== "playing") return;
    const newPath    = playerPath.slice(0, -1);
    const newVisited = { ...visited };
    const [lr, lc]   = playerPath[playerPath.length - 1];
    delete newVisited[`${lr},${lc}`];
    const [nr, nc]   = newPath[newPath.length - 1];
    setPlayerPath(newPath);
    setVisited(newVisited);
    setHighlighted(
      getReachable(nr, nc, boardSize, newVisited).map(([rr,cc]) => `${rr},${cc}`)
    );
  };

  // ── Reveal solution ───────────────────────────────────────────────────────
  const showSolution = () => {
    stopTimer();
    setGameStatus("lost");
    showToast("Correct solution is now shown in teal.", "info");
  };

  // ── Restart ───────────────────────────────────────────────────────────────
  const restart = () => {
    stopTimer();
    setPlayerPath([]);
    setVisited({});
    setHighlighted([]);
    setSolution([]);
    setGameStatus("playing");
    setShowConfetti(false);
    setScreen("setup");
  };

  // ── Load leaderboard ──────────────────────────────────────────────────────
  const loadLeaderboard = async () => {
    try {
      const res = await fetch(`${API}/leaderboard`);
      setLeaderboard(await res.json());
    } catch {
      setLeaderboard([]);
      showToast("Could not load leaderboard", "error");
    }
    setScreen("leaderboard");
  };

  // ── Board helpers ─────────────────────────────────────────────────────────
  const cellSize   = boardSize === 8 ? 64 : 33;
  const totalCells = boardSize * boardSize;
  const progress   = playerPath.length > 0
    ? Math.round((playerPath.length / totalCells) * 100) : 0;

  const getCellInfo = (r, c) => {
    const key      = `${r},${c}`;
    const moveNum  = visited[key];
    const isLast   = playerPath.length > 0 &&
                     playerPath[playerPath.length - 1][0] === r &&
                     playerPath[playerPath.length - 1][1] === c;
    const isStart  = startPos && r === startPos.row && c === startPos.col;
    const isHint   = highlighted.includes(key) && gameStatus === "playing";
    const solIdx   = solution.findIndex(([sr, sc]) => sr === r && sc === c);
    const showSol  = gameStatus === "lost" && solIdx >= 0 && !moveNum;
    const light    = (r + c) % 2 === 0;
    return { key, moveNum, isLast, isStart, isHint, solIdx, showSol, light };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCREEN: MENU
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === "menu") return (
    <div style={S.page}>
      <style>{globalCSS}</style>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div style={S.card}>
        {/* Decorative border corners */}
        <div style={S.cornerTL} /><div style={S.cornerTR} />
        <div style={S.cornerBL} /><div style={S.cornerBR} />

        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <KnightIcon size={72} color="#ffd700" />
        </div>
        <h1 style={S.bigTitle}>Knight's Tour</h1>
        <p style={S.tagline}>
          Move the knight to visit every square on the board — exactly once.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 32 }}>
          <button style={S.goldBtn} onClick={() => setScreen("setup")}>
            ▶ &nbsp; Play Game
          </button>
          <button style={S.outlineBtn("#a78bfa")} onClick={loadLeaderboard}>
            🏆 &nbsp; Leaderboard
          </button>
        </div>

        <p style={{ color: "#444", fontSize: 12, textAlign: "center", marginTop: 28 }}>
          Supports 8×8 and 16×16 boards
        </p>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCREEN: LEADERBOARD
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === "leaderboard") return (
    <div style={S.page}>
      <style>{globalCSS}</style>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div style={{ ...S.card, maxWidth: 620, width: "100%" }}>
        <div style={S.cornerTL} /><div style={S.cornerTR} />
        <div style={S.cornerBL} /><div style={S.cornerBR} />

        <h2 style={{ ...S.bigTitle, fontSize: 26, marginBottom: 24 }}>
          🏆 Leaderboard
        </h2>

        {leaderboard.length === 0 ? (
          <p style={{ color: "#666", textAlign: "center", padding: "20px 0" }}>
            No wins recorded yet. Be the first!
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Rank","Player","Wins","Best Time","Board"].map(h => (
                    <th key={h} style={{
                      color: "#ffd700", padding: "10px 14px", textAlign: "left",
                      borderBottom: "2px solid #2a2a5e", fontSize: 13,
                      letterSpacing: .5, whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, i) => (
                  <tr key={i} style={{
                    background: i % 2 === 0 ? "#1a1a3a" : "transparent",
                    transition: "background .2s",
                  }}>
                    <td style={S.td}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </td>
                    <td style={{ ...S.td, fontWeight: 600, color: "#e0e0e0" }}>{row.name}</td>
                    <td style={{ ...S.td, color: "#00d4aa" }}>{row.wins}</td>
                    <td style={{ ...S.td, color: "#a78bfa" }}>{row.best_time_ms} ms</td>
                    <td style={S.td}>{row.board_size}×{row.board_size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button style={{ ...S.outlineBtn("#ffd700"), marginTop: 28 }}
          onClick={() => setScreen("menu")}>
          ← Back to Menu
        </button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCREEN: SETUP
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === "setup") return (
    <div style={S.page}>
      <style>{globalCSS}</style>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div style={S.card}>
        <div style={S.cornerTL} /><div style={S.cornerTR} />
        <div style={S.cornerBL} /><div style={S.cornerBR} />

        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <KnightIcon size={44} color="#ffd700" />
        </div>
        <h2 style={{ ...S.bigTitle, fontSize: 24, marginBottom: 28 }}>Game Setup</h2>

        {/* Player Name */}
        <label style={S.label}>Your Name</label>
        <input
          style={{
            ...S.input,
            borderColor: nameError ? "#ff4757" : "#2a2a5e",
          }}
          placeholder="Enter your name…"
          value={playerName}
          maxLength={50}
          onChange={e => { setPlayerName(e.target.value); setNameError(""); }}
          onKeyDown={e => e.key === "Enter" && startGame()}
        />
        {nameError && (
          <p style={{ color: "#ff4757", fontSize: 12, marginTop: 6 }}>⚠ {nameError}</p>
        )}

        {/* Board Size */}
        <label style={{ ...S.label, marginTop: 22 }}>Board Size</label>
        <div style={S.toggleRow}>
          {[8, 16].map(s => (
            <button key={s} onClick={() => {
              setBoardSize(s);
              if (s === 16 && algorithm === "backtracking") setAlgorithm("warnsdorff");
            }} style={{
              ...S.toggleBtn,
              background:   boardSize === s ? "#ffd700"      : "transparent",
              color:        boardSize === s ? "#0d0d1a"      : "#ffd700",
              borderColor:  "#ffd700",
              fontWeight:   boardSize === s ? 700            : 400,
            }}>
              {s}×{s}
            </button>
          ))}
        </div>

        {/* Algorithm */}
        <label style={{ ...S.label, marginTop: 22 }}>Algorithm</label>
        <div style={S.toggleRow}>
          {[
            { id: "warnsdorff",   label: "Warnsdorff's",  sub: "O(N²) · fast",    disabled: false },
            { id: "backtracking", label: "Backtracking",   sub: "8×8 only",        disabled: boardSize === 16 },
          ].map(({ id, label, sub, disabled }) => (
            <button key={id} disabled={disabled} onClick={() => setAlgorithm(id)} style={{
              ...S.toggleBtn,
              background:  algorithm === id && !disabled ? "#a78bfa" : "transparent",
              color:       disabled ? "#444" : algorithm === id ? "#fff" : "#a78bfa",
              borderColor: disabled ? "#333" : "#a78bfa",
              cursor:      disabled ? "not-allowed" : "pointer",
              flexDirection: "column", gap: 2,
            }}>
              <span style={{ fontWeight: 600 }}>{label}</span>
              <span style={{ fontSize: 11, opacity: .7 }}>{sub}</span>
            </button>
          ))}
        </div>

        <button
          style={{ ...S.goldBtn, marginTop: 32 }}
          onClick={startGame}
          disabled={loading}
        >
          {loading ? "Generating board…" : "🎲  Start Game"}
        </button>

        <button
          style={{ ...S.outlineBtn("#555"), marginTop: 12, color: "#888" }}
          onClick={() => setScreen("menu")}
        >
          ← Back
        </button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCREEN: GAME
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === "game") return (
    <div style={{ ...S.page, justifyContent: "flex-start", paddingTop: 20 }}>
      <style>{globalCSS}</style>
      {toast        && <Toast {...toast} onClose={() => setToast(null)} />}
      {showConfetti && <Confetti />}

      {/* ── Header ── */}
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <KnightIcon size={28} color="#ffd700" />
          <span style={{ color: "#ffd700", fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>
            Knight's Tour
          </span>
        </div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
          <span style={S.stat}>👤 {playerName}</span>
          <span style={S.stat}>📐 {boardSize}×{boardSize}</span>
          <span style={S.stat}>⚙ {algorithm === "warnsdorff" ? "Warnsdorff" : "Backtrack"}</span>
          <span style={{ ...S.stat, color: "#ffd700", animation: gameStatus === "playing" ? "pulse 1.5s infinite" : "none" }}>
            ⏱ {(elapsedMs / 1000).toFixed(1)}s
          </span>
          <span style={S.stat}>🔢 {playerPath.length} / {totalCells}</span>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div style={{ width: "100%", maxWidth: 600, margin: "10px auto 4px", background: "#1a1a3e", borderRadius: 8, height: 6, overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 8,
          width: `${progress}%`,
          background: gameStatus === "won"
            ? "linear-gradient(90deg,#00d4aa,#60a5fa)"
            : "linear-gradient(90deg,#ffd700,#ff6b9d)",
          transition: "width .4s ease",
        }} />
      </div>
      <p style={{ color: "#444", fontSize: 11, textAlign: "center", marginBottom: 10 }}>
        {progress}% complete
      </p>

      {/* ── Status banners ── */}
      {gameStatus === "won" && (
        <div style={S.banner("#00d4aa")}>
          🎉 Brilliant! You completed the Knight's Tour in {(elapsedMs/1000).toFixed(2)}s!
          <br />
          <span style={{ fontSize: 13, opacity: .8 }}>Your result has been saved.</span>
        </div>
      )}
      {gameStatus === "lost" && (
        <div style={S.banner("#ff4757")}>
          😞 Knight is stuck! Correct path shown in teal below.
        </div>
      )}

      {/* ── Board ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${boardSize}, ${cellSize}px)`,
        gap: boardSize === 8 ? 3 : 2,
        background: "#080814",
        padding: boardSize === 8 ? 10 : 6,
        borderRadius: 14,
        border: "2px solid #2a2a5e",
        boxShadow: "0 0 60px #ffd70015",
        margin: "0 auto",
        animation: "fadeIn .4s ease",
      }}>
        {Array.from({ length: boardSize }, (_, r) =>
          Array.from({ length: boardSize }, (_, c) => {
            const { key, moveNum, isLast, isStart, isHint, solIdx, showSol, light } = getCellInfo(r, c);

            // Background
            let bg = light ? "#252550" : "#18183a";
            if (moveNum && !isLast)  bg = "#1e2d52";
            if (isLast)              bg = "#3a2e00";
            if (isHint)              bg = "#1a2e1a";
            if (showSol)             bg = "#0d2a22";
            if (isStart && !moveNum) bg = "#2a1a4e";

            // Border
            let border = "2px solid transparent";
            if (isLast)  border = "2px solid #ffd700";
            if (isHint)  border = "2px solid #00d4aa55";
            if (showSol) border = "2px solid #00d4aa44";

            return (
              <div
                key={key}
                onClick={() => handleCellClick(r, c)}
                title={`Row ${r}, Col ${c}${moveNum ? ` — Move #${moveNum}` : ""}`}
                style={{
                  width: cellSize, height: cellSize,
                  background: bg, border, borderRadius: boardSize === 8 ? 6 : 3,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: gameStatus === "playing" ? "pointer" : "default",
                  fontSize: boardSize === 8 ? 14 : 9,
                  fontWeight: 700,
                  color: isLast   ? "#ffd700"
                       : moveNum  ? "#6080c0"
                       : showSol  ? "#00d4aa"
                       : isHint   ? "#00d4aa88"
                       : "#333",
                  userSelect: "none",
                  transition: "background .12s, border .12s",
                  animation: isLast ? "glow 2s infinite" : "none",
                  position: "relative",
                }}>
                {isLast && gameStatus === "playing"
                  ? <KnightIcon size={boardSize === 8 ? 34 : 18} color="#ffd700" />
                  : isLast && gameStatus !== "playing"
                    ? moveNum
                  : moveNum
                    ? moveNum
                  : showSol
                    ? (solIdx + 1)
                  : isHint
                    ? "·"
                  : isStart && playerPath.length === 1
                    ? <KnightIcon size={boardSize === 8 ? 34 : 18} color="#a78bfa" />
                  : null
                }
              </div>
            );
          })
        )}
      </div>

      {/* ── Controls ── */}
      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap", justifyContent: "center" }}>
        {gameStatus === "playing" && <>
          <button style={S.ctrlBtn("#ffd700")} onClick={undoMove}
            disabled={playerPath.length <= 1}>
            ↩ Undo
          </button>
          <button style={S.ctrlBtn("#ff4757")} onClick={showSolution}>
            💡 Show Solution
          </button>
        </>}
        <button style={S.ctrlBtn("#a78bfa")} onClick={restart}>
          🔄 New Game
        </button>
        <button style={S.ctrlBtn("#60a5fa")} onClick={() => { stopTimer(); setScreen("menu"); }}>
          ⬅ Menu
        </button>
      </div>

      {/* ── Algorithm timing ── */}
      <p style={{ color: "#333", fontSize: 11, marginTop: 12, textAlign: "center" }}>
        {algorithm === "warnsdorff" ? "Warnsdorff's Heuristic" : "Backtracking DFS"} solved board in {solveTimeMs} ms
      </p>

      {/* ── Legend ── */}
      {boardSize === 8 && (
        <div style={{ display: "flex", gap: 20, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { color: "#ffd700", label: "Current position" },
            { color: "#6080c0", label: "Visited" },
            { color: "#00d4aa", label: "Reachable / Solution" },
            { color: "#a78bfa", label: "Start" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
              <span style={{ color: "#555", fontSize: 11 }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
//  STYLE TOKENS
// ═════════════════════════════════════════════════════════════════════════════
const S = {
  page: {
    minHeight: "100vh",
    background: "#0d0d1a",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    color: "#e0e0e0",
  },
  card: {
    background: "#111130",
    border: "1px solid #2a2a5e",
    borderRadius: 20,
    padding: "44px 48px",
    maxWidth: 440,
    width: "100%",
    boxShadow: "0 0 80px #ffd70008, 0 20px 60px #00000060",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    animation: "fadeIn .4s ease",
  },
  // Decorative corner accents
  cornerTL: { position:"absolute", top:8,  left:8,  width:20, height:20, borderTop:"2px solid #ffd70066",  borderLeft:"2px solid #ffd70066"  },
  cornerTR: { position:"absolute", top:8,  right:8, width:20, height:20, borderTop:"2px solid #ffd70066",  borderRight:"2px solid #ffd70066" },
  cornerBL: { position:"absolute", bottom:8,left:8, width:20, height:20, borderBottom:"2px solid #ffd70066",borderLeft:"2px solid #ffd70066" },
  cornerBR: { position:"absolute", bottom:8,right:8,width:20, height:20, borderBottom:"2px solid #ffd70066",borderRight:"2px solid #ffd70066"},
  bigTitle: {
    fontSize: 32, fontWeight: 900, color: "#ffd700",
    textAlign: "center", letterSpacing: 2, marginBottom: 8,
  },
  tagline: {
    color: "#666", textAlign: "center", fontSize: 14,
    fontFamily: "'Crimson Text', Georgia, serif", fontStyle: "italic",
    lineHeight: 1.6,
  },
  label: {
    color: "#a78bfa", fontSize: 12, fontWeight: 600,
    letterSpacing: 1, marginBottom: 8, textTransform: "uppercase",
  },
  input: {
    background: "#0d0d2e", border: "1px solid #2a2a5e",
    borderRadius: 8, padding: "13px 16px",
    color: "#fff", fontSize: 15, outline: "none",
    width: "100%", transition: "border-color .2s",
  },
  toggleRow: { display: "flex", gap: 10 },
  toggleBtn: {
    flex: 1, border: "2px solid", borderRadius: 8,
    padding: "12px 10px", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all .2s", fontSize: 14,
  },
  goldBtn: {
    background: "linear-gradient(135deg, #ffd700, #ffaa00)",
    color: "#0d0d1a", border: "none", borderRadius: 10,
    padding: "15px 24px", fontSize: 16, fontWeight: 700,
    cursor: "pointer", transition: "all .2s",
    letterSpacing: .5,
  },
  outlineBtn: (color) => ({
    background: "transparent", border: `2px solid ${color}`,
    color, borderRadius: 10, padding: "13px 24px",
    fontSize: 14, cursor: "pointer", transition: "all .2s",
  }),
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    width: "100%", maxWidth: 680, marginBottom: 12,
    background: "#111130", borderRadius: 12,
    padding: "12px 20px", border: "1px solid #2a2a5e",
    flexWrap: "wrap", gap: 8,
  },
  stat: { color: "#888", fontSize: 13 },
  banner: (color) => ({
    background: `${color}18`, border: `1px solid ${color}55`,
    color, borderRadius: 10, padding: "12px 20px",
    marginBottom: 12, textAlign: "center",
    fontWeight: 600, maxWidth: 580, width: "100%", lineHeight: 1.6,
  }),
  ctrlBtn: (color) => ({
    background: "transparent", border: `2px solid ${color}`,
    color, borderRadius: 8, padding: "10px 18px",
    cursor: "pointer", fontSize: 13, fontWeight: 600,
    transition: "all .2s", letterSpacing: .3,
  }),
  td: { color: "#aaa", padding: "10px 14px", borderBottom: "1px solid #1a1a3a", fontSize: 14 },
};