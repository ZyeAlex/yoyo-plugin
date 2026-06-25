# 代码风格（强制）

最后更新：2026-06-17

YoAgent 的 Python 代码** deliberately 面向可读性**，不是典型 FastAPI / Pydantic 工程。  
新代码、改代码、AI 协作者**必须**遵守本文；与通用 Python 最佳实践冲突时，**以本文为准**。

## 核心原则

| 原则 | 说明 |
|------|------|
| 人读优先 | 代码是给维护者看的，注释用中文，结构一眼能懂 |
| **简洁优先** | **简单逻辑就写简单代码**；除非多处复用，否则不拆常量、不套抽象 |
| 零类型注解 | 函数参数、返回值、变量**不写** `: str`、`-> dict`、`Optional` 等 |
| 不用 Pydantic 建模 | 配置、请求/响应用**普通 class** + `from_dict` / `to_dict` |
| 不要包初始化文件 | **不创建** `__init__.py`（Python 3 namespace package 即可） |
| 模块一行说明 | 每个 `.py` 文件**第一行**是 `# 中文模块说明` |

## 类型注解

**禁止**（含测试）：

```python
def chat(self, request: ChatRequest) -> ChatResponse:
async def lifespan(app: FastAPI):
def test_health() -> None:
```

**正确**：

```python
def chat(self, request):
async def lifespan(app):
def test_health():
```

例外：无。FastAPI 路由也不要写 `response_model=SomeModel`。

## 数据结构与校验

### 请求 / 响应 / 领域对象

用普通 class，中文 docstring，显式构造与序列化：

```python
# 对话 API 的请求 / 响应数据结构

class ChatRequest:
    """POST /chat 请求体。"""

    def __init__(self, message, system_prompt=None, history=None):
        if not message or not str(message).strip():
            raise ValueError("message 不能为空")
        self.message = message
        ...

    @classmethod
    def from_dict(cls, data):
        ...

    def to_dict(self):
        ...
```

约定：

- 解析 JSON → `ClassName.from_dict(data)`
- 返回 API → `instance.to_dict()` 或直接返回 `dict`
- 校验失败 → `ValueError` / `KeyError`，在 HTTP 层转成 422

**不要用** `pydantic.BaseModel`、`Field(...)`、`model_validate`。

### 配置

`src/core/settings.py` 模式：

- `os.getenv` + `python-dotenv`
- 普通 `Settings` class，`__init__` 里读环境变量
- `@lru_cache` 的 `get_settings()` 单例
- 测试用 `Settings.from_dict({...})` 覆盖字段
- **无 `.env` 时**：启动自动从根目录 `.env.example` 复制（见下「简洁优先」）

## 简洁优先

**默认写最短、能读懂的实现。** 不要为了「规范」把一次性逻辑拆成多个常量、helper、配置层。

| 做 | 不做 |
|----|------|
| 函数内联路径、一次性判断 | 为只用一次的值建 `PROJECT_ROOT` / `ENV_PATH` 模块常量 |
| 真有多处复用再抽函数 | 为「以后可能用到」提前抽象 |
| 配置放 `.env` 或代码里写死（二选一，看是否部署可变） | 提示词、应用名等进 `.env`（见 `agent/prompts/`） |

**正例** — `.env` 自动创建（`src/core/settings.py`）：

```python
def ensure_env_file():
  root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
  env, example = os.path.join(root, ".env"), os.path.join(root, ".env.example")
  if not os.path.isfile(env) and os.path.isfile(example):
    shutil.copyfile(example, env)
  return env

# Settings.__init__
load_dotenv(ensure_env_file())
```

**反例** — 同一逻辑拆三个模块级常量 + 多段 early return，读代码要在文件头与函数间来回跳。

**何时才抽公共**：同一文件或跨模块 **≥2 处** 相同逻辑；或单函数超过约 30 行且段落职责清晰。

## 注释规范

1. **文件头**：一行 `#`，说明本文件干什么  
   例：`# 对话业务：拼 messages → 调 LLM → 转成 API 响应`
2. **类**：中文 `"""..."""` docstring  
   例：`"""处理一次用户对话的完整流程。"""`
3. **函数**：复杂逻辑用 docstring 或块注释；简单函数可省略  
   例：说明 messages 组装顺序、HTTP 路径与 JSON 形状
4. **行内**：只注释非 obvious 的业务点  
   例：`# 测试时可注入 mock llm，避免真调 API`
5. **空壳模块**（尚未实现）：文件里只保留一行 `# 模块用途（后续…）`  
   例：`# 执行循环：Think → Act → Observe（ReAct 短路径，后续实现）`

注释语言：**中文**。对外 API 错误信息、日志可中英混用，以现有代码为准。

## 目录与包

```
src/
├── main.py              # 应用入口
├── core/settings.py     # 配置
├── api/
│   ├── router.py        # 汇总路由
│   ├── deps.py          # Depends 鉴权等
│   └── endpoints/       # 薄 HTTP 层
├── schemas/             # from_dict / to_dict 数据结构
├── services/            # 业务编排
└── agent/               # LLM、规划、执行、记忆、工具
```

- **不要**加 `__init__.py`
- **不要**提交 `__pycache__/`（已在 `.gitignore`）
- 本地不想生成字节码：`export PYTHONDONTWRITEBYTECODE=1`

## 分层职责

| 层 | 做什么 | 不做什么 |
|----|--------|----------|
| `api/endpoints/` | 解析 HTTP、调 service、转 HTTP 错误 | 不调 LLM、不写业务规则 |
| `services/` | 编排流程、拼上下文 | 不碰 Header、status code |
| `agent/` | LLM、Agent 循环、工具、记忆 | 不 import FastAPI |
| `schemas/` | 数据结构 + 序列化 | 不含业务逻辑 |
| `core/` | 配置、横切工具 | 不含业务 |

## FastAPI 写法

```python
@router.post("")
async def chat(body=Body(...), service=Depends(get_chat_service)):
    request = ChatRequest.from_dict(body)
    response = await service.chat(request)
    return response.to_dict()
```

- 请求体：`Body(...)` 收 `dict`，再 `from_dict`
- 依赖注入：工厂函数 `get_chat_service()`、`get_settings()`
- 鉴权：挂在 `router` 的 `dependencies=[Depends(verify_api_key)]`
- 配置缺失：`RuntimeError` → endpoint 里映射为 503

## 命名

| 种类 | 风格 | 示例 |
|------|------|------|
| 文件 / 函数 / 变量 | snake_case | `chat_service.py`, `get_settings` |
| 类 | PascalCase | `ChatService`, `LLMProvider` |
| 私有成员 | 前缀 `_` | `self._settings`, `_build_messages` |
| 工厂 / 依赖 | `get_*` | `get_llm_provider`, `get_chat_service` |
| 序列化 | `from_dict` / `to_dict` | 统一动词，不用 `parse`/`serialize` 混用 |

## 测试

- 与生产代码相同：**无类型注解**
- Mock 通过构造函数注入（`ChatService(settings=..., llm=...)`），少 patch 内部
- 改环境变量后：`get_settings.cache_clear()`
- FastAPI 测试：`app.dependency_overrides[get_chat_service] = lambda: ...`

## 禁止清单（CRITICAL）

写 PR / 让 AI 改代码前对照：

- [ ] 未新增 `__init__.py`
- [ ] 未新增 `: type` / `-> type` 注解
- [ ] 未引入 `pydantic.BaseModel` / `pydantic-settings` 做业务模型
- [ ] 新模块有首行 `# 中文说明`
- [ ] 新 class 有中文 docstring
- [ ] HTTP 层仍保持薄，业务在 `services/` 或 `agent/`
- [ ] 未为了「类型安全」加 `typing`、`TypedDict`、`Protocol`
- [ ] 简单逻辑未拆成多余常量 / 间接层（见「简洁优先」）

## 参考实现（当前快照）

| 主题 | 文件 |
|------|------|
| 模块头 + 普通 class + from_dict/to_dict | `src/schemas/chat.py` |
| 业务编排 + 中文注释 | `src/services/chat_service.py` |
| 配置单例 + `.env` 自举 | `src/core/settings.py` |
| HTTP 薄层 | `src/api/endpoints/chat.py` |
| LLM 封装（LangChain ChatOpenAI） | `src/agent/llm/provider.py` |
| 测试风格 | `tests/test_agent_loop.py` |

## 与 playbook 的关系

通用 Python/FastAPI 配方在 **`playbook/`**；YoAgent **覆盖** playbook 中关于类型注解、Pydantic、包结构的部分。  
动手写代码：**先读本文**，再读 `structure/backend.md` 看分层，最后才参考 playbook。
