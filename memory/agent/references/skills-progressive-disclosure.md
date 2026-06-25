# Skills 渐进披露

最后更新：2026-06-16

## 借鉴要点

AstrBot v4.13+ `SkillManager` 采用 Anthropic Skills 模式：

- Prompt 中只放 skill **名称 + 简短描述**
- Agent 决定启用某 skill 后，再加载完整 `SKILL.md`
- 工具多时可用 `skills_like` 模式：轻量 schema 先给 LLM，选中后再 re-query 完整参数

目的：**省 token**，工具/skill 数量增长时仍可控。

## YoAgent 落点

| 路径 | 职责 |
|------|------|
| 内置技能目录 | `server/skills/` | 存放 `SKILL.md` 内容 |
| `src/agent/skills/loader.py` | 扫描、元数据列表、按需加载全文 |
| `src/agent/filesystem/workspace.py` | 读取 skill 文件 |
| `src/agent/tools/registry.py` | 可选 `skills_like` 轻量 schema 模式 |

## MVP 范围

- 先实现：loader 列出 skill 元数据 + 按需读全文
- 后实现：`skills_like` 工具 schema 模式

## 不照搬

AstrBot 沙箱内 skill 可执行环境；YoAgent MVP 仅读 SKILL.md 注入 context，executable skill 后续再加。
