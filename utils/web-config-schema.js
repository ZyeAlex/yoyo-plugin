/** yoyo-plugin 全量配置字段（/yoyo Web UI） */

const AUTH_OPTIONS = [
  { label: '所有人', value: 'all' },
  { label: '管理员', value: 'admin' },
  { label: '群主', value: 'owner' },
  { label: '主人', value: 'master' },
]

export const WEB_SECTIONS = [
  { id: 'basic', label: '基础配置', icon: '⌂', desc: '指令前缀与角色图库' },
  { id: 'fun', label: '娱乐功能', icon: '🎮', desc: '群签到与黑白名单' },
  { id: 'chat', label: '群聊配置', icon: '💬', desc: 'Chat Brain 白名单与模型' },
]

export const WEB_FIELDS = [
  {
    key: 'rulePrefix',
    section: 'basic',
    group: 'prefix',
    groupLabel: '指令前缀',
    label: '插件指令前缀',
    type: 'tags',
    help: '正则前缀，如 ~、#?蓝原',
    span: 2,
  },
  {
    key: 'imgPath',
    section: 'basic',
    group: 'image',
    groupLabel: '角色图库',
    label: '角色图片库路径',
    type: 'tags',
    help: '从 Yunzai 根目录起，如 plugins/yoyo-image',
    span: 2,
  },
  {
    key: 'imgUpAuth',
    section: 'basic',
    group: 'image',
    label: '图片上传权限',
    type: 'select',
    options: AUTH_OPTIONS,
  },
  {
    key: 'imgDelAuth',
    section: 'basic',
    group: 'image',
    label: '图片删除权限',
    type: 'select',
    options: AUTH_OPTIONS,
  },
  {
    key: 'imgMaxSize',
    section: 'basic',
    group: 'image',
    label: '上传大小限制 (MB)',
    type: 'number',
    min: 0,
    max: 25,
  },
  {
    key: 'sign',
    section: 'fun',
    group: 'sign',
    groupLabel: '群签到',
    label: '开启签到',
    type: 'switch',
    layout: 'row',
  },
  {
    key: 'signWithdrawal',
    section: 'fun',
    group: 'sign',
    label: '自动撤回签到图',
    type: 'switch',
    layout: 'row',
  },
  {
    key: 'signInclude',
    section: 'fun',
    group: 'sign',
    label: '白名单群号',
    type: 'tags',
    help: '留空表示不限制；填入群号后仅这些群可签到',
    span: 2,
  },
  {
    key: 'signExclude',
    section: 'fun',
    group: 'sign',
    label: '黑名单群号',
    type: 'tags',
    help: '这些群禁止签到',
    span: 2,
  },

  {
    key: 'chatEnabled',
    section: 'chat',
    group: 'run',
    groupLabel: '运行',
    label: '启用群聊',
    type: 'switch',
    layout: 'row',
  },
  {
    key: 'chatInclude',
    section: 'chat',
    group: 'run',
    label: '白名单群号',
    type: 'tags',
    help: '空=不监听任何群',
    span: 2,
  },
  {
    key: 'chatWakeWords',
    section: 'chat',
    group: 'run',
    label: '唤醒词',
    type: 'tags',
    span: 2,
  },
  {
    key: 'chatPort',
    section: 'chat',
    group: 'run',
    label: '服务端口',
    type: 'number',
    min: 1024,
    max: 65535,
  },
  {
    key: 'chatBufferSize',
    section: 'chat',
    group: 'run',
    label: '近期消息条数',
    type: 'number',
    min: 4,
    max: 100,
  },
  {
    key: 'chatInterruptEnabled',
    section: 'chat',
    group: 'run',
    label: '允许打断思考',
    type: 'switch',
    layout: 'row',
  },
  {
    key: 'chatProactiveEnabled',
    section: 'chat',
    group: 'run',
    label: '主动插话',
    type: 'switch',
    layout: 'row',
    help: '短问/招呼等无人@时也可回（有冷却）',
  },
  {
    key: 'chatProactiveCooldownSec',
    section: 'chat',
    group: 'run',
    label: '主动插话冷却（秒）',
    type: 'number',
    min: 5,
    max: 600,
  },
  {
    key: 'chatProactiveMaxPerMin',
    section: 'chat',
    group: 'run',
    label: '每分钟最多主动回',
    type: 'number',
    min: 1,
    max: 20,
  },
  {
    key: 'chatToolsEnabled',
    section: 'chat',
    group: 'run',
    label: '启用异步工具（画画）',
    type: 'switch',
    layout: 'row',
  },
  {
    key: 'chatLlmApiKey',
    section: 'chat',
    group: 'api',
    groupLabel: '模型 API',
    label: 'API Key',
    type: 'password',
    span: 2,
  },
  {
    key: 'chatLlmBaseUrl',
    section: 'chat',
    group: 'api',
    label: 'Base URL',
    type: 'text',
    help: 'OpenAI 兼容基址，如 https://api.siliconflow.cn/v1',
    span: 2,
  },
  {
    key: 'chatLlmModel',
    section: 'chat',
    group: 'api',
    label: '模型名',
    type: 'text',
    span: 2,
  },
  {
    key: 'chatMaxReplies',
    section: 'chat',
    group: 'api',
    label: '最多气泡数',
    type: 'number',
    min: 1,
    max: 5,
  },
]

export function fieldVisible(field, config) {
  if (!field.showWhen) return true
  return Object.entries(field.showWhen).every(([k, v]) => config[k] === v)
}

export function mergeConfigPatch(current, patch) {
  const next = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    next[key] = value
  }
  return next
}
