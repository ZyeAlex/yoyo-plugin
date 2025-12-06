import setting from '#setting'
import plugin from '#plugin'

export const Settings = plugin({
    name: '[悠悠助手]设置',
    event: 'message',
    priority: 100,
    rule: [
        {
            reg: `^#(设置|set)\\s*(.*)$`,
            fnc: settings
        }
    ]
})

async function settings(e,reg) {
    if (!e.isMaster)  return 

    let match = e.msg.match(reg)
    let msg = match ? match[2].trim() : ""
    if (!msg) return await e.reply('请指定要设置的内容，例如：#设置 覆盖帮助 开启')
    let parts = msg.split(/\s+/) 
    
    let keyword = parts[0]
    let action = parts[1] || "" 
    let value = parts.slice(2).join(' ') || "" 
    

    let resultMsg = settingCommand(keyword, action, value)
    await e.reply(resultMsg)

}


const settingMap = {
  "覆盖帮助": "setting.help",
  "help": "setting.help",
  "指令前缀": "rulePrefix",
  "上传图限制": "imgMaxSize",
  "角色图片库路径": "imgPath",
  "签到群白名单": "signInclude",
  "签到群黑名单": "signExclude",
  "监测PV播放量": "PVList",
  "图标载入地址": "iconSource",
  "签到": "sign"
}

const actionMap = {
    "开启": true,
    "关闭": false,
    "on": true,
    "off": false,
    "添加": "add",
    "add": "add",
    "删除": "del",
    "del": "del",
    "查看": "view",
    "view": "view"
}



function settingCommand(keyword, action, value) {
  const fieldEn = settingMap[keyword] || keyword
  
  let config = setting.config
  let currentValue = getDeepValue(config, fieldEn)

  const boolFields = ["setting.help", "sign"]
  const listFields = ["imgPath", "signInclude", "signExclude", "rulePrefix", "PVList", "iconSource"]
  const numberFields = ["imgMaxSize"]
  
  const op = actionMap.hasOwnProperty(action) ? actionMap[action] : null

  if (boolFields.includes(fieldEn)) {
    if (typeof op !== "boolean") return `操作错误：${keyword} 只能 [开启/关闭]`
    setDeepValue(config, fieldEn, op) 

  } else if (listFields.includes(fieldEn)) {
    if (!["add", "del", "view"].includes(op)) return `操作错误：${keyword} 只能 [添加/删除/查看]`
    
    if (!Array.isArray(currentValue)) currentValue = []

    if (op === "view") {
      return `当前 [${keyword}] 列表:\n${currentValue.join("、") || "空"}`
    }

    if (!value) return `请输入要${action}的内容`

    if (op === "add") {
      if (currentValue.includes(value)) return `${value} 已在列表中`
      currentValue.push(value)
    } else if (op === "del") {
      currentValue = currentValue.filter(v => v !== value)
    }
    
    setDeepValue(config, fieldEn, currentValue)

  } else if (numberFields.includes(fieldEn)) {
    if (!action) return `请输入数字`
    const num = Number(action)
    if (isNaN(num)) return `格式错误：${keyword} 需要数字`
    setDeepValue(config, fieldEn, num)

  } else {
    if (!value) return `请输入设置内容`
    setDeepValue(config, fieldEn, value)
  }

  setting.setData('config/config', config)

  return `[悠悠助手]\n✅ 对象: ${keyword} \n✅ 指令: ${action} ${value || ""}`
}

// 辅助函数
function getDeepValue(obj, path) {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

function setDeepValue(obj, path, value) {
    const parts = path.split('.');
    const last = parts.pop();
    const target = parts.reduce((acc, part) => acc[part] = acc[part] || {}, obj);
    target[last] = value;
}

const sortedSettingKeys = Object.keys(settingMap).sort((a, b) => b.length - a.length);


const sortedActionKeys = Object.keys(actionMap).sort((a, b) => b.length - a.length);