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

  const agent = [
    {
      component: 'SOFT_GROUP_BEGIN',
      label: 'YoAgent',
    },
    {
      field: 'config.agentEnabled',
      label: '启用悠悠',
      bottomHelpMessage: '总开关；关闭后不监听群消息',
      component: 'Switch',
    },
    {
      field: 'config.agentPort',
      label: '后端端口',
      bottomHelpMessage: 'YoAgent 监听端口；修改后需发送 #重启悠悠 生效',
      component: 'InputNumber',
      required: true,
      componentProps: {
        min: 1,
        max: 65535,
        placeholder: '8787',
      },
    },
    {
      field: 'config.agentTimeout',
      label: '请求超时（秒）',
      bottomHelpMessage: '调用 YoAgent 的超时时间，超时后静默不回复',
      component: 'InputNumber',
      required: true,
      componentProps: {
        min: 1,
        max: 600,
        placeholder: '60',
      },
    },
    {
      field: 'config.agentStreamEnabled',
      label: 'SSE 流式回复',
      bottomHelpMessage: '开启后工具执行中会先推送模型状态句；关闭则用同步 HTTP',
      component: 'Switch',
    },
    {
      field: 'config.agentIsAt',
      label: '需 @ 或唤醒词触发',
      bottomHelpMessage: '开启后需 @ 机器人，或消息以「悠悠/小悠」开头、或以「悠悠/小悠+标点」结尾；关闭则每条消息都触发',
      component: 'Switch',
    },
    {
      field: 'config.agentWakeWords',
      label: '唤醒词',
      bottomHelpMessage: 'agentIsAt 开启时，@ 机器人或消息中含「悠悠」「小悠」等唤醒词即可触发（无需 @）',
      component: 'GTags',
      componentProps: {
        placeholder: '悠悠、小悠',
      },
    },
    {
      field: 'config.agentInclude',
      label: '启用群白名单',
      bottomHelpMessage: '留空则不监听任何群；填入群号后仅这些群生效',
      component: 'GSelectGroup',
      componentProps: { placeholder: '请选择群聊' },
    },
    {
      field: 'config.agentBufferSize',
      label: '消息缓冲条数',
      bottomHelpMessage: '触发前保留最近 N 条群消息作为上下文，触发后清空',
      component: 'InputNumber',
      required: true,
      componentProps: {
        min: 1,
        max: 100,
        placeholder: '10',
      },
    },
    {
      component: 'Divider',
      label: 'LLM 与后端',
    },
    {
      field: 'config.agentLlmApiKey',
      label: 'LLM API Key',
      bottomHelpMessage: 'OpenAI 兼容接口密钥；修改后发送 #重启悠悠 生效',
      component: 'InputPassword',
    },
    {
      field: 'config.agentLlmBaseUrl',
      label: 'LLM 基址',
      bottomHelpMessage: '不含 /chat/completions，留空则用官方默认',
      component: 'Input',
      componentProps: { placeholder: 'https://api.openai.com/v1' },
    },
    {
      field: 'config.agentLlmModel',
      label: 'LLM 模型',
      component: 'Input',
      componentProps: { placeholder: 'gpt-4o-mini' },
    },
    {
      field: 'config.agentVisionEnabled',
      label: '图片识别',
      bottomHelpMessage: '开启后用户问图时可调用 describe_image；群聊表情包默认忽略',
      component: 'Switch',
    },
    {
      field: 'config.agentVisionModel',
      label: '视觉模型',
      bottomHelpMessage: '与 LLM 基址/Key 共用；如 doubao-seed-1-6-vision-250815',
      component: 'Input',
      componentProps: { placeholder: 'doubao-seed-1-6-vision-250815' },
    },
    {
      field: 'config.agentVisionMaxImages',
      label: '单次最多分析图片数',
      component: 'InputNumber',
      componentProps: { min: 1, max: 5, placeholder: '2' },
    },
    {
      field: 'config.agentEmoticonEnabled',
      label: '表情包 Sidecar',
      bottomHelpMessage: '从群聊缓冲提取 subType=1 表情包入库；主 Agent 通过 search_emoticons/get_emoticon 两阶段选表情',
      component: 'Switch',
    },
    {
      field: 'config.agentEmoticonMaxIndexPerTurn',
      label: '每次最多索引表情包数',
      component: 'InputNumber',
      componentProps: { min: 1, max: 10, placeholder: '3' },
    },
    {
      field: 'config.agentEmoticonSearchLimit',
      label: 'search_emoticons 默认条数',
      component: 'InputNumber',
      componentProps: { min: 1, max: 20, placeholder: '6' },
    },
    {
      field: 'config.agentEmoticonRecencyHalfLifeDays',
      label: '表情包时效半衰期（天）',
      bottomHelpMessage: '检索排序权重：越近期被群友发出或使用过的表情越靠前',
      component: 'InputNumber',
      componentProps: { min: 1, max: 90, placeholder: '14' },
    },
    {
      field: 'config.agentLogLevel',
      label: '后端日志级别',
      component: 'Select',
      componentProps: {
        options: [
          { label: 'DEBUG', value: 'DEBUG' },
          { label: 'INFO', value: 'INFO' },
          { label: 'WARNING', value: 'WARNING' },
          { label: 'ERROR', value: 'ERROR' },
        ],
      },
    },
    {
      field: 'config.agentMaxOutputTokens',
      label: '最大输出 Token',
      component: 'InputNumber',
      componentProps: { min: 64, max: 8192, placeholder: '512' },
    },
    {
      field: 'config.agentWebMarkdownProvider',
      label: '网页转 Markdown',
      component: 'Select',
      componentProps: {
        options: [
          { label: 'Jina Reader（不可达时直连）', value: 'jina' },
          { label: '直连', value: 'direct' },
          { label: 'Mock（测试）', value: 'mock' },
        ],
      },
    },
    {
      field: 'config.agentJinaApiKey',
      label: 'Jina API Key',
      bottomHelpMessage: '可选，提高 Jina Reader 限速',
      component: 'InputPassword',
    },
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
        ...agent,
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
