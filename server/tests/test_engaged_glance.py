"""时间看群：消息路径 glance_wait / due；partner 字段只写不读。"""

from src.chat.temperature import (
    HeatState,
    glance_due,
    note_human,
    on_hard_trigger,
    on_incoming,
    on_speak_success,
    schedule_next_glance,
    should_cold_skip,
)


def test_soft_message_before_due_is_batch():
    state = HeatState(attention=0.5, next_glance_at=2000.0, pending_glance_span=30.0)
    assert on_incoming(state, now=1000.0, hard=False, user_id="999") == "batch"
    assert glance_due(state, 1000.0) is False


def test_soft_message_when_due_is_judge():
    state = HeatState(
        attention=0.5,
        next_glance_at=1000.0,
        pending_glance_span=40.0,
        last_human_at=990.0,
    )
    assert on_incoming(state, now=1000.0, hard=False, user_id="999") == "judge"


def test_hard_trigger_sets_partner_write_only():
    state = HeatState()
    on_hard_trigger(state, 1000.0, user_id="100", at_reaction=(0.0, 0.0))
    assert state.partner_id == "100"
    assert state.pending_at is True
    assert on_incoming(state, now=1001.0, hard=True, user_id="100") == "reply"


def test_partner_chatting_elsewhere_does_not_boost_via_on_incoming():
    """P0 不用 partner 续窗：路人/partner 软消息同等走 glance。"""
    state = HeatState(
        attention=0.2,
        partner_id="100",
        next_glance_at=5000.0,
        pending_glance_span=60.0,
    )
    before = state.attention
    assert on_incoming(state, now=1000.0, hard=False, user_id="100") == "batch"
    assert state.attention == before


def test_cold_skip_reschedule_path():
    state = HeatState(attention=0.1, pending_glance_span=1800.0, last_human_at=0.0)
    note_human(state, 10.0)
    # 半小时完全无人（相对 span）
    state.last_human_at = 100.0
    now = 100.0 + 2000.0
    assert should_cold_skip(state, now) is True
    schedule_next_glance(state, now)
    assert state.next_glance_at > now


def test_speak_success_then_gap():
    state = HeatState()
    on_speak_success(state, 1000.0)
    assert state.last_speak_at == 1000.0
    assert state.attention >= 0.5
    assert state.attention_floor == 0.32
