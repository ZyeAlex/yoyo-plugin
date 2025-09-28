import lodash from 'lodash'
import setting from "#setting"
import path from 'path'
/**
 *  支持锅巴
 *  锅巴插件：https://gitee.com/guoba-yunzai/guoba-plugin.git
 *  组件类型，可参考 https://vvbin.cn/doc-next/components/introduction.html
 *  https://antdv.com/components/overview-cn/
 */

export function supportGuoba() {
  let allGroup = [];
  Bot.gl.forEach((v, k) => { k != 'stdin' && allGroup.push({ label: `${v.group_name}(${k})`, value: k }); });
  return {
    pluginInfo: {
      name: 'yoyo-plugin',
      title: '蓝色星原旅谣插件',
      author: '@蓝色星原旅谣',
      authorLink: 'https://gitee.com/yoyo-plugin',
      link: 'https://gitee.com/yoyo-plugin/yoyo-plugin',
      isV3: true,
      description: '「蓝色星原：旅谣」插件，包括角色面板、角色图鉴、角色图片等一系列功能',
      iconPath: path.join(setting.path, '/resources/common/theme/logo_c.png'),
    },
    // 配置项信息
    configInfo: {
      // 配置项 schemas
      schemas: [
        {
          component: "Divider",
          label: "图片配置"
        },
        {
          field: "config.imgPath",
          label: "角色图片库路径",
          // bottomHelpMessage: '',
          component: "GTags",
          componentProps: {
            allowAdd: true,
            allowDel: true,
            showPrompt: true,
            promptProps: {
              content: "请输入图片库路径 (从Yunzai根目录开始，如plugins/xxx)",
              // placeholder: "请输入图标载入地址",
              okText: "添加路径",
              rules: [{ required: true, message: "需要填写地址才行哦~" }]
            }
          }
        },
        {
          field: 'config.imgUpAuth',
          label: '图片上传权限',
          // bottomHelpMessage: '自动撤回模式选择',
          component: 'Select',
          componentProps: {
            options: [
              { label: '所有人', value: 'all' },
              { label: '管理员', value: 'admin' },
              { label: '群主', value: 'owner' },
              { label: '主人', value: 'master' },
            ],
            // placeholder: '自动撤回模式选择',
          },
        },
        {
          field: 'config.imgDelAuth',
          label: '图片删除权限',
          // bottomHelpMessage: '自动撤回模式选择',
          component: 'Select',
          componentProps: {
            options: [
              { label: '所有人', value: 'all' },
              { label: '管理员', value: 'admin' },
              { label: '群主', value: 'owner' },
              { label: '主人', value: 'master' },
            ],
            // placeholder: '自动撤回模式选择',
          },
        },
        {
          field: 'config.imgMaxSize',
          label: '上传图限制',
          bottomHelpMessage: '上传图片大小限制 (MB)',
          component: 'InputNumber',
          required: true,
          componentProps: {
            min: 0,
            max: 25,
            placeholder: '请输入图片大小'
          }
        },



        {
          component: "Divider",
          label: "签到配置"
        },
        {
          field: 'config.signInclude',
          label: '签到群白名单',
          // bottomHelpMessage: '签到群白名单 (默认所有)',
          component: 'Select',
          componentProps: {
            allowAdd: true,
            allowDel: true,
            mode: 'multiple',
            options: allGroup,
          },
        },
        {
          field: 'config.signExclude',
          label: '签到群黑名单',
          // bottomHelpMessage: '',
          component: 'Select',
          componentProps: {
            allowAdd: true,
            allowDel: true,
            mode: 'multiple',
            options: allGroup,
          },
        },


        // {
        //   component: "Divider",
        //   label: "AI配置"
        // },
        // {
        //   field: 'config.apiKey',
        //   component: "Input",
        //   label: 'API-KEY',
        //   bottomHelpMessage: 'DeepSeek api-key',
        // },
        // {
        //   field: 'config.chatLong',
        //   label: '对话长度',
        //   component: 'InputNumber',
        //   required: true,
        //   componentProps: {
        //     min: 0,
        //     max: 100,
        //   }
        // },
        // {
        //   field: 'config.aiInclude',
        //   label: 'AI开启群聊',
        //   bottomHelpMessage: '默认全部关闭',
        //   component: 'Select',
        //   componentProps: {
        //     allowAdd: true,
        //     allowDel: true,
        //     mode: 'multiple',
        //     options: allGroup,
        //   },
        // },

        {
          component: "Divider",
          label: "其他配置"
        },
        {
          field: 'config.rulePrefix',
          label: '插件指令前缀',
          bottomHelpMessage: '插件指令前缀 (正则)',
          component: 'GTags',
          componentProps: {
            allowAdd: true,
            allowDel: true,
          },
        },
        {
          field: 'config.PVList',
          label: '监测PV播放量',
          // bottomHelpMessage: '',
          component: 'GTags',
          componentProps: {
            allowAdd: true,
            allowDel: true,
          },
        },
        {
          field: "config.iconSource",
          label: "图标载入地址",
          bottomHelpMessage: '插件图标载入地址',
          component: 'Select',
          componentProps: {
            allowAdd: true,
            allowDel: true,
            mode: 'multiple',
            options: [
              { label: 'wiki', value: 'wiki' },
              { label: 'gitee', value: 'https://gitee.com/yoyo-plugin/yoyo-icon/raw/master/' }
            ],
            // placeholder: '自动撤回模式选择',
          },
        },



      ],
      // 获取配置数据方法（用于前端填充显示数据）
      getConfigData() {
        return {
          config: setting.config
        }
      },
      // 设置配置的方法（前端点确定后调用的方法）
      setConfigData(data, { Result }) {
        let config = {}
        for (let [keyPath, value] of Object.entries(data)) {
          lodash.set(config, keyPath, value)
        }
        setting.config = config.config
        setting.setData('config/config', config.config)
        return Result.ok({}, '保存成功~')
      }
    },
  }
}
