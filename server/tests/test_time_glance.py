"""P0 时间看群：对数均匀、冷跳过、@ 钩子、floor 松绑继续衰减。"""

from __future__ import annotations

import math
import random

from src.chat.temperature import (
    HeatState,
    decay_attention,
    effective_attention,
    endpoints_for_attention,
    glance_due,
    log_uniform,
    on_glance_silent,
    on_hard_trigger,
    on_speak_success,
    on_thread_hit,
    schedule_next_glance,
    should_cold_skip,
    speak_gap_ok,
    speak_gap_wait,
    thread_addresses_bot,
)


def test_log_uniform_median_near_geometric():
    rng = random.Random(0)
    samples = [log_uniform(20, 40, rng=rng) for _ in range(4000)]
    samples.sort()
    mid = samples[len(samples) // 2]
    expect = math.sqrt(20 * 40)
    assert abs(mid - expect) < 2.0
    assert min(samples) >= 20 - 1e-6
    assert max(samples) <= 40 + 1e-6


def test_endpoints_interpolate():
    idle = endpoints_for_attention(0.0)
    chat = endpoints_for_attention(0.5)
    focus = endpoints_for_attention(1.0)
    assert idle == (1500.0, 3600.0)
    assert chat == (20.0, 40.0)
    assert focus == (3.0, 8.0)
    mid = endpoints_for_attention(0.25)
    assert mid[0] == (1500 + 20) / 2
    assert mid[1] == (3600 + 40) / 2


def test_cold_skip_only_when_fully_quiet():
    state = HeatState(pending_glance_span=1800.0, last_human_at=0.0)
    assert should_cold_skip(state, 1000.0) is True
    state.last_human_at = 1000.0 - 600.0  # 10 分钟前有人说过
    assert should_cold_skip(state, 1000.0) is False
    state.last_human_at = 1000.0 - 2000.0  # 完全超过间隔
    assert should_cold_skip(state, 1000.0) is True


def test_hard_trigger_does_not_delay_reply():
    rng = random.Random(1)
    state = HeatState()
    on_hard_trigger(state, 1000.0, user_id="u1", at_reaction=(2.0, 8.0), rng=rng)
    assert state.pending_at is True
    assert state.partner_id == "u1"
    assert state.earliest_speak_at == 0.0
    assert speak_gap_wait(state, 1000.0, speak_gap=(3.0, 5.0)) == 0.0


def test_speak_gap_wait_uses_last_decision():
    state = HeatState(last_decide_at=1000.0)
    assert speak_gap_wait(state, 1002.0, speak_gap=(3.0, 5.0)) == 1.0
    assert speak_gap_wait(state, 1003.0, speak_gap=(3.0, 5.0)) == 0.0
    assert speak_gap_wait(HeatState(), 1000.0, speak_gap=(3.0, 5.0)) == 0.0


def test_floor_release_continues_decay_not_zero():
    state = HeatState(attention=0.5)
    on_speak_success(state, 1000.0, unanswered_give_up=480.0)
    assert state.attention_floor == 0.32
    assert state.floor_until == 1480.0
    # 松 floor 后从当前值继续衰减
    state.attention = 0.32
    state.last_glance_at = 1480.0
    decay_attention(state, 1480.0 + 60.0, decay_per_min=0.92, last_tick=1480.0)
    assert state.attention_floor == 0.0
    assert 0.0 < state.attention < 0.32
    assert abs(state.attention - 0.32 * 0.92) < 1e-6


def test_speak_resets_floor_window_intentionally():
    state = HeatState()
    on_speak_success(state, 1000.0, unanswered_give_up=480.0)
    on_speak_success(state, 1100.0, unanswered_give_up=480.0)
    assert state.floor_until == 1580.0
    assert state.last_speak_at == 1100.0


def test_thread_hit_only_bot_addressed():
    assert thread_addresses_bot(at_bot=True) is True
    assert thread_addresses_bot(reply_to_bot=True) is True
    assert thread_addresses_bot(quotes_bot=True) is True
    assert thread_addresses_bot() is False
    state = HeatState(attention=0.3)
    on_thread_hit(state, 1.0)
    assert abs(state.attention - 0.5) < 1e-9


def test_silent_inside_dwell_does_not_drop():
    """P0.5：silent 不降；空手退出才 −0.08。"""
    from src.chat.temperature import enter_dwelling, exit_dwelling

    state = HeatState(attention=0.6, attention_floor=0.0)
    enter_dwelling(state, 1000.0)
    on_glance_silent(state, 1001.0, thread_hit=False)
    assert abs(state.attention - 0.6) < 1e-9
    exit_dwelling(state, 1100.0)
    assert state.empty_streak == 1
    assert state.session == "away"
    # −0.08 后再经 schedule 内衰减，应明显低于原 0.6
    assert state.attention < 0.6


def test_schedule_and_speak_gap():
    rng = random.Random(2)
    state = HeatState(attention=0.5)
    span = schedule_next_glance(state, 1000.0, rng=rng)
    assert 20.0 <= span <= 40.0
    assert glance_due(state, 1000.0 + span - 0.1) is False
    assert glance_due(state, 1000.0 + span) is True
    state.last_speak_at = 2000.0
    assert speak_gap_ok(state, 2002.0, speak_gap=(3.0, 5.0)) is False
    assert speak_gap_ok(state, 2003.0, speak_gap=(3.0, 5.0)) is True


def test_effective_attention_respects_floor():
    state = HeatState(attention=0.1, attention_floor=0.32, floor_until=9999.0)
    assert effective_attention(state, 1000.0) == 0.32
