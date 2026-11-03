from __future__ import annotations

import json
import logging
import threading
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from src.chat.memory import paths
from src.chat.memory.affinity import apply_affinity_delta, clamp_affinity, has_affinity
from src.chat.memory.guards import (
    dedupe_existing_lines,
    filter_facts,
    filter_group_facts,
    filter_user_facts,
    is_bot_display_name,
    reject_reason,
    sanitize_display_name,
)

_logger = logging.getLogger("yoyo.chat.memory.store")

_USER_KEYS = (
    "nickname",
    "alias",
    "preferences",
    "taboos",
    "notes",
    "from_others",
    "affinity",
    "impression",
    "updated_at",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _today() -> str:
    return date.today().isoformat()


def _read_text(path: Path) -> str:
    if not path.is_file():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text or "", encoding="utf-8")


def _load_yaml(path: Path) -> Any:
    raw = _read_text(path)
    if not raw.strip():
        return None
    try:
        return yaml.safe_load(raw)
    except yaml.YAMLError:
        return None


def _dump_yaml(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False) or "",
        encoding="utf-8",
    )


def _empty_user(user_id: str) -> dict[str, Any]:
    return {
        "user_id": str(user_id),
        "nickname": "",
        "alias": "",
        "preferences": [],
        "taboos": [],
        "notes": [],
        "from_others": [],
        "updated_at": "",
    }


class MemoryStore:
    def __init__(self, root: Path | None = None) -> None:
        self._root = root
        self._lock = threading.RLock()
        if root is not None:
            # tests: override path helpers via monkeypatch of paths.MEMORY_ROOT
            paths.MEMORY_ROOT = Path(root)

    def load_global(self) -> str:
        with self._lock:
            return _read_text(paths.global_memory_path()).strip()

    def save_global(self, text: str) -> None:
        with self._lock:
            cleaned = "\n".join(filter_facts([ln for ln in (text or "").splitlines() if ln.strip()]))
            _write_text(paths.global_memory_path(), cleaned + ("\n" if cleaned else ""))

    def load_group_profile(self, group_id: str) -> str:
        with self._lock:
            return _read_text(paths.group_memory_path(group_id)).strip()

    def append_group_facts(self, group_id: str, facts: list[str]) -> int:
        ok = filter_group_facts(facts)
        if not ok:
            return 0
        with self._lock:
            path = paths.group_memory_path(group_id)
            existing = _read_text(path)
            lines = dedupe_existing_lines([ln for ln in existing.splitlines() if ln.strip()])
            before = len(lines)
            lines = dedupe_existing_lines(lines + ok)
            if len(lines) > 60:
                lines = lines[-60:]
            _write_text(path, "\n".join(lines) + ("\n" if lines else ""))
            return max(0, len(lines) - before)

    def sanitize_group(self, group_id: str) -> dict[str, int]:
        """清洗已落盘脏数据：机器人昵称串号、事件流水、悠悠叙事、群约定近重。"""
        stats = {
            "group_lines_before": 0,
            "group_lines_after": 0,
            "users_cleared_nick": 0,
            "users_cleared_alias": 0,
            "user_fields_dropped": 0,
        }
        with self._lock:
            gpath = paths.group_memory_path(group_id)
            raw_lines = [ln.strip() for ln in _read_text(gpath).splitlines() if ln.strip()]
            stats["group_lines_before"] = len(raw_lines)
            cleaned = dedupe_existing_lines(raw_lines)
            if len(cleaned) > 60:
                cleaned = cleaned[-60:]
            stats["group_lines_after"] = len(cleaned)
            _write_text(gpath, "\n".join(cleaned) + ("\n" if cleaned else ""))

            users = self.load_users(group_id)
            dump: dict[str, Any] = {}
            for uid, u in users.items():
                changed = False
                raw_nick = str(u.get("nickname") or "")
                nick = sanitize_display_name(raw_nick)
                if raw_nick and not nick:
                    u["nickname"] = ""
                    stats["users_cleared_nick"] += 1
                    changed = True
                elif nick and nick != raw_nick:
                    u["nickname"] = nick
                    changed = True
                raw_alias = str(u.get("alias") or "")
                alias = sanitize_display_name(raw_alias)
                if raw_alias and not alias:
                    u["alias"] = ""
                    stats["users_cleared_alias"] += 1
                    changed = True
                elif alias and alias != raw_alias:
                    u["alias"] = alias
                    changed = True
                for list_key in ("preferences", "taboos", "notes", "from_others"):
                    before = list(u.get(list_key) or [])
                    after = filter_user_facts(before)
                    dropped = len(before) - len(after)
                    if dropped or after != before:
                        stats["user_fields_dropped"] += max(dropped, 0)
                        u[list_key] = after[-12:]
                        changed = True
                if changed:
                    u["updated_at"] = _now_iso()
                dump[uid] = {kk: vv for kk, vv in u.items() if kk != "user_id"}
            _dump_yaml(paths.users_path(group_id), dump)
        return stats

    def sanitize_all_groups(self) -> dict[str, Any]:
        """扫 data/memory/group/* 全量清洗。"""
        root = paths.memory_root() / "group"
        summary: dict[str, Any] = {"groups": 0, "totals": {}}
        if not root.exists():
            return summary
        totals = {
            "group_lines_before": 0,
            "group_lines_after": 0,
            "users_cleared_nick": 0,
            "users_cleared_alias": 0,
            "user_fields_dropped": 0,
        }
        for child in sorted(root.iterdir()):
            if not child.is_dir():
                continue
            st = self.sanitize_group(child.name)
            summary["groups"] += 1
            for k, v in st.items():
                totals[k] = totals.get(k, 0) + int(v)
        summary["totals"] = totals
        return summary

    def load_users(self, group_id: str) -> dict[str, dict[str, Any]]:
        with self._lock:
            data = _load_yaml(paths.users_path(group_id))
            if not isinstance(data, dict):
                return {}
            out: dict[str, dict[str, Any]] = {}
            for uid, row in data.items():
                if not isinstance(row, dict):
                    continue
                u = _empty_user(uid)
                for k in _USER_KEYS:
                    if k in row:
                        u[k] = row[k]
                u["user_id"] = str(uid)
                for list_key in ("preferences", "taboos", "notes", "from_others"):
                    if not isinstance(u.get(list_key), list):
                        u[list_key] = []
                if has_affinity(u):
                    u["affinity"] = clamp_affinity(u.get("affinity"))
                else:
                    u.pop("affinity", None)
                impression = str(u.get("impression") or "").strip()
                u["impression"] = impression[:40]
                out[str(uid)] = u
            return out

    def load_user(self, group_id: str, user_id: str) -> dict[str, Any]:
        users = self.load_users(group_id)
        return users.get(str(user_id)) or _empty_user(user_id)

    def update_user(self, group_id: str, user_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        uid = str(user_id)
        with self._lock:
            users = self.load_users(group_id)
            u = users.get(uid) or _empty_user(uid)
            if "nickname" in patch and isinstance(patch["nickname"], str):
                raw_nick = patch["nickname"]
                nick = sanitize_display_name(raw_nick)
                if nick:
                    u["nickname"] = nick
                elif is_bot_display_name(raw_nick):
                    u["nickname"] = ""
            if "alias" in patch and isinstance(patch["alias"], str):
                raw_alias = patch["alias"]
                alias = sanitize_display_name(raw_alias)
                if alias:
                    u["alias"] = alias
                elif is_bot_display_name(raw_alias):
                    u["alias"] = ""
            for list_key in ("preferences", "taboos", "notes", "from_others"):
                if list_key not in patch:
                    continue
                items = filter_user_facts([str(x) for x in (patch[list_key] or [])])
                existing = filter_user_facts(list(u.get(list_key) or []))
                for it in items:
                    if it not in existing:
                        existing.append(it)
                u[list_key] = existing[-20:]
            if "affinity_delta" in patch:
                base = clamp_affinity(u["affinity"]) if has_affinity(u) else 50
                u["affinity"] = apply_affinity_delta(base, patch.get("affinity_delta"))
            if "impression" in patch:
                cleaned = filter_user_facts([str(patch.get("impression") or "")])
                if cleaned:
                    u["impression"] = cleaned[0][:40]
            u["updated_at"] = _now_iso()
            users[uid] = u
            # strip user_id from yaml value (keep as key)
            dump = {}
            for k, v in users.items():
                row = {kk: vv for kk, vv in v.items() if kk != "user_id"}
                dump[k] = row
            _dump_yaml(paths.users_path(group_id), dump)
            return u

    def load_slang(self, group_id: str) -> list[dict[str, Any]]:
        with self._lock:
            data = _load_yaml(paths.slang_path(group_id))
            if isinstance(data, list):
                return [x for x in data if isinstance(x, dict) and x.get("term")]
            if isinstance(data, dict) and isinstance(data.get("items"), list):
                return [x for x in data["items"] if isinstance(x, dict) and x.get("term")]
            return []

    def upsert_slang(
        self,
        group_id: str,
        term: str,
        meaning: str,
        examples: list[str] | None = None,
    ) -> bool:
        term = (term or "").strip()
        meaning = (meaning or "").strip()
        if not term or not meaning:
            return False
        if reject_reason(term) or reject_reason(meaning):
            return False
        with self._lock:
            items = self.load_slang(group_id)
            found = None
            for it in items:
                if str(it.get("term") or "").lower() == term.lower():
                    found = it
                    break
            if found:
                found["meaning"] = meaning[:200]
                found["hits"] = int(found.get("hits") or 0) + 1
                if examples:
                    ex = list(found.get("examples") or [])
                    for e in examples:
                        e = str(e).strip()
                        if e and e not in ex and not reject_reason(e):
                            ex.append(e[:120])
                    found["examples"] = ex[-5:]
            else:
                items.append(
                    {
                        "term": term[:64],
                        "meaning": meaning[:200],
                        "examples": [
                            str(e)[:120]
                            for e in (examples or [])
                            if str(e).strip() and not reject_reason(str(e))
                        ][:5],
                        "hits": 1,
                        "created_at": _now_iso(),
                    }
                )
            if len(items) > 200:
                items = sorted(items, key=lambda x: int(x.get("hits") or 0), reverse=True)[:200]
            _dump_yaml(paths.slang_path(group_id), items)
            return True

    def bump_slang_hits(self, group_id: str, terms: list[str]) -> None:
        if not terms:
            return
        lower = {t.lower() for t in terms}
        with self._lock:
            items = self.load_slang(group_id)
            changed = False
            for it in items:
                if str(it.get("term") or "").lower() in lower:
                    it["hits"] = int(it.get("hits") or 0) + 1
                    changed = True
            if changed:
                _dump_yaml(paths.slang_path(group_id), items)

    def append_session(
        self,
        group_id: str,
        *,
        user_id: str,
        user_text: str,
        bot_replies: list[str],
        max_turns: int = 20,
    ) -> None:
        row = {
            "ts": _now_iso(),
            "user_id": str(user_id),
            "user_text": (user_text or "")[:2000],
            "bot_replies": [(r or "")[:1000] for r in (bot_replies or [])][:5],
        }
        with self._lock:
            path = paths.session_path(group_id)
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
            # truncate
            lines = path.read_text(encoding="utf-8").splitlines()
            if len(lines) > max_turns:
                path.write_text("\n".join(lines[-max_turns:]) + "\n", encoding="utf-8")

    def load_session(self, group_id: str, max_turns: int = 20) -> list[dict[str, Any]]:
        with self._lock:
            path = paths.session_path(group_id)
            if not path.is_file():
                return []
            out: list[dict[str, Any]] = []
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(obj, dict):
                    out.append(obj)
            return out[-max_turns:]

    def append_daily_note(self, group_id: str, note: str, day: str | None = None) -> bool:
        note = (note or "").strip()
        if not note or reject_reason(note):
            return False
        day = day or _today()
        with self._lock:
            path = paths.daily_log_path(group_id, day)
            existing = _read_text(path)
            stamp = datetime.now().strftime("%H:%M")
            block = f"- [{stamp}] {note[:400]}\n"
            _write_text(path, existing + block)
            return True

    def load_daily(self, group_id: str, day: str | None = None) -> str:
        day = day or _today()
        with self._lock:
            return _read_text(paths.daily_log_path(group_id, day)).strip()

    def load_recent_dailies(self, group_id: str, days: int = 2) -> list[tuple[str, str]]:
        """Return [(day, content), ...] newest first, up to `days` with content."""
        from datetime import timedelta

        out: list[tuple[str, str]] = []
        base = date.today()
        for i in range(max(1, days) + 2):
            d = (base - timedelta(days=i)).isoformat()
            text = self.load_daily(group_id, d)
            if text:
                out.append((d, text))
            if len(out) >= days:
                break
        return out

    def remember_manual(self, group_id: str, user_id: str, text: str) -> str:
        """主人「记住：…」——优先写入用户 notes，否则群画像。"""
        text = (text or "").strip()
        if reject_reason(text):
            return "拒绝写入（命中守卫规则）"
        if not text:
            return "空内容"
        # 简单启发：含「他/她/我」偏用户
        if user_id and any(x in text for x in ("我", "他", "她", "喜欢", "讨厌", "叫我")):
            self.update_user(group_id, user_id, {"notes": [text]})
            return "已写入用户画像"
        self.append_group_facts(group_id, [text])
        return "已写入群画像"

    def forget_manual(self, group_id: str, text: str) -> str:
        needle = (text or "").strip()
        if not needle:
            return "空内容"
        with self._lock:
            path = paths.group_memory_path(group_id)
            lines = [ln for ln in _read_text(path).splitlines() if ln.strip()]
            kept = [ln for ln in lines if needle not in ln]
            removed = len(lines) - len(kept)
            _write_text(path, "\n".join(kept) + ("\n" if kept else ""))
            # slang
            slang = self.load_slang(group_id)
            new_slang = [s for s in slang if needle.lower() not in str(s.get("term") or "").lower()]
            if len(new_slang) != len(slang):
                removed += len(slang) - len(new_slang)
                _dump_yaml(paths.slang_path(group_id), new_slang)
            return f"已移除 {removed} 条" if removed else "未找到匹配"


_STORE: MemoryStore | None = None


def get_memory_store() -> MemoryStore:
    global _STORE
    if _STORE is None:
        _STORE = MemoryStore()
    return _STORE


def reset_memory_store_for_tests(root: Path | None = None) -> MemoryStore:
    global _STORE
    if root is not None:
        paths.MEMORY_ROOT = Path(root)
        Path(root).mkdir(parents=True, exist_ok=True)
    _STORE = MemoryStore(root=root)
    return _STORE
