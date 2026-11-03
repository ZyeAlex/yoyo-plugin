"""P0.5：驻留时长、空手退避、进场节拍器。"""

from __future__ import annotations

import random

from src.chat.temperature import (
    HeatState,
    dwell_duration,
    dwell_expired,
    enter_dwelling,
    exit_dwelling,
    extend_dwelling,
    is_dwelling,
    on_glance_silent,
    on_hard_trigger,
    on_speak_success,
    on_thread_hit,
    sample_backoff,
    schedule_next_glance,
    should_cold_skip,
)


def test_dwell_duration_bands():
    rng = random.Random(0)
    hot = [dwell_duration(0.9, rng=rng) for _ in range(20)]
    chat = [dwell_duration(0.5, rng=rng) for _ in range(20)]
    idle = [dwell_duration(0.2, rng=rng) for _ in range(20)]
    assert all(60 <= x <= 180 for x in hot)
    assert all(30 <= x <= 90 for x in chat)
    assert all(10 <= x <= 30 for x in idle)


def test_backoff_ladder_and_cap():
    s0 = sample_backoff(0.0, 0, rng=random.Random(1))
    assert 1500 <= s0 <= 3600  # streak0 + att0 → idle glance
    b1 = sample_backoff(0.0, 1, rng=random.Random(2))
    assert 90 * 0.8 <= b1 <= 90 * 1.2
    b5 = sample_backoff(0.0, 5, rng=random.Random(3))
    assert 3600 * 0.8 <= b5 <= 3600 * 1.2
    b9 = sample_backoff(0.0, 9, rng=random.Random(3))
    assert abs(b9 - b5) < 1e-9  # 封顶同一档
    short = sample_backoff(1.0, 1, attention_factor=0.5, rng=random.Random(4))
    assert short <= 90 * 0.5 * 1.2 + 1e-6


def test_backoff_uses_extra_configured_tiers():
    retry = (10, 20, 30, 40, 50, 60, 70)
    b6 = sample_backoff(0.0, 6, retry=retry, rng=random.Random(1))
    assert 60 * 0.8 <= b6 <= 60 * 1.2
    b7 = sample_backoff(0.0, 7, retry=retry, rng=random.Random(1))
    b9 = sample_backoff(0.0, 9, retry=retry, rng=random.Random(1))
    assert 70 * 0.8 <= b7 <= 70 * 1.2
    assert abs(b9 - b7) < 1e-9


def test_empty_streak_follows_retry_length():
    state = HeatState(attention=0.2, empty_streak=5, session="dwelling", dwell_until=1000.0)
    exit_dwelling(state, 1000.0, retry=(90, 180, 300, 600, 900, 1800), rng=random.Random(1))
    assert state.empty_streak == 6


def test_enter_exit_empty_streak():
    state = HeatState(attention=0.2)
    enter_dwelling(state, 1000.0, rng=random.Random(0))
    assert is_dwelling(state)
    assert state.had_interaction_this_dwell is False
    assert state.dwell_until > 1000.0
    nxt_before = state.next_glance_at
    exit_dwelling(state, state.dwell_until, rng=random.Random(1))
    assert state.session == "away"
    assert state.empty_streak == 1
    assert state.attention < 0.2
    assert state.next_glance_at > state.dwell_until or state.next_glance_at > 1000.0
    assert state.last_interval > 0
    del nxt_before


def test_exit_with_interaction_clears_streak():
    state = HeatState(attention=0.5, empty_streak=2)
    enter_dwelling(state, 1000.0, rng=random.Random(0))
    on_thread_hit(state, 1001.0)
    assert state.had_interaction_this_dwell is True
    assert state.empty_streak == 0
    exit_dwelling(state, 1100.0, rng=random.Random(1))
    assert state.empty_streak == 0


def test_silent_does_not_drop_attention_inside_dwell():
    state = HeatState(attention=0.6)
    enter_dwelling(state, 1000.0, rng=random.Random(0))
    on_glance_silent(state, 1001.0, thread_hit=False)
    assert abs(state.attention - 0.6) < 1e-9


def test_speak_extends_dwell_and_marks_interaction():
    state = HeatState(attention=0.5)
    enter_dwelling(state, 1000.0, rng=random.Random(0))
    until = state.dwell_until
    on_speak_success(state, 1005.0)
    assert state.had_interaction_this_dwell is True
    assert state.dwell_until >= 1005.0 + 60.0
    assert state.dwell_until >= until


def test_speak_while_away_enters_dwell_no_glance_wait_trap():
    """开口后不得停在 away+next_glance，否则下一条必 glance_wait。"""
    state = HeatState(attention=0.5, session="away", next_glance_at=99999.0)
    on_speak_success(state, 1000.0, rng=random.Random(0))
    assert is_dwelling(state)
    assert state.had_interaction_this_dwell is True
    assert state.dwell_until > 1000.0


def test_hard_trigger_enters_dwell_without_reaction_delay():
    rng = random.Random(5)
    state = HeatState(session="away", next_glance_at=99999.0)
    on_hard_trigger(state, 1000.0, user_id="u", at_reaction=(2.0, 8.0), rng=rng)
    assert is_dwelling(state)
    assert state.empty_streak == 0
    assert state.had_interaction_this_dwell is True
    assert state.earliest_speak_at == 0.0
    # 已在 dwelling 再硬触发：续期
    until = state.dwell_until
    on_hard_trigger(state, 1010.0, user_id="u", at_reaction=(0.0, 0.0), rng=rng)
    assert state.dwell_until >= until
    assert state.dwell_until >= 1010.0 + 60.0


def test_dwell_expired_and_extend():
    state = HeatState()
    enter_dwelling(state, 1000.0, rng=random.Random(0))
    state.dwell_until = 1005.0
    assert dwell_expired(state, 1006.0) is True
    extend_dwelling(state, 1006.0, extra=60.0)
    assert dwell_expired(state, 1006.0) is False
    assert state.dwell_until >= 1066.0


def test_cold_skip_uses_last_interval():
    state = HeatState(last_interval=1800.0, last_human_at=0.0)
    assert should_cold_skip(state, 1000.0) is True
    state.last_human_at = 500.0
    assert should_cold_skip(state, 1000.0) is False
    assert should_cold_skip(state, 500.0 + 1800.0) is True


def test_schedule_while_away_sets_last_interval():
    state = HeatState(attention=0.5, empty_streak=0)
    span = schedule_next_glance(state, 1000.0, rng=random.Random(0))
    assert state.last_interval == span
    assert state.next_glance_at == 1000.0 + span
