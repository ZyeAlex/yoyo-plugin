# MVP 验收口径

最后更新：2026-06-24

## API（yoyo-plugin 对接）

- [x] `POST /api/chat` 返回 `code: 0`
- [x] 识别 @ `bot_id` 与唤醒词触发
- [x] 失败/空回复插件侧短句兜底

## Agent

- [x] 单路径 `run_tool_loop`（无关键词 IntentRoute）
- [x] 渐进工具：`activate_tools` + 业务 schema
- [x] memory guards 拒绝 lore 写入 MEMORY
- [x] ExtractMemory 异步（不阻塞回复）
- [x] 情绪仅本轮注入，users.yaml 无 emotion 日志
- [ ] 终端工具成功后 Loop 立即终止（规划）

## Token（抽样）

- [x] trace 含 `system_chars`、`playbooks`、`route`
- [ ] 典型闲聊 input ≤ 3000 tokens（非 legacy 模式抽样）
- [x] `agentMaxSteps` 生效

## 工程

- [x] assembler / guards / runner 单测
- [x] `yoagent.trace` agent_run 行可 grep
