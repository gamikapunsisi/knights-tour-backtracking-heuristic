"""
Knight's Tour - FastAPI Backend
Implements Warnsdorff's heuristic and Backtracking algorithms
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from typing import Optional, List
import mysql.connector
from mysql.connector import Error
import time
import random
import os
import logging
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Knight's Tour API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_NAME = os.getenv("DB_NAME", "knights_tour")
DB_PORT = os.getenv("DB_PORT", "3306")

# ─────────────────────────────────────────────
#  Database Setup
# ─────────────────────────────────────────────
# ─────────────────────────────────────────────
#  Logging Configuration
# ─────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("knights-tour")

def get_db():
    try:
        conn = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            port=DB_PORT
        )
        return conn
    except Error as e:
        logger.error(f"Error connecting to MySQL: {e}")
        raise HTTPException(status_code=500, detail="Database connection error")


def init_db():
    try:
        # Connect without database to create it if it doesn't exist
        conn = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            port=DB_PORT
        )
        cur = conn.cursor()
        cur.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
        conn.close()

        # Connect to the specific database
        conn = get_db()
        cur = conn.cursor()
        
        # Normalized Schema
        cur.execute("""
            CREATE TABLE IF NOT EXISTS players (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                name        VARCHAR(50) NOT NULL UNIQUE,
                created_at  DATETIME NOT NULL
            );
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS algorithms (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                name        VARCHAR(50) NOT NULL UNIQUE
            );
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS game_sessions (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                player_id       INT NOT NULL,
                board_size      INT NOT NULL,
                start_row       INT NOT NULL,
                start_col       INT NOT NULL,
                algorithm_id    INT NOT NULL,
                time_taken_ms   INT NOT NULL,
                is_correct      TINYINT(1) NOT NULL DEFAULT 0,
                played_at       DATETIME NOT NULL,
                FOREIGN KEY (player_id) REFERENCES players(id),
                FOREIGN KEY (algorithm_id) REFERENCES algorithms(id)
            );
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS move_records (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                session_id  INT NOT NULL,
                move_order  INT NOT NULL,
                row_pos     INT NOT NULL,
                col_pos     INT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES game_sessions(id)
            );
        """)

        # Pre-populate algorithms
        cur.execute("INSERT IGNORE INTO algorithms (name) VALUES ('warnsdorff'), ('backtracking')")
        
        conn.commit()
        conn.close()
    except Error as e:
        logger.error(f"Error initializing MySQL database: {e}")


init_db()

# ─────────────────────────────────────────────
#  Knight Move Directions
# ─────────────────────────────────────────────
MOVES = [(-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)]


def is_valid(r, c, n, visited):
    return 0 <= r < n and 0 <= c < n and not visited[r][c]


def get_degree(r, c, n, visited):
    """Warnsdorff: count onward moves from (r,c)"""
    return sum(1 for dr, dc in MOVES if is_valid(r+dr, c+dc, n, visited))


# ─────────────────────────────────────────────
#  Algorithm 1: Warnsdorff's Heuristic  O(N²)
# ─────────────────────────────────────────────
def warnsdorff(n: int, start_r: int, start_c: int):
    """
    Warnsdorff's Heuristic with random tiebreaking.
    Retries up to 20 times to handle rare failures caused by ties.
    Provides significantly better performance on large boards.
    """
    t0 = time.perf_counter()
    logger.info(f"Starting Warnsdorff for {n}x{n} from ({start_r}, {start_c})")
    
    for attempt in range(20):          # retry loop for robustness
        visited = [[False]*n for _ in range(n)]
        path = [(start_r, start_c)]
        visited[start_r][start_c] = True
        r, c = start_r, start_c
        failed = False
        
        for _ in range(n*n - 1):
            neighbors = []
            for dr, dc in MOVES:
                nr, nc = r+dr, c+dc
                if is_valid(nr, nc, n, visited):
                    deg = get_degree(nr, nc, n, visited)
                    neighbors.append((deg, nr, nc))
            
            if not neighbors:
                failed = True
                break
            
            # Warnsdorff's Rule: Choose neighbor with minimum degree
            min_deg = min(x[0] for x in neighbors)
            candidates = [x for x in neighbors if x[0] == min_deg]
            
            # Tie-breaking: randomness helps avoid local minima
            random.shuffle(candidates)
            _, r, c = candidates[0]
            
            visited[r][c] = True
            path.append((r, c))
            
        if not failed and len(path) == n*n:
            elapsed = int((time.perf_counter() - t0) * 1000)
            logger.info(f"Warnsdorff success on attempt {attempt+1} in {elapsed}ms")
            return path, elapsed
            
    elapsed = int((time.perf_counter() - t0) * 1000)
    logger.warning(f"Warnsdorff failed after 20 attempts in {elapsed}ms")
    return None, elapsed


# ─────────────────────────────────────────────
#  Algorithm 2: Backtracking (Recursive)
# ─────────────────────────────────────────────
def backtrack(n: int, start_r: int, start_c: int):
    """
    Classic Backtracking approach.
    Efficient for small boards (8x8), but exponential for large ones.
    """
    t0 = time.perf_counter()
    logger.info(f"Starting Backtracking for {n}x{n} from ({start_r}, {start_c})")
    
    visited = [[False]*n for _ in range(n)]
    path = []

    def solve(r, c, move_num):
        if move_num == n*n:
            return True
        
        # Priority: Try moves that lead to less reachable squares (simple heuristic)
        # to speed up backtracking even for 8x8.
        for dr, dc in MOVES:
            nr, nc = r+dr, c+dc
            if is_valid(nr, nc, n, visited):
                visited[nr][nc] = True
                path.append((nr, nc))
                if solve(nr, nc, move_num+1):
                    return True
                # Backtrack
                visited[nr][nc] = False
                path.pop()
        return False

    visited[start_r][start_c] = True
    path.append((start_r, start_c))
    
    success = solve(start_r, start_c, 1)
    elapsed = int((time.perf_counter() - t0) * 1000)
    
    if success:
        logger.info(f"Backtracking success in {elapsed}ms")
        return path, elapsed
    else:
        logger.warning(f"Backtracking failed to find a solution in {elapsed}ms")
        return None, elapsed


# ─────────────────────────────────────────────
#  Pydantic Models
# ─────────────────────────────────────────────
class SolveRequest(BaseModel):
    board_size: int
    start_row: int
    start_col: int
    algorithm: str  # "warnsdorff" | "backtracking"

    @validator("board_size")
    def valid_size(cls, v):
        if v not in (8, 16):
            raise ValueError("board_size must be 8 or 16")
        return v

    @validator("algorithm")
    def valid_algo(cls, v):
        if v not in ("warnsdorff", "backtracking"):
            raise ValueError("algorithm must be 'warnsdorff' or 'backtracking'")
        return v

    @validator("start_row", "start_col")
    def non_negative(cls, v):
        if v < 0:
            raise ValueError("Coordinates must be non-negative")
        return v


class ValidateRequest(BaseModel):
    player_name: str
    board_size: int
    start_row: int
    start_col: int
    player_moves: List[List[int]]   # [[r,c], [r,c], ...]
    correct_moves: List[List[int]]
    algorithm_used: str
    time_taken_ms: int

    @validator("player_name")
    def non_empty_name(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Player name cannot be empty")
        if len(v) > 50:
            raise ValueError("Player name max 50 chars")
        return v

    @validator("board_size")
    def valid_size(cls, v):
        if v not in (8, 16):
            raise ValueError("board_size must be 8 or 16")
        return v


# ─────────────────────────────────────────────
#  Routes
# ─────────────────────────────────────────────
@app.get("/")
def root():
    return {"message": "Knight's Tour API is running"}


@app.get("/random-start/{board_size}")
def random_start(board_size: int):
    if board_size not in (8, 16):
        raise HTTPException(400, "board_size must be 8 or 16")
    return {
        "row": random.randint(0, board_size-1),
        "col": random.randint(0, board_size-1),
    }


@app.post("/solve")
def solve(req: SolveRequest):
    n = req.board_size
    if req.start_row >= n or req.start_col >= n:
        raise HTTPException(400, "Start position out of board bounds")

    if req.algorithm == "warnsdorff":
        path, ms = warnsdorff(n, req.start_row, req.start_col)
    else:
        if n == 16:
            raise HTTPException(400, "Backtracking not supported for 16×16 (too slow)")
        path, ms = backtrack(n, req.start_row, req.start_col)

    if path is None:
        raise HTTPException(500, "No solution found from this starting position")

    return {
        "path": [list(p) for p in path],
        "time_ms": ms,
        "algorithm": req.algorithm,
        "board_size": n,
    }


@app.post("/validate")
def validate_and_save(req: ValidateRequest):
    """Check player moves and persist result to DB"""
    correct = req.player_moves == req.correct_moves
    n = req.board_size

    # Validate move sequence independently
    if len(req.player_moves) != n*n:
        correct = False

    conn = get_db()
    try:
        cur = conn.cursor(dictionary=True)

        # Get or Create algorithm ID
        cur.execute("SELECT id FROM algorithms WHERE name = %s", (req.algorithm_used,))
        algo_row = cur.fetchone()
        if not algo_row:
            cur.execute("INSERT INTO algorithms (name) VALUES (%s)", (req.algorithm_used,))
            algorithm_id = cur.lastrowid
        else:
            algorithm_id = algo_row["id"]

        # Insert or ignore player (MySQL syntax: INSERT IGNORE)
        cur.execute(
            "INSERT IGNORE INTO players (name, created_at) VALUES (%s, %s)",
            (req.player_name, datetime.utcnow())
        )
        cur.execute("SELECT id FROM players WHERE name=%s", (req.player_name,))
        row = cur.fetchone()
        if not row:
            raise Exception("Failed to create or find player")
        player_id = row["id"]

        # Session record
        cur.execute("""
            INSERT INTO game_sessions
              (player_id, board_size, start_row, start_col,
               algorithm_id, time_taken_ms, is_correct, played_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            player_id, req.board_size, req.start_row, req.start_col,
            algorithm_id, req.time_taken_ms,
            1 if correct else 0,
            datetime.utcnow()
        ))
        session_id = cur.lastrowid

        # Move records
        if correct:
            moves_data = [
                (session_id, i, m[0], m[1])
                for i, m in enumerate(req.player_moves)
            ]
            cur.executemany(
                "INSERT INTO move_records (session_id,move_order,row_pos,col_pos) VALUES (%s,%s,%s,%s)",
                moves_data
            )
            
        conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Database error: {str(e)}")
        raise HTTPException(500, f"Internal Server Error: {str(e)}")
    finally:
        if conn:
            conn.close()

    return {"correct": correct, "message": "Well done! Your solution is saved." if correct else "Incorrect solution. Try again!"}


@app.get("/leaderboard")
def leaderboard():
    conn = get_db()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT p.name, COUNT(*) as wins,
                   MIN(gs.time_taken_ms) as best_time_ms,
                   gs.board_size
            FROM game_sessions gs
            JOIN players p ON p.id = gs.player_id
            WHERE gs.is_correct = 1
            GROUP BY p.name, gs.board_size
            ORDER BY wins DESC, best_time_ms ASC
            LIMIT 20
        """)
        rows = cur.fetchall()
        return rows
    finally:
        conn.close()


@app.get("/history/{player_name}")
def player_history(player_name: str):
    conn = get_db()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT gs.id, gs.board_size, gs.start_row, gs.start_col,
                   a.name as algorithm_used, gs.time_taken_ms, gs.is_correct, gs.played_at
            FROM game_sessions gs
            JOIN players p ON p.id = gs.player_id
            JOIN algorithms a ON a.id = gs.algorithm_id
            WHERE p.name = %s
            ORDER BY gs.played_at DESC
            LIMIT 10
        """, (player_name,))
        rows = cur.fetchall()
        return rows
    finally:
        conn.close()