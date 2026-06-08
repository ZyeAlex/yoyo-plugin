import lodash from 'lodash'
import setting from "#setting"
import path from 'path'
import fs from 'fs'
/**
 *  支持锅巴
 *  锅巴插件：https://gitee.com/guoba-yunzai/guoba-plugin.git
 *  组件类型，可参考 https://vvbin.cn/doc-next/components/introduction.html
 *  https://antdv.com/components/overview-cn/
 */

export function supportGuoba() {
  let packageJson = JSON.parse(fs.readFileSync(setting.path + '/package.json', 'utf8'));


  const base = [
    {
      component: 'SOFT_GROUP_BEGIN',
      // component: "Divider",
      label: "基础配置"
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

  ]
  
  const fun = [
    {
      component: 'SOFT_GROUP_BEGIN',
      label: "娱乐功能"
    },
    {
      component: "Divider",
      label: "群签到配置"
    },
    {
      field: "config.sign",
      label: "开启签到",
      bottomHelpMessage: "签到领取老婆",
      component: "Switch"
    },
    {
      field: "config.signWithdrawal",
      label: "自动撤回签到图",
      component: "Switch"
    },
    {
      field: 'config.signInclude',
      label: '白名单群',
      component: 'GSelectGroup',
      componentProps: { placeholder: '请选择群聊' },
    },
    {
      field: 'config.signExclude',
      label: '黑名单群',
      component: 'GSelectGroup',
      componentProps: { placeholder: '请选择群聊' },
    }
  ]


  const iconPath = path.join(setting.path, '/resources/common/theme/logo_c.png')
  const pluginInfo = {
    name: packageJson.name,
    title: packageJson.title,
    author: packageJson.author,
    authorLink: packageJson.authorLink,
    link: packageJson.link,
    description: packageJson.description,
    isV3: true,
  }
  if (fs.existsSync(iconPath)) {
    pluginInfo.iconPath = iconPath
  }

  return {
    pluginInfo,
    // 配置项信息
    configInfo: {
      // 配置项 schemas
      schemas: [
        ...base,
        ...fun,
      ],
      // 获取配置数据方法（用于前端填充显示数据）
      getConfigData() {
        return {
          config: setting.config
        }
      },
      // 设置配置的方法（前端点确定后调用的方法）
      setConfigData(data, { Result }) {
        const incoming = {}
        for (const [keyPath, value] of Object.entries(data)) {
          lodash.set(incoming, keyPath, value)
        }
        const patch = incoming.config || {}
        const next = lodash.mergeWith(lodash.cloneDeep(setting.config), patch, (objValue, srcValue) => {
          if (Array.isArray(srcValue)) return srcValue
        })
        setting.config = next
        setting.setData('config/config', next)
        return Result.ok({}, '保存成功~')
      }
    },
  }
}
