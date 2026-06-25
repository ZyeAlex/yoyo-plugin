# 角色图鉴样式参考快照（只读）

本目录存放 **已定稿** 的 `hero/atlas.html` + `hero/atlas.css` 完整副本，用于任意情况下 100% 还原。

| 文件 | 对应生产路径 | 行数 | MD5 |
|------|--------------|------|-----|
| `hero-atlas.html` | `resources/hero/atlas.html` | 131 | `47345dfcbcd055e8da212d6d7bdec45b` |
| `hero-atlas.css` | `resources/hero/atlas.css` | 348 | `1d17086d05f0019bb8891795f2549151` |

**定稿时间**：2026-06（自 git `4a8c624` 版本固化；曾因 `43f77fc` 误覆盖回旧 CSS 导致右侧崩坏）。

还原命令（在插件根目录）：

```shell
cp memory/reference/hero-atlas.html resources/hero/atlas.html
cp memory/reference/hero-atlas.css resources/hero/atlas.css
md5sum resources/hero/atlas.css resources/hero/atlas.html
# 应与上表 MD5 一致
```

Git 备选（若 reference 与仓库同步）：

```shell
git show 4a8c624:resources/hero/atlas.css > resources/hero/atlas.css
git show 4a8c624:resources/hero/atlas.html > resources/hero/atlas.html
```

详细维护禁令与布局说明见 [../05-render-ui-styles.md](../05-render-ui-styles.md) §2.4。
