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
  let allGroup = [];
  Bot.gl.forEach((v, k) => { k != 'stdin' && allGroup.push({ label: `${v.group_name}(${k})`, value: k }); });
  let packageJson = JSON.parse(fs.readFileSync(setting.path + '/package.json', 'utf8'));
  return {
    pluginInfo: {
      name: packageJson.name,
      title: packageJson.title,
      author: packageJson.author,
      authorLink: packageJson.authorLink,
      link: packageJson.link,
      description: packageJson.description,
      isV3: true,
      iconPath: path.join(setting.path, '/resources/common/theme/logo_c.png'),
    },
    // 配置项信息
    configInfo: {
      // 配置项 schemas
      schemas: [

        {
          component: "Divider",
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
          component: "Divider",
          label: "娱乐功能"
        },
        {
          field: "config.sign",
          label: "开启签到",
          component: "Switch"
        },
        {
          field: "config.signWithdrawal",
          label: "是否自动撤回签到图片",
          component: "Switch"
        },
        {
          field: 'config.signInclude',
          label: '签到群白名单',
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
          component: 'Select',
          componentProps: {
            allowAdd: true,
            allowDel: true,
            mode: 'multiple',
            options: allGroup,
          },
        },
        {
          field: "config.emoticon",
          label: "开启表情包",
          component: "Switch"
        },
        {
          field: 'config.emoticonServer',
          label: '表情包服务地址',
          bottomHelpMessage: '可以配置多个，系统将会检测能用的服务器',
          component: 'GTags',
          componentProps: {
            allowAdd: true,
            allowDel: true,
          },
        },

        {
          component: "Divider",
          label: "AI配置"
        },
        {
          field: 'config.baseURL',
          component: "Input",
          label: 'baseURL',
          bottomHelpMessage: '服务URL地址',
        },
        {
          field: 'config.apiKey',
          component: "Input",
          label: 'API-KEY',
          bottomHelpMessage: '服务API-KEY',
        },
        {
          field: 'config.model',
          component: "Input",
          label: '对话模型',
          bottomHelpMessage: '对话模型名称，如`deepseek-R1-20261`',
        },
        {
          field: 'config.imgModel',
          component: "Input",
          label: '图片生成模型',
          bottomHelpMessage: '图片生成模型名称',
        },
        {
          field: 'config.msgCacheLength',
          label: '群组历史',
          bottomHelpMessage: '群组内历史聊天内容长度',
          component: 'InputNumber',
          required: true,
          componentProps: {
            min: 0,
            max: 50,
          }
        },
        {
          field: 'config.MaxUsrMsgCount',
          label: '上下文历史',
          bottomHelpMessage: '上下文对话保存数量',
          component: 'InputNumber',
          required: true,
          componentProps: {
            min: 0,
            max: 50,
          }
        },
        {
          field: 'config.aiInclude',
          label: 'AI开启群聊',
          component: 'Select',
          componentProps: {
            allowAdd: true,
            allowDel: true,
            mode: 'multiple',
            options: allGroup,
          },
        },

        {
          component: "Divider",
          label: "其他配置"
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
        {
          field: "config.increaseInclude",
          label: "进群欢迎配置",
          bottomHelpMessage: "配置进群欢迎内容",
          component: "GSubForm",
          componentProps: {
            multiple: true,
            modalProps: {
              title: "进群欢迎配置"
            },
            schemas: [
              {
                field: "group_id",
                label: "群组",
                required: true,
                component: "Select",
                bottomHelpMessage: "配置「默认」选项后所有群组默认统一返回该欢迎词",
                componentProps: {
                  options: [
                    { label: '默认', value: 0 },
                    ...allGroup.filter(({value}) => !setting.config.increaseInclude?.find(({group_id}) => group_id == value))
                  ],
                },
              },
              {
                field: "text",
                label: "欢迎词",
                required: true,
                component: "Input",
                bottomHelpMessage: "「\\n」为换行"
              }
            ]
          }
        },
        {
          field: 'config.increaseCd',
          label: '进群欢迎间隔',
          bottomHelpMessage: '进群欢迎的间隔时间(单位:s)',
          component: 'InputNumber',
          required: true,
          componentProps: {
            min: 0,
            max: 300,
          }
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
