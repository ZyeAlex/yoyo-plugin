# 图鉴 / 签到渲染 UI 样式（已定稿）

> 专题 05：角色图鉴、奇波图鉴、签到页 HTML/CSS 布局约定与维护禁忌。  
> 上级索引：[memory/README.md](./README.md)  
> 数据与缓存：[04-wiki-data-and-cache.md](./04-wiki-data-and-cache.md)

**状态**：2025-06 样式迭代已完成；改样式前必读本文，避免 HTML/CSS 不同步或被误覆盖。

---

## 1. 通用约定

| 项 | 约定 |
|----|------|
| 主题变量 | `--yo-bg`、`--yo-surface-glass`、`--yo-border`、`--yo-shadow` 等见 [`resources/common/index.css`](../resources/common/index.css) |
| 图鉴头 flex | [`.yo-atlas-head`](../resources/common/list.css)：`display:flex`，左立绘 + 右信息 |
| 玻璃卡片 | `.pet-box`、`.sign-history-box.main`：`var(--yo-surface-glass)` + 圆角 + 边框 + 阴影 |
| 布局背景 | [`layout.html`](../resources/common/layout.html) 仅当 `bgImg` 非空时渲染 `.background` |
| 签到无背景图 | [`render.js`](../utils/render.js)：`p === 'sign/index'` → `bgImg = ''`；页面用 `html { background: var(--yo-bg) }` |

---

## 2. 角色图鉴 [`hero/atlas.html` + `atlas.css`]

### 2.1 右侧 `.hero-base`（与 BWIKI「信息」区对齐）

自上而下：

1. **`.hero-identity` → `.hero-name-stack`**
   - 势力大图 `.hero-group-img`：**240px** 高
   - `.hero-name-block` 叠在图下方：`margin-top: -120px`（无势力图时 `margin-top: 0`）
   - `.hero-english-name` 小字 + `.hero-name` 主标题（54px）
2. **`.hero-badges`**：元素图标 + 星级 + 职业图标，横排居中
3. **`table.hero-meta`**：**3 行 × 2 列**（元素/职业、阵营/种族、生日/武器）
   - 浅底表格、`th` 蓝灰底、`td:nth-child(2)` 列间竖线
4. **`.hero-desc`**：短台词（Wiki `desc`），左对齐；**长传记 `intro` 不在头部**，在下方 `.hero-profile.main`

### 2.2 左侧立绘

| 选择器 | 规则 |
|--------|------|
| `.hero-portrait` | 宽 **400px**，`align-self: stretch`，高度**跟随右侧**，不设固定 420/830px |
| `.hero-portrait-inner` | `top: -100px`，`height: calc(100% + 100px)`，absolute 不参与 flex 增高 |
| mask | 右侧 **10%** 透明渐变 `linear-gradient(to right, #000 90%, transparent)` |
| `.hero-portrait-img` | `height: 100%`，`width: auto`，`object-position: right bottom` |

图片：`portraitIcon`（`tex_icon_hero_get_{id}.png`），失败回退 `headIcon`（**不用**小 `avatarIcon`）。

### 2.3 文件

- CSS 约 **348 行**，含 `.hero-identity` / `.hero-badges` / `.hero-meta` / `.hero-desc` 等**全部**新类名
- **禁止**回退到旧版（缺上述类名、`.hero-name { margin-top: -56px }`、`.hero-rarity-img { position: absolute }`、立绘固定高度）

---

## 3. 奇波图鉴 [`pet/atlas.html` + `atlas.css`]

### 3.1 特性条 `.pet-base-skills`

- **单行**：左侧「特性」标题，右侧 tag 列表
- `.pet-base-skills-list`：`flex-wrap: nowrap`，`justify-content: center`，tag 在右侧区域**居中**
- tag 紧凑：`padding: 3px 8px`，`font-size: 18px`

### 3.2 技能描述

- 模板：[`pet/pet-skill.html`](../resources/pet/pet-skill.html)
- **只展示最高等级**描述（与角色技能一致）
- 标题行右侧：`lv.{{skill.level}}`
- 数据：[`api/wiki/parser.js`](../api/wiki/parser.js)
  - `parseKiboSkillDesc` → `descLevels[]`、`level`、`descHtml`
  - `buildKiboSkillDescHtml` 取 `descLevels` 最后一级
  - 旧 yaml 仅有合并多行 `desc` 时，`parseLegacyMergedKiboDesc` 兜底
- 刷新数据：`#更新奇波数据` 后 yaml 应含 `descLevels`；改 CSS/模板后需 `#更新图鉴数据` 或重发图鉴清 atlas 缓存

### 3.3 区块卡片

- `.pet-box`：`var(--yo-surface-glass)`，与签到历史卡、技能 `.main` 风格一致

---

## 4. 签到页 [`sign/index.html` + `index.css`]

| 区域 | 约定 |
|------|------|
| 背景 | 无随机奇波底图；纯色 `--yo-bg` |
| `.sign-img` | 宽 830px，`min-height: 830px`，`max-height: 1500px`（**可变**，禁止锁死 830×830） |
| 用户头像 | `.sign-user-row` flex；`.sign-user-img` 固定 **56×56** 圆形，`object-fit: cover` |
| 头像禁忌 | **禁止** `transform: translate(0, 12px)`（inline/行高裁切，只露顶部） |
| 头像与立绘 | **无关**；修头像时不要改 `.sign-img` 高度逻辑 |
| 历史统计 | `.main.sign-history-box` 玻璃卡片保留（用户要求保留框、只去页面背景图） |

结构：立绘 → `.sign-body`（签到信息 + `.sign-text`）→ `.sign-history-box`。

---

## 5. 渲染缓存与样式生效

| 页面 | atlas 磁盘缓存 | 样式更新后 |
|------|----------------|------------|
| `#xxx图鉴` | 是（`cache: 'atlas'`） | `#更新图鉴数据` 或删 `data/cache/render/atlas/` |
| 签到 | **否** | 重发签到即可 |

改 HTML/CSS 后若仍见旧图，先怀疑缓存，而非数据 yaml。

---

## 6. 维护禁忌（曾导致样式「丢失」三次）

1. **不要**对 CSS 使用 `git checkout` 除非用户明确要求（会丢掉未 commit 的会话改动）
2. **不要**用 `Write` 整文件覆盖与当前任务无关的 CSS（易写入旧版片段）
3. **改 CSS 前必须先 Read 当前文件**，优先 `StrReplace` 局部修改
4. **HTML 已换新结构时**，禁止写回只匹配旧 HTML 的选择器
5. 样式里程碑完成后 **建议 commit**，避免仅存在于工作区

---

## 7. 相关文件速查

```
resources/hero/atlas.html
resources/hero/atlas.css
resources/pet/atlas.html
resources/pet/atlas.css
resources/pet/pet-skill.html
resources/sign/index.html
resources/sign/index.css
resources/common/layout.html
resources/common/list.css      # .yo-atlas-head
utils/render.js                # sign 无 bgImg
api/wiki/parser.js             # 奇波技能 descLevels / level
```
