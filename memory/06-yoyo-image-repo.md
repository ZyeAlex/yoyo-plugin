# 角色图片库（yoyo-image 仓库）

> 专题 06：`resources/img/hero/` 即 **yoyo-image** 独立 Git 仓库，供签到、随机角色图、用户上传等使用。  
> 上级索引：[memory/README.md](./README.md)

---

## 1. 路径与仓库关系

| 项 | 值 |
|----|-----|
| 物理路径 | `yoyo-plugin/resources/img/hero/`（相对插件根目录） |
| 独立仓库 | **是** — 目录内嵌 `.git`，远程 [yoyo-image](https://gitee.com/yoyo-plugin/yoyo-image) |
| 主插件仓库 | `resources/img/` 已在 [`.gitignore`](../.gitignore) 排除，**hero 图片不进 yoyo-plugin 主仓** |
| 历史位置 | 曾为独立插件 `plugins/yoyo-image/`；已合并至 `resources/img/hero/` 后删除原目录 |

维护图片库时在 **`resources/img/hero/` 内** 使用 Git（`git pull` / `git push`），勿在 yoyo-plugin 根目录提交 hero 文件。

---

## 2. 目录结构

```
resources/img/hero/
├── .git/                 # yoyo-image 仓库（gitee.com/yoyo-plugin/yoyo-image）
├── 寒悠悠/
│   ├── {md5}.jpg
│   └── ...
├── 源 千代/
└── …                     # 子文件夹名 = 角色中文名（与 game.heros[].name 一致）
```

- 上传/保存：[`utils/game.js`](../utils/game.js) `setHeroImgs` → `resources/img/hero/{角色名}/{md5}.{ext}`
- 扫描加载：[`utils/game.js`](../utils/game.js) `getHeroImgs` → 内存 `game.heroImgs[heroId]`

同名角色文件夹重复时**合并**（多路径扫描后 `Set` 去重），见 `getHeroImgs` 实现。

---

## 3. 代码中的读取路径

`getHeroImgs()` 扫描顺序：

1. **`setting.path/resources/img/hero`** — 主路径（即 yoyo-image 仓库内容）
2. **`setting.config.imgPath`** — 额外路径列表，相对 Yunzai 根目录（默认仍含 `plugins/yoyo-image`，兼容旧安装；新部署可只保留 hero 内嵌仓库）

目录名通过 `game.getHeroId(dir)` 映射为 `heroId`；无法识别的文件夹会被忽略。

---

## 4. 使用场景

| 功能 | 模块 | 依赖 |
|------|------|------|
| 每日签到背景图 | [`apps/sign.js`](../apps/sign.js) | `game.heroImgs[id]` 非空 |
| 随机/指定角色图 | [`apps/img.js`](../apps/img.js) | 同上 |
| `#上传xx图片` | [`apps/img.js`](../apps/img.js) + `setHeroImgs` | 写入 hero 子目录 |
| 图片列表渲染 | [`resources/hero/imgs.html`](../resources/hero/imgs.html) | `heroImgs` 数组 |

某角色无图片时，签到会跳过该角色（`sign.js` 过滤无 `heroImgs` 的 id）。

---

## 5. 运维备忘

- **开发者（维护者）**：在 `resources/img/hero/` 内嵌 yoyo-image 仓开发，将 Bot 上图片 commit & push 到 [yoyo-image](https://gitee.com/yoyo-plugin/yoyo-image) 远程；**不会**随主插件更新自动带给用户
- **普通用户**：须**手动** `git clone` 到 `plugins/yoyo-image/`（或配置 `imgPath`），或自行 `#上传` / 放文件到 `resources/img/hero/`
- **更新已安装的图库**：在 clone 目录内 `git pull`（如 `plugins/yoyo-image`）
- **与 Wiki 无关**：角色图鉴数据来自 BWIKI（见 [04-wiki-data-and-cache.md](./04-wiki-data-and-cache.md)）；hero 仅为娱乐/签到用立绘或同人图，非 Wiki 资源
