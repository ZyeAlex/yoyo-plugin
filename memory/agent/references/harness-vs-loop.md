# Harness vs Loop Engineering

最后更新：2026-06-16

## 关系

- **Harness Engineering**：`src/agent/` 整包 — 工具、记忆、Skills、上下文、护栏、Provider。
- **Loop Engineering**：Harness 子集 — **`execution/` 里循环如何转、何时停、谁验收**。

YoAgent 采用：**Harness 建环境，Loop 管最短路径。**

## 四层栈

```
Prompt → Context → Harness (src/agent/) → Loop (execution/)
                      ↑ token 组装在这里
```

## Loop 在 YoAgent 的三类

| 类型 | 场景 | 调度 |
|------|------|------|
| **Reactive Loop** | 插件 `/respond` 一次回复 | 请求触发 |
| **Short ReAct** | 需工具的子集 | 纯 ReAct + activate_tools（2026-06-24 起无 IntentRoute） |
| **Scheduled Loop** | 主动群摘要（后期） | cron，独立预算 |

MVP 只做 Reactive + Short ReAct。

## 与 Token 策略

Loop 设计直接决定 token：

- 停止条件明确 → 少空转 step
- Verify 用规则/测试 → 少「模型自评」轮次
- max_step 小 → 上限可控

## 参考

- [tool-loop-semantics.md](tool-loop-semantics.md)
- [../requirements/react-short-path.md](../requirements/react-short-path.md)
