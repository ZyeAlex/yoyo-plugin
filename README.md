<img decoding="async" align=right src="https://gitee.com/yoyo-plugin/yoyo-icon/raw/master/tex_icon_hero_l_101003.png" width="200px">

<div align="left">

# <div align="center">悠悠助手 （ yoyo-plugin ）</div>

<div align="center"> <i>云崽 QQ 机器人的「蓝色星原：旅谣」插件</i> </div>
<br/>
<div align="center">

![Dynamic JSON Badge](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgitee.com%2Fyoyo-plugin%2Fyoyo-plugin%2Fraw%2Fmaster%2Fpackage.json&query=%24.version&label=最新版本)
[<img src="https://img.shields.io/badge/插件交流群-991709221-blue" />](https://qm.qq.com/q/Mk3jyhIqSm)
<img src="https://gitee.com/yoyo-plugin/yoyo-plugin/badge/star.svg"/>

</div>
<div align="center"><img src="https://api.moedog.org/count/@ZyeAlex:yoyo-plugin?theme=asoul"  /></div>
</div>


---

## 简介

`yoyo-plugin` 用于在 Yunzai 机器人中查询《蓝色星原：旅谣》图鉴、角色信息与部分娱乐功能。数据主要来自 [BWIKI](https://wiki.biligame.com/ap/)，支持本地缓存与图鉴渲染缓存。

安装后发送 `悠悠帮助` 或 `#帮助` 可查看完整指令列表。

---

## 功能概览

### 图鉴（BWIKI 数据）

| 功能 | 示例指令 | 说明 |
|------|----------|------|
| 角色图鉴 | `#角色图鉴` / `#寒悠悠图鉴` | 列表 + 单角色详情（技能、星赐、语音等） |
| 奇波图鉴 | `#奇波图鉴` | 列表 + 单奇波详情 |
| 灵子图鉴 | `#灵子图鉴` / `#汁石就是力量图鉴` | 列表 + 单灵子详情 |
| 专属灵子 | `#诺诺专武` / `#诺诺专属灵子` | 按角色查询关联灵子 |
| 物品图鉴 | `#物品图鉴` / `#物品图鉴2` | 分页展示，每页 300 个 |
| 装备图鉴 | `#装备图鉴` | 装备列表 |
| 套装图鉴 | `#套装图鉴` | 套装效果与组成装备 |
| 更新数据 | `#更新图鉴数据` / `#更新角色数据` 等 | 从 Wiki 拉取并刷新缓存 |

### 角色与图片

| 功能 | 示例指令 | 说明 |
|------|----------|------|
| 角色别名 | `#寒悠悠设置别名XX` | 支持用别名触发指令 |
| 角色图片 | `#寒悠悠图片` | 随机图片，需配置图片资源 |
| 图片管理 | `#上传寒悠悠图片` / `#寒悠悠图片列表` | 引用消息上传或管理 |
| 角色攻略 | `#寒悠悠攻略` | 读取本地/挂载目录中的攻略图 |

### 娱乐

| 功能 | 示例指令 | 说明 |
|------|----------|------|
| 签到 | `#签到` | 每日签到 |

### 账号与插件管理

| 功能 | 示例指令 | 说明 |
|------|----------|------|
| UID 绑定 | `#绑定uid123456` | 群维度绑定与切换 UID |
| 面板 | `#面板` | 开发中，当前为调试输出 |
| 登录 | `#登录` / `#扫码登录` | 预留，尚未实现 |
| 插件更新 | `#悠悠更新` | 更新插件本体 |
| 清理数据 | `#清除无效数据` | 清理退群用户等脏数据 |

> 具体指令以游戏内 `悠悠帮助` 为准；带 `#` 前缀的写法与帮助页一致。

---

## 开发说明

- **开发记忆库**：[memory/README.md](./memory/README.md) — Wiki 数据、渲染缓存、Guoba 配置等专题文档
- **模块 API 速查**：[插件开发API说明.md](./插件开发API说明.md)
- **插件交流群**：[991709221](https://qm.qq.com/q/Mk3jyhIqSm)
- **游戏交流群**：[点击加群](https://qm.qq.com/q/CwZDY3kUtc)

提交代码请在 fork 本仓库后修改、自测，再提交 Pull Request。

---

## 安装方法

1. 确保已部署 Yunzai Bot。未安装时可参考 [LLBot](https://luckylillia.com/guide/getting-started) + [TRSS-Yunzai](https://gitee.com/TimeRainStarSky/Yunzai)。

2. 在 Yunzai 根目录执行（推荐使用 gitee）：

   ```shell
   git clone --depth=1 https://gitee.com/yoyo-plugin/yoyo-plugin.git ./plugins/yoyo-plugin
   ```

3. 安装依赖：

   ```shell
   cd plugins/yoyo-plugin
   pnpm install
   ```

4. **（可选）** 安装图片库 [yoyo-image](https://gitee.com/yoyo-plugin/yoyo-image)，用于签到等娱乐功能的默认图片：

   ```shell
   git clone --depth=1 https://gitee.com/yoyo-plugin/yoyo-image.git ./plugins/yoyo-image
   ```

   也可自行上传角色图到 `yoyo-plugin/resources/img/hero/`，按角色名分文件夹存放。

5. 首次安装插件后，会从 [BWIKI](https://wiki.biligame.com/ap/) 同步图鉴数据并下载 UI 资源，过程在后台进行，请耐心等待完成后再使用图鉴指令。

---

## 插件配置

推荐使用 [锅巴插件 (guoba-plugin)](https://gitee.com/guoba-yunzai/guoba-plugin) 可视化配置本插件；也可直接编辑 `config/config.yaml`。

---

## 贡献者

感谢以下贡献者对本项目做出的贡献

<a href="https://gitee.com/yoyo-plugin/yoyo-plugin/contributors">
  <img src="https://gitee.com/ZyeAlex.png" width="50" title="ZyeAlex" />
</a>

[查看全部贡献者 →](https://gitee.com/yoyo-plugin/yoyo-plugin/contributors)

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->
