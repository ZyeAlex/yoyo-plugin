<img decoding="async" align=right src="https://gitee.com/yoyo-plugin/yoyo-icon/raw/master/tex_icon_hero_l_101003.png" width="200px">

<div align="left">

# <div align="center">悠悠助手 （ yoyo-plugin ）</div>

<div align="center"> <i>云崽QQ机器人的「蓝色星原：旅谣」插件</i> </div>
<br/>
<div align="center">

![Dynamic JSON Badge](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FZyeAlex%2Fyoyo-plugin%2Frefs%2Fheads%2Fmaster%2Fpackage.json&query=%24.version&label=最新版本)
[<img src="https://img.shields.io/badge/插件交流群-991709221-blue" />](https://qm.qq.com/q/y37cqiS4Ks)
<img src="https://gitee.com/yoyo-plugin/yoyo-plugin/badge/star.svg"/>

</div>
<div align="center"><img src="https://api.moedog.org/count/@ZyeAlex:yoyo-plugin?theme=asoul"  /></div>
</div>


---


## 开发说明

- 插件开发中... 招募美工、招募美工、招募美工...

- 插件交流群：[👉🏻加群讨论](https://qm.qq.com/q/Mk3jyhIqSm)
- 游戏交流群：[👉🏻加群讨论](https://qm.qq.com/q/by4LK6Meqs)

- 提交代码：

  > 请在 [GitHub](https://github.com/ZyeAlex/yoyo-plugin)  fork 本仓库，修改并测试完成后提交PR

- [开发文档](./插件开发API说明.md)

### 插件支持说明
<!-- 合并 -->
<details>
<summary>三方图片库开发支持</summary>

- 三方图库支持

    - 加载图片库

        ```js
        // main.js
        import { img } from '../yoyo-plugin/interface.js'
        let path = 'plugins/yoyo-image' // 要添加的仓库地址，从Bot根路径开始
        img(path)
        ```
    - 图片库格式

      > 图片以「角色名」或「角色ID」命名文件夹，命名需符合官方角色名规范，否则无法读取，推荐使用 「角色ID」来命名避免匹配错误

    - 图片格式

      > 图片无明确长宽要求，图片会默认居中裁切，人物位置居中即可。


- 三方立绘图支持

    - 加载立绘库

        ```js
        // main.js
        import { characterImg } from '../yoyo-plugin/interface.js'
        let path = 'resources/lsxy/character-img' // 要添加的仓库地址，从Bot根路径开始
        characterImg(path)
        ```
    - 立绘库格式

      > 图片以「角色名」或「角色ID」命名文件夹，命名需符合官方角色名规范，否则无法读取，推荐使用 「角色ID」来命名避免匹配错误

    - 立绘图格式

      > 立绘图为透明背景、角色居中图片（参考官方立绘）

- 三方攻略库支持

    - 加载攻略库

        ```js
        // main.js
        import { guide } from '../yoyo-plugin/interface.js'
        let path = 'resources/lsxy/guide' // 要添加的仓库地址，从Bot根路径开始
        characterImg(path,'hero')
        ```
    - 攻略库格式

      > 攻略图以「角色名」或「角色ID」命名文件夹，命名需符合官方角色名规范，否则无法读取，推荐使用 「角色ID」来命名避免匹配错误

    - 攻略图格式

      > .png /.jpg /.gif /.webp /.bmp /.svg


</details> 


## 插件功能

`yoyo-plugin`为查询「蓝色星原：旅谣」信息的插件，包括角色面板、角色图鉴、角色图片等一系列功能

<!-- ✅⬜️ -->
大致包含有：
- Wiki相关
  - ✅ `角色、奇波等图鉴` 
- 角色相关
  - ⬜️ `{角色}攻略`
  - ✅ `{角色}图片`
- 账号相关（需要等游戏上线）
  - ⬜️ `绑定UID`
  - ⬜️ `扫码登陆`
  - ⬜️ `面板查询`
- 娱乐相关
  - ✅ `签到`
  - ✅ `你是什么猪`
  - ✅ `meme表情包`
  - ✅ `进群欢迎`
- 悠悠Agent
  - ✅ 开发中


> 具体功能可在安装插件后 通过 `悠悠帮助` 查看详细指令

### 如果觉得插件对你有帮助的话请点一个star！这是对我们最大的支持和动力！

---

## 安装方法 

1. 确保已部署 Yunzai Bot，如果未安装，推荐使用 [LLBot]( https://luckylillia.com/guide/getting-started ) + [TRSS-Yunzai](https://gitee.com/TimeRainStarSky/Yunzai) 的机器人部署方案

2. 推荐使用git进行安装，方便后续升级，在Yunzai根目录内打开终端执行以下命令（不推荐clone GitHub仓库，该仓库为开发分支）
  - gitee

    ```shell
    git clone --depth=1 https://gitee.com/yoyo-plugin/yoyo-plugin.git ./plugins/yoyo-plugin
    ```
3. 安装环境
    ```shell
    pnpm install
    ```

4. 安装图片库（娱乐互动功能需要）

  - 安装[yoyo-image](https://gitee.com/yoyo-plugin/yoyo-image)

    ```shell
    git clone --depth=1 https://gitee.com/yoyo-plugin/yoyo-image.git ./plugins/yoyo-image
    ```

    > 如果想自己上传图片，请将图片拷贝至 `yoyo-plugin/resources/img/hero/` 下 , 文件夹以角色名命名


## 插件配置

> 推荐使用[锅巴插件](https://gitee.com/guoba-yunzai/guoba-plugin)配置本插件

---

## 贡献者

感谢以下贡献者对本项目做出的贡献

<a href="https://github.com/ZyeAlex/yoyo-plugin/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=ZyeAlex/yoyo-plugin" />
</a>

![Alt](https://repobeats.axiom.co/api/embed/2ea99ed765b7cbc37c5375c5644fe816096f3966.svg "Repobeats analytics image")


<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

