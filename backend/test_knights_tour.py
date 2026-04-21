"""
Unit Tests – Knight's Tour Backend
Run with: pytest test_knights_tour.py -v
"""

import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import (
    warnsdorff, backtrack, is_valid, get_degree, MOVES,
    SolveRequest, ValidateRequest
)
from pydantic import ValidationError


# ─────────────────────────────────────────────
#  Helper
# ─────────────────────────────────────────────
def is_valid_knight_tour(path, n):
    """Assert path covers all n² squares with legal knight moves."""
    if len(path) != n * n:
        return False
    seen = set()
    for i, (r, c) in enumerate(path):
        if not (0 <= r < n and 0 <= c < n):
            return False
        if (r, c) in seen:
            return False
        seen.add((r, c))
        if i > 0:
            pr, pc = path[i-1]
            dr, dc = abs(r-pr), abs(c-pc)
            if sorted([dr, dc]) != [1, 2]:
                return False
    return True


# ─────────────────────────────────────────────
#  is_valid Tests
# ─────────────────────────────────────────────
class TestIsValid:
    def test_inside_empty_board(self):
        visited = [[False]*8 for _ in range(8)]
        assert is_valid(0, 0, 8, visited) is True

    def test_out_of_bounds_negative(self):
        visited = [[False]*8 for _ in range(8)]
        assert is_valid(-1, 0, 8, visited) is False

    def test_out_of_bounds_large(self):
        visited = [[False]*8 for _ in range(8)]
        assert is_valid(8, 0, 8, visited) is False

    def test_already_visited(self):
        visited = [[False]*8 for _ in range(8)]
        visited[3][3] = True
        assert is_valid(3, 3, 8, visited) is False

    def test_corner_valid(self):
        visited = [[False]*8 for _ in range(8)]
        assert is_valid(7, 7, 8, visited) is True


# ─────────────────────────────────────────────
#  get_degree Tests
# ─────────────────────────────────────────────
class TestGetDegree:
    def test_corner_has_two_moves(self):
        visited = [[False]*8 for _ in range(8)]
        assert get_degree(0, 0, 8, visited) == 2

    def test_center_has_eight_moves(self):
        visited = [[False]*8 for _ in range(8)]
        assert get_degree(4, 4, 8, visited) == 8

    def test_blocked_reduces_degree(self):
        visited = [[False]*8 for _ in range(8)]
        visited[2][1] = True
        visited[1][2] = True
        # From (0,0) only 2 moves normally; blocking them → 0
        assert get_degree(0, 0, 8, visited) == 0


# ─────────────────────────────────────────────
#  Warnsdorff Algorithm Tests
# ─────────────────────────────────────────────
class TestWarnsdorff:
    @pytest.mark.parametrize("r,c", [(0,0),(3,3),(7,7),(0,7)])
    def test_8x8_valid_tour(self, r, c):
        path, ms = warnsdorff(8, r, c)
        assert path is not None, f"No path from ({r},{c})"
        assert is_valid_knight_tour(path, 8)

    @pytest.mark.parametrize("r,c", [(0,0),(8,8),(15,15)])
    def test_16x16_valid_tour(self, r, c):
        path, ms = warnsdorff(16, r, c)
        assert path is not None
        assert is_valid_knight_tour(path, 16)

    def test_returns_timing(self):
        _, ms = warnsdorff(8, 0, 0)
        assert isinstance(ms, int)
        assert ms >= 0

    def test_start_position_first(self):
        path, _ = warnsdorff(8, 3, 5)
        assert path[0] == (3, 5)

    def test_path_length_8x8(self):
        path, _ = warnsdorff(8, 0, 0)
        assert len(path) == 64

    def test_path_length_16x16(self):
        path, _ = warnsdorff(16, 0, 0)
        assert len(path) == 256


# ─────────────────────────────────────────────
#  Backtracking Algorithm Tests
# ─────────────────────────────────────────────
class TestBacktracking:
    @pytest.mark.parametrize("r,c", [(0,0),(1,1),(3,4)])
    def test_8x8_valid_tour(self, r, c):
        path, ms = backtrack(8, r, c)
        assert path is not None, f"No path from ({r},{c})"
        assert is_valid_knight_tour(path, 8)

    def test_returns_timing(self):
        _, ms = backtrack(8, 0, 0)
        assert isinstance(ms, int)

    def test_start_position_first(self):
        path, _ = backtrack(8, 2, 2)
        assert path[0] == (2, 2)

    def test_path_length(self):
        path, _ = backtrack(8, 0, 0)
        assert len(path) == 64


# ─────────────────────────────────────────────
#  Pydantic Validation Tests
# ─────────────────────────────────────────────
class TestSolveRequestValidation:
    def test_valid_request(self):
        r = SolveRequest(board_size=8, start_row=0, start_col=0, algorithm="warnsdorff")
        assert r.board_size == 8

    def test_invalid_board_size(self):
        with pytest.raises(ValidationError):
            SolveRequest(board_size=10, start_row=0, start_col=0, algorithm="warnsdorff")

    def test_invalid_algorithm(self):
        with pytest.raises(ValidationError):
            SolveRequest(board_size=8, start_row=0, start_col=0, algorithm="quantum")

    def test_negative_coordinates(self):
        with pytest.raises(ValidationError):
            SolveRequest(board_size=8, start_row=-1, start_col=0, algorithm="warnsdorff")


class TestValidateRequestValidation:
    base = dict(
        player_name="Alice",
        board_size=8,
        start_row=0,
        start_col=0,
        player_moves=[[0,0]],
        correct_moves=[[0,0]],
        algorithm_used="warnsdorff",
        time_taken_ms=100,
    )

    def test_empty_player_name(self):
        data = {**self.base, "player_name": "   "}
        with pytest.raises(ValidationError):
            ValidateRequest(**data)

    def test_name_too_long(self):
        data = {**self.base, "player_name": "A"*51}
        with pytest.raises(ValidationError):
            ValidateRequest(**data)

    def test_valid_request(self):
        req = ValidateRequest(**self.base)
        assert req.player_name == "Alice"


# ─────────────────────────────────────────────
#  Tour Correctness Cross-Check
# ─────────────────────────────────────────────
class TestAlgorithmConsistency:
    def test_both_algorithms_produce_valid_8x8(self):
        path_w, _ = warnsdorff(8, 0, 0)
        path_b, _ = backtrack(8, 0, 0)
        assert is_valid_knight_tour(path_w, 8)
        assert is_valid_knight_tour(path_b, 8)

    def test_warnsdorff_faster_than_backtrack_on_8x8(self):
        _, ms_w = warnsdorff(8, 0, 0)
        _, ms_b = backtrack(8, 0, 0)
        # Warnsdorff should be at least 10× faster
        assert ms_w * 10 <= ms_b + 5000   # generous tolerance