// 原作者为@fenglinit，编写了基础代码部分：api调用，敏感词与预设设置等
// 陌(@atri0828a)二改，添加了帮助、实时更改预设、黑名单、对话历史记忆/删除/保存/调取，将不同群聊对话分开，修改了ai对话的触发便捷性，余额查询等
// 感谢@goblins1982提供的私聊无需关键词连续对话功能

// 有bug或者改进建议可以联系陌，QQ2981701287，聊天群1047965118

// 使用前请完成下面的配置，谨慎修改单条消息长度和历史记录长度，因为容易超出deepseekapi的64k的单次token限制 

// 启动时报错未安装依赖的请安装，例如报错缺少依赖openai的参考指令 pnpm i openai(trss崽)/pnpm i openai -w(喵崽)

// 如果你是服务器挂的云崽遇到图片渲染失败的问题，请往下翻找到 #ds帮助 对应的代码（约615行左右）
// 也就是showHelp函数，把原有的函数注释掉（两头添加/*和*/），把备用的showHelp函数去注释化（删除两头的/*和*/）




import { promises as fsPromises } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import plugin from "../../lib/plugins/plugin.js";
import axios from 'axios';
import puppeteer from 'puppeteer';
import yaml from 'yaml';
import fs from 'fs';


/* ---------------------------- 基础配置部分 ---------------------------- */

const Url = "https://api.deepseek.com"; // DeepSeek API 地址，勿动
const Authentication = ""; // 引号内输入你的密钥
const Model = "deepseek-chat"; // 模型，有deepseek-chat和deepseek-reasoner，前者偏向日常聊天，后者偏向逻辑推理
const Temperature = 1.3; // 温度参数，越高文本随机性越强，取值范围0~2
const List = []; // 敏感词列表，可以为空，填写示例：["123", "456"]
let GROUP_MEMBER_SEPARATE = false; // 群成员对话分离开关，true为开启，false为关闭，默认关闭，可用指令临时修改
const yamlPath = 'config/config/other.yaml'; // 主人列表路径，勿动
let masterQQList = [];//勿动


/* ---------------------------- 系统预设配置 ---------------------------- */
//即为AI的人格
const Presets = [
  "你的名字叫云崽，你会像朋友一样进行聊天，性格活泼可爱但仅体现在语气上。语言和普通对话一样简短，不会说出与机器人一般的话语，不会暴露自己机器人的身份。",
  // 预设1：聊天模式
  "你是一个严谨的学术助手，你的名字叫云崽，能够准确解答各种专业知识问题。回答需要包含数据支撑和引用来源。", 
  // 预设2：学术模式
  "你是一个逻辑推理专家，你的名字叫云崽，擅长分析和解决复杂的数学和逻辑问题。回答需分步骤说明推理过程。",
  // 预设3：推理模式
  ];//系统默认第一个，可手动调序切换默认预设


/* -------------------------- 对话管理相关配置 -------------------------- */

const TRIGGER_WORDS = []; // 允许多个触发对话的关键词，记得一并修改系统预设里面对机器人的称呼以防AI胡言乱语，填写示例：["123", "456"]，不可留空
const MAX_INPUT_LENGTH = 2000; // 允许单条消息最多 200 个字符
const SAVE_PATH = "../../resources/deepseekai"; // 对话保存路径
const MAX_HISTORY = 100; // 最大历史记录条数
const REPLY_PROBABILITY = [1.0, 0, 0]; // 多次回复的概率，无需求时一般建议1，0，0
const MIN_REPLY_INTERVAL = 500; // 多次回复间的最小间隔(毫秒)





//数据存储结构初始化
let chatSessions = {};
let savedDialogs = {}; 
const PRESET_SAVE_PATH = path.resolve(__dirname, '../../resources/deepseekai/customPrompts.json');
let customPrompts = {}; // 存储所有用户的自定义预设


// 保存预设函数
async function saveCustomPrompts() {
  try {
    await fsPromises.writeFile(PRESET_SAVE_PATH, JSON.stringify(customPrompts, null, 2));
    logger.info('[deepseekAI] 自定义预设保存成功');
  } catch (err) {
    logger.error(`[deepseekAI] 保存自定义预设失败：${err}`);
  }
}

// 初始化黑白名单
(async () => {
  try {
    whitelist = JSON.parse(await fsPromises.readFile(WHITELIST_PATH, 'utf-8'));
  } catch {
    whitelist = [];
  }

  try {
    blacklist = JSON.parse(await fsPromises.readFile(BLACKLIST_PATH, 'utf-8'));
  } catch {
    blacklist = [];
  }
  logger.info('[deepseekAI] 黑白名单加载完成');
})();



export class deepseekAI extends plugin
{
  static cleanupInterval = null;
  constructor() {
    super({
      name: 'deepseekAI',
      event: 'message',
      priority: 20000000,
      rule: [
          { reg: '^#ds查询版本$', fnc: 'checkVersion' },
          { reg: '^#ds开始对话$', fnc: 'starttalk' },//*    （备注：*用来标记哪些功能黑名单无法使用，^用来标记哪些功能需要管理员/主人/白名单权限）
          { reg: '^#ds结束对话$', fnc: 'endtalk' },//*
          { reg: '^#ds清空对话$|^#清空$', fnc: 'clearHistory' },//*^
          { reg: '^#ds设置预设\\s*([\\s\\S]*)$', fnc: 'setSystemPrompt' },//*^
          { reg: '^#ds清空预设$|^#清除$', fnc: 'clearSystemPrompt' },//*^
          { reg: '^#ds查看预设$', fnc: 'showSystemPrompt' },
          { reg: '^#ds帮助$', fnc: 'showHelp' },
          { fnc: 'checkTrigger',log: false  },//*
          { reg: '^#ds存储对话\\s*(.*)?$', fnc: 'saveDialog' },//*^
          { reg: '^#ds查询对话$', fnc: 'listDialogs' },
          { reg: '^#ds选择对话\\s*(\\S+)$', fnc: 'loadDialog' },//*^
          { reg: '^#ds删除对话\\s*(\\S+)$', fnc: 'deleteDialog' },//*^
          { reg: '^#ds选择预设\\s*(\\d+)$|^#切\\s*(\\d+)$', fnc: 'selectPreset' },//*^
          { reg: '^#ds群聊分离(开启|关闭|状态)$', fnc: 'toggleGroupSeparation' },//*^
          { reg: '^#ds余额查询$', fnc: 'showBalance' },
          { reg: '^#ds(黑名单|白名单)(添加|删除)\\d{5,12}$', fnc: 'manageList' }//*^   白名单无权限使用该指令
      ]
    });
  }
  






  // 定时器逻辑
  initSessionCleaner() {
    // 如果定时器已存在则跳过初始化
    if (this.constructor.cleanupInterval) return;
  
    this.constructor.cleanupInterval = setInterval(() => {
      const now = Date.now();
      Object.entries(chatSessions).forEach(([key, session]) => {
        if (session && session.lastActive) {
          if (now - session.lastActive > 30 * 60 * 1000) {    //30分钟后清理
            delete chatSessions[key];
            logger.info(`[deepseekAI] 会话超时已清理：${key}`);
          }
        } else {
          delete chatSessions[key];
          logger.warn(`[deepseekAI] 发现无效会话已清理：${key}`);
        }
      });
    }, 10 * 60 * 1000); // 保持10分钟检查间隔
  
    logger.info('[deepseekAI] 会话清理定时器已启动');
  }



  // #ds清空对话
  async clearHistory(e) {
    if (this.isBlacklisted(e)) return true;
    if (!await this.isAdminOrMaster(e)) return true;

    const sessionKey = getSessionKey(e);
    if (chatSessions[sessionKey]) {
      chatSessions[sessionKey].history = [];
    }
    e.reply('[当前会话] 对话历史已清空');
    return true;
  }

  // #ds设置预设
async setSystemPrompt(e) {
    if (this.isBlacklisted(e)) return true;
    if (!await this.isAdminOrMaster(e)) return true;

  const sessionKey = getSessionKey(e);
  const match = e.msg.match(/^#ds设置预设\s*([\s\S]*)$/);
  const prompt = match ? match[1].trim() : '';

  // 会话初始化
  if (!chatSessions[sessionKey]) {
    chatSessions[sessionKey] = {
      history: [],
      presetIndex: -1,
      lastActive: Date.now()
    };
  }

  // 设置内存
  chatSessions[sessionKey].customPrompt = prompt;

  // 保存文件
  customPrompts[sessionKey] = {
  customPrompt: prompt
  };

  await saveCustomPrompts();

  e.reply(`[当前会话] 自定义预设已保存：${prompt.substring(0, 50)}...`);
  return true;
}


  // #ds清空预设
async clearSystemPrompt(e) {
  if (this.isBlacklisted(e)) return true;
  if (!await this.isAdminOrMaster(e)) return true;

  const sessionKey = getSessionKey(e);
  if (chatSessions[sessionKey]) {
    chatSessions[sessionKey].presetIndex = 0;  //系统第一个预设
    delete chatSessions[sessionKey].customPrompt;
  }

  if (customPrompts[sessionKey]) {
  delete customPrompts[sessionKey].customPrompt;
  delete customPrompts[sessionKey].presetIndex;
  if (Object.keys(customPrompts[sessionKey]).length === 0) {
    delete customPrompts[sessionKey]; // 全删空
  }
  await saveCustomPrompts();
  }

  e.reply('预设已重置为系统默认');
  return true;
}


  // #ds查看预设
  async showSystemPrompt(e) {
  const sessionKey = getSessionKey(e);

  const session = chatSessions[sessionKey];
  let promptText;

  if (session?.customPrompt) {
    promptText = `自定义预设：${session.customPrompt.substring(0, 1000)}...`;
  } else if (customPrompts[sessionKey]?.customPrompt) {
    promptText = `自定义预设：${customPrompts[sessionKey].customPrompt.substring(0, 1000)}...`;
  } else if (typeof session?.presetIndex === 'number') {
    promptText = `系统预设${session.presetIndex + 1}：${Presets[session.presetIndex].substring(0, 1000)}...`;
  } else if (typeof customPrompts[sessionKey]?.presetIndex === 'number') {
    promptText = `系统预设${customPrompts[sessionKey].presetIndex + 1}：${Presets[customPrompts[sessionKey].presetIndex].substring(0, 1000)}...`;
  } else {
    promptText = '系统默认预设：' + Presets[0].substring(0, 1000) + '...';
  }


  e.reply(`${promptText}`);
  return true;
}


  // #ds帮助
  async showHelp(e) {
  const helpPng = path.resolve(__dirname, '../../resources/deepseekai/help.png');
  
  await ensureHelpHtmlExists();
  await renderHelpToImage(); // 总是重新生成
  
  e.reply(segment.image('file://' + helpPng));
  return true;
}



  // 对话功能
  async chat(e) {
    const sessionKey = getSessionKey(e);
  
    // 初始化会话记录
    if (!chatSessions[sessionKey]) {
      chatSessions[sessionKey] = {
        history: [],
        presetIndex: 0,    // 默认使用第一个系统预设
        lastActive: Date.now()
      };

    // 自动恢复保存的自定义预设
    const saved = customPrompts[sessionKey];
    if (saved) {
      if (saved.customPrompt) {
        chatSessions[sessionKey].customPrompt = saved.customPrompt;
      }
      if (typeof saved.presetIndex === 'number') {
        chatSessions[sessionKey].presetIndex = saved.presetIndex;
      }
    }
    
    // 首次创建会话时初始化定时器
    if (!this.constructor.cleanupInterval) {
      this.initSessionCleaner();
    }
    }
    
    const session = chatSessions[sessionKey];
    let msg = e.msg.trim();
    
    // 输入有效性检查
    if (!msg) {
      e.reply('请输入内容');
      return false;
    }
    if (msg.length > MAX_INPUT_LENGTH) {
      e.reply(`输入文本长度过长，最多允许 ${MAX_INPUT_LENGTH} 个字符`);
      return true;
    }
    if (List.some(item => msg.includes(item))) {
      logger.info(`[deepseekAI] 检测到敏感词，已过滤`);
      e.reply("输入包含敏感词，已拦截");
      return true;
    }
  
    // 更新最后活跃时间
    session.lastActive = Date.now();
  
    // 添加用户消息到历史记录
    session.history.push({ role: "user", content: msg });
  
    // 限制历史记录长度
    if (session.history.length > MAX_HISTORY) {
      session.history = session.history.slice(-MAX_HISTORY);
    }
  
    // API调用部分
    const openai = new OpenAI({
      baseURL: Url,
      apiKey: Authentication,
    });
    
    // API调用时获取当前会话的预设
    const currentPrompt = session.customPrompt || Presets[session.presetIndex ?? 0];
   
    try {
      const completion = await openai.chat.completions.create({
        messages: [
          { role: "system", content: currentPrompt },
          ...session.history
        ],
        temperature: Temperature,
        stream: false,
        model: Model,
      });
  
      const content = completion.choices[0].message.content;
  
      // 敏感词检查
      if (List.some(item => content.includes(item))) {
        logger.info(`[deepseekAI] 检测到输出敏感词：${content}`);
        e.reply("回复包含敏感内容，已拦截");
        return true;
      }
  
      // 添加AI回复到历史记录
      session.history.push({ role: "assistant", content });
  
      // 发送主回复
      await e.reply(content);
      
      // 随机决定是否发送额外回复
      let replyCount = 1;
      while (replyCount < 3) {
        if (Math.random() > REPLY_PROBABILITY[replyCount]) break;
        
        // 延迟后再发送
        await new Promise(resolve => setTimeout(resolve, MIN_REPLY_INTERVAL));
        
        // 使用相同的上下文生成额外回复
        const extraCompletion = await openai.chat.completions.create({
          messages: [
            { role: "system", content: currentPrompt },
            ...session.history
          ],
          temperature: Temperature + 0.2, // 额外回复增加随机性
          stream: false,
          model: Model,
        });
        
        const extraContent = extraCompletion.choices[0].message.content;
        if (!List.some(item => extraContent.includes(item))) {
          await e.reply(extraContent);
          session.history.push({ role: "assistant", content: extraContent });
          replyCount++;
        }
      }
  
      return true;
    } catch (error) {
      // 错误处理
      logger.error(`[deepseekAI] API调用失败：${error}`);
      session.history.pop(); // 移除无效的用户输入记录
      e.reply("对话失败，请稍后重试");
      return false;
    }
  }

  // #ds存储对话
  async saveDialog(e) {
    if (this.isBlacklisted(e)) return true;
    if (!await this.isAdminOrMaster(e)) return true;

  const sessionKey = getSessionKey(e);
  const match = e.msg.match(/^#ds存储对话\s*(.*)$/);
const dialogName = match ? match[1].trim() : '';
  
  const fileName = await saveDialogToFile(e,sessionKey, dialogName);
  if (fileName) {
    e.reply(`对话已保存，文件ID：${fileName}`);
  } else {
    e.reply('对话保存失败（无历史记录或存储错误）');
  }
  return true;
}

  // #ds查询对话
  async listDialogs(e) {
  try {
    const files = await fsPromises.readdir(path.resolve(__dirname, SAVE_PATH));
    const dialogFiles = files
      .filter(f => f.endsWith('.json') && !['customPrompts.json', 'whiteList.json', 'blackList.json'].includes(f))
      .sort((a, b) => fs.statSync(path.resolve(__dirname, SAVE_PATH, b)).mtimeMs -
                      fs.statSync(path.resolve(__dirname, SAVE_PATH, a)).mtimeMs);

    if (!dialogFiles.length) {
      e.reply('当前无保存的对话记录');
      return true;
    }

    const msg = ['当前保存的对话文件如下：'];
    dialogFiles.slice(0, 20).forEach((file, i) => {
      msg.push(`${i + 1}. ${file}`);
    });
    e.reply(msg.join('\n'));
  } catch (err) {
    logger.error(`[deepseekAI] 查询对话出错：${err.message}`);
    e.reply('查询失败，请检查插件文件权限或路径');
  }
  return true;
}


  // #ds选择对话
  async loadDialog(e) {
    if (this.isBlacklisted(e)) return true;
    if (!await this.isAdminOrMaster(e)) return true;

  const match = e.msg.match(/^#ds选择对话\s*(.+\.json)$/);
  if (!match) {
    e.reply('请提供有效的对话文件名（.json）');
    return true;
  }

  const fileName = match[1];
  const filePath = path.resolve(__dirname, SAVE_PATH, fileName);

  try {
    const data = JSON.parse(await fsPromises.readFile(filePath, 'utf-8'));

    const sessionKey = getSessionKey(e);

    chatSessions[sessionKey] = {
      history: data.history || [],
      presetIndex: typeof data.presetIndex === 'number' ? data.presetIndex : 0,
      lastActive: Date.now(),
      model: data.model || defaultModel
    };

    if (data.customPrompt) {
      chatSessions[sessionKey].customPrompt = data.customPrompt;
    }

    e.reply(`对话文件 ${fileName} 已成功载入`);
  } catch (err) {
    logger.error(`[deepseekAI] 对话加载失败：${err.message}`);
    logger.error(err.stack);
    e.reply('对话加载失败，文件可能已损坏');
  }

  return true;
}


  // #ds删除对话
  async deleteDialog(e) {
    if (this.isBlacklisted(e)) return true;
    if (!await this.isAdminOrMaster(e)) return true;

    const match = e.msg.match(/^#ds删除对话\s*(\S+)/);
const fileId = match ? match[1] : '';
    if (!savedDialogs[fileId]) {
      e.reply('无效的对话ID');
      return true;
    }

    try {
      await fsPromises.unlink(path.resolve(__dirname, SAVE_PATH, fileId));
      delete savedDialogs[fileId];
      e.reply('对话记录删除成功');
    } catch (err) {
      logger.error(`[deepseekAI] 删除失败：${err}`);
      e.reply('对话删除失败，请检查文件权限');
    }
    return true;
  }
  
  // #ds选择预设
async selectPreset(e) {
  if (this.isBlacklisted(e)) return true;
  if (!await this.isAdminOrMaster(e)) return true;

  // 同时匹配两种格式的命令
  const match = e.msg.match(/^#ds选择预设\s*(\d+)$|#切\s*(\d+)$/);
  
  // 获取匹配到的数字（可能是第一个或第二个捕获组）
  const num = match ? (match[1] || match[2]) : null;
  
  // 转换为索引（从0开始）
  const index = num ? parseInt(num) - 1 : -1;
  if (isNaN(index)) {
    e.reply('请输入有效的预设编号（数字）');
    return true;
  }

  const sessionKey = getSessionKey(e);
  
  // 会话初始化检查
  if (!chatSessions[sessionKey]) {
    chatSessions[sessionKey] = {
      history: [],
      presetIndex: 0,    // 默认使用第一个系统预设
      lastActive: Date.now()
    };
  }

  if (index >= 0 && index < Presets.length) {
  // 清除自定义预设（包括持久化）
  delete chatSessions[sessionKey].customPrompt;
  customPrompts[sessionKey] = {
      presetIndex: index
    };
  await saveCustomPrompts();

  chatSessions[sessionKey].presetIndex = index;
  e.reply(`已切换至系统预设 ${index + 1}`);
}
 else {
    e.reply(`无效编号，当前可用预设1~${Presets.length}`);
  }
  return true;
}

  // #ds群聊分离
async toggleGroupSeparation(e) {
  if (this.isBlacklisted(e)) return true;
  if (!await this.isAdminOrMaster(e)) return true;

  const action = e.msg.match(/^#ds群聊分离(开启|关闭|状态)$/)[1];
  let replyMsg = '';

  switch (action) {
    case '开启':
      GROUP_MEMBER_SEPARATE = true;
      replyMsg = '已开启：群聊内每个成员的对话将独立记录';
      break;
    case '关闭':
      GROUP_MEMBER_SEPARATE = false;
      replyMsg = '已关闭：群聊内所有成员共用同一对话历史';
      break;
    case '状态':
      replyMsg = `当前群聊对话分离状态：${GROUP_MEMBER_SEPARATE ? '开启' : '关闭'}`;
      break;
  }

  e.reply(replyMsg);
  return true;
}

 // #ds开始对话
  async starttalk(e) {
    if (this.isBlacklisted(e)) return true;

  if (e.isGroup) {
   e.reply('请私聊使用'); // 群聊
  } else {
    //redis设置动作
    await redis.set("deepseek:" + e.user_id + ":action", "start");
    // 私聊
    e.reply('[开始直接对话]...');
  }
    return true;
  }

  // #ds结束对话
  async endtalk(e) {
    if (this.isBlacklisted(e)) return true;

  if (e.isGroup) {
    e.reply('请私聊使用');  // 群聊
  } else {
    //redis设置动作
    await redis.set("deepseek:" + e.user_id + ":action", "end");
    // 私聊
    e.reply('[结束对话]...');
  }
    return true;
  }

  // 版本查询
  async checkVersion(e) {
  const remoteUrls = [
    'https://gitee.com/atri0828a/deepseekAI.js-for-yunzai/raw/master/deepseekAI-2.js',
    'https://raw.githubusercontent.com/Atri0828a/Yunzai-deepseekAI/refs/heads/master/deepseekAI-2.js'
  ];

  let remoteCode = null;
  let successfulUrl = null;

  for (const url of remoteUrls) {
    try {
      const response = await axios.get(url, { timeout: 5000 });
      remoteCode = response.data;
      successfulUrl = url;
      break;
    } catch {
      logger.warn(`[deepseekAI] 无法访问远程地址：${url}`);
    }
  }

  if (!remoteCode) {
    e.reply('版本检查失败，所有远程地址均无法访问');
    return true;
  }

  // 提取远程版本号
  const versionMatch = remoteCode.match(/const\s+version\s*=\s*['"`]([\d.]+)['"`]/);
  const remoteVersion = versionMatch?.[1] ?? '未知';

  // 提取 changelog JSON 字符串（简单匹配整个 changelog 对象）
  const changelogMatch = remoteCode.match(/const\s+changelog\s*=\s*({[\s\S]*?});/);
  let changelogObj = {};
  if (changelogMatch) {
    try {
      // 使用 eval 安全地解析对象字面量
      changelogObj = eval(`(${changelogMatch[1]})`);
    } catch (err) {
      logger.warn('[deepseekAI] changelog 解析失败');
    }
  }

  // 获取远程 changelog
  const remoteChanges = changelogObj?.[remoteVersion] || [];

  let updateMsg = '';
  if (this.compareVersions(remoteVersion, version) > 0) {
    updateMsg = `\n发现新版本 ${remoteVersion} 可供更新`;
  } else {
    updateMsg = `\n当前已是最新版本`;
  }

  const changelogText = remoteChanges.length
    ? `\n\n新版本更新内容：\n- ${remoteChanges.join('\n- ')}`
    : '';

  e.reply(
    `版本信息：\n` +
    `当前版本：${version}\n` +
    `最新版本：${remoteVersion}\n` +
    `数据来源：${successfulUrl}` +
    updateMsg +
    changelogText
  );

  return true;
}



// 版本比较函数
compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

// #ds黑白名单
async manageList(e) {
  const userId = e.user_id.toString();

  // 判断权限
  if (!await this.isAdminOrMaster(e)) return true;
  if (whitelist.includes(userId)) {
    e.reply('白名单用户无权修改黑白名单');
    return true;
  }

  const msg = e.msg.trim();
  const match = msg.match(/^#ds(黑名单|白名单)(添加|删除)(\d{5,12})$/);
  if (!match) {
    e.reply('指令格式错误，请使用 #ds白名单添加/删除12345678');
    return true;
  }

  const [, type, action, targetQQ] = match;
  const list = (type === '黑名单') ? blacklist : whitelist;
  const otherList = (type === '黑名单') ? whitelist : blacklist;
  const pathToFile = (type === '黑名单') ? BLACKLIST_PATH : WHITELIST_PATH;

  if (action === '添加') {
    if (list.includes(targetQQ)) {
      e.reply(`${type}中已存在 ${targetQQ}`);
      return true;
    }
    if (otherList.includes(targetQQ)) {
      e.reply(`${targetQQ} 已在另一名单中，不能重复存在`);
      return true;
    }
    list.push(targetQQ);
    await fsPromises.writeFile(pathToFile, JSON.stringify(list, null, 2));
    e.reply(`已将 ${targetQQ} 添加到${type}`);
  }

  if (action === '删除') {
    const index = list.indexOf(targetQQ);
    if (index === -1) {
      e.reply(`${type}中未找到 ${targetQQ}`);
      return true;
    }
    list.splice(index, 1);
    await fsPromises.writeFile(pathToFile, JSON.stringify(list, null, 2));
    e.reply(`已将 ${targetQQ} 从${type}中移除`);
  }

  return true;
}

}