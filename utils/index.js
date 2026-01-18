
import fs from 'fs'
import sharp from 'sharp'
import common from '../../../lib/common/common.js'
/**
 * 杂项
 */
class Utils {
  // 节流函数
  throttle(func, delay) {
    let lastCall = 0;
    return function (...args) {
      const now = new Date().getTime();
      if (now - lastCall < delay) return;
      lastCall = now;
      return func.apply(this, args);
    };
  }
  // 两段时间的差值
  formatTimeDiff(timestampDiff, t = 'm') {
    // 确保差值为正数
    const diff = Math.abs(timestampDiff);
    // 计算各时间单位
    const totalSeconds = Math.floor(diff / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);
    // 构建结果数组
    const parts = [];
    if (hours > 0) parts.push(`${hours}小时`);
    if (minutes > 0 && t != 'h') parts.push(`${minutes}分钟`);
    if (t == 's' && (seconds > 0 || parts.length === 0)) parts.push(`${seconds}秒`); // 至少显示秒
    return parts.join('');
  }
  // 时间格式化 YYYY-MM-DD hh:mm:ss
  formatDate(date, formatStr) {
    if (!date) date = new Date()
    if (typeof date == 'string' || typeof date == 'number') {
      date = new Date(date)
    }
    if (!formatStr) return new Date(date)
    if (formatStr === 'x') return new Date(date).getTime()
    let ret
    let d = {
      year: date.getFullYear().toString(),
      month: (date.getMonth() + 1).toString(),
      day: date.getDate().toString(),
      hour: date.getHours().toString(),
      minutes: date.getMinutes().toString(),
      seconds: date.getSeconds().toString(),
      week: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.getDay()],
    }
    let keys = {
      'YYYY': d.year,
      'YY': d.year.slice(2),
      'M+': d.month,
      'D+': d.day,
      '[Hh]+': d.hour,
      'm+': d.minutes,
      's+': d.seconds,
      '[Ww]+': d.week,
    }
    for (let key in keys) {
      ret = new RegExp('(' + key + ')').exec(formatStr)
      if (ret) {
        formatStr = formatStr.replace(ret[1], keys[key].padStart(ret[1].length, '0'))
      }
    }
    return formatStr
  }
  // 判断a和b相差天数
  getDateDiffDays(timestampA, timestampB) {
    // 创建日期对象
    const dateA = new Date(timestampA);
    const dateB = new Date(timestampB);

    // 重置为当天0点（忽略时分秒毫秒）
    const startOfDayA = new Date(dateA);
    startOfDayA.setHours(0, 0, 0, 0);

    const startOfDayB = new Date(dateB);
    startOfDayB.setHours(0, 0, 0, 0);

    // 计算时间戳差值（毫秒）
    const diffMilliseconds = Math.abs(startOfDayB - startOfDayA);

    // 转换为天数（1天 = 86400000毫秒）
    return Math.floor(diffMilliseconds / 86400000);
  }

  getDateDiffHours(time1, time2, absValue = true) {
    const date1 = new Date(time1);
    const date2 = new Date(time2);
    const diffMs = date2.getTime() - date1.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    return absValue ? Math.abs(diffHours) : diffHours;
  }

  // 转换为base64
  async compressImageToBase64(inputPath, size = 200, quality = 50) {
    try {
      // 读取图片并压缩
      const inputBuffer = await fs.promises.readFile(inputPath);
      const buffer = await sharp(inputBuffer)
        .jpeg({
          quality,          // JPEG 质量 (1-100)
          mozjpeg: true     // 启用更高效的 MozJPEG 压缩
        })
        .resize(200)        // 限制宽度为 800px（保持比例）
        .toBuffer();

      // 转换为 Base64
      const base64 = buffer.toString('base64');
      const mimeType = 'image/jpeg';
      return `data:${mimeType};base64,${base64}`;

    } catch (error) {
      throw new Error(`处理图片失败: ${error.message}`);
    }
  }

  /**
 *
 * 制作转发消息
 * @param e
 * @param msg 消息体
 * @param dec 描述
 * @returns {Promise<boolean|*>}
 */
  async makeForwardMsg(e, msg = [], dec = '') {
    const bot = e.bot || Bot
    let nickname = bot.nickname
    if (e.isGroup && bot.getGroupMemberInfo) try {
      const info = await bot.getGroupMemberInfo(e.group_id, bot.uin)
      nickname = info.card || info.nickname
    } catch { }

    let forwardMsg = []
    msg.forEach(v => {
      forwardMsg.push({
        user_id: bot.uin || e.self_id,
        nickname,
        message: v,
      })
    })

    /** 制作转发内容 */
    if (e.group?.makeForwardMsg) {
      forwardMsg = await e.group.makeForwardMsg(forwardMsg)
    } else if (e.friend?.makeForwardMsg) {
      forwardMsg = await e.friend.makeForwardMsg(forwardMsg)
    } else {
      forwardMsg = await Bot.makeForwardMsg(forwardMsg)
    }
    if (dec) {
      /** 处理描述 */
      if (typeof (forwardMsg.data) === 'object') {
        let detail = forwardMsg.data?.meta?.detail
        if (detail) {
          detail.news = [{ text: dec }]
        }
      } else {
        forwardMsg.data = forwardMsg.data
          .replace(/\n/g, '')
          .replace(/<title color="#777777" size="26">(.+?)<\/title>/g, '___')
          .replace(/___+/, `<title color="#777777" size="26">${dec}</title>`)
      }
    }

    return forwardMsg
  }

  /**
   * 获取用户权限
   * @param {*} e - 接收到的事件对象
   * @param {"master"|"admin"|"owner"|"all"} permission - 用户所需的权限
   * @param {object} opts - 可选参数对象
   * @param {object} opts.groupObj - 群对象
   * @param {boolean} opts.isReply - 是否发送消息
   * @returns {boolean|string} - 是否具有权限
   * 
   * @eg
   * checkPermission(e,'admin')  
   * 返回当前用户是否拥有admin权限
   */
  checkPermission(e, permission = "all", {
    groupObj = e.group || (e.bot ?? Bot)?.pickGroup?.(e.group_id),
    isReply = true
  } = {}) {
    if (!groupObj && permission != "master") throw new Error("未获取到群对象")
    let msg = true
    // 判断权限
    if (!e.isMaster) {
      const memberObj = groupObj && groupObj.pickMember(e.user_id)
      if (permission == "master") {
        msg = "❎ 该命令仅限主人可用"
      } else if (permission == "owner" && !memberObj.is_owner) {
        msg = "❎ 该命令仅限群主可用"
      } else if (permission == "admin" && !memberObj.is_admin && !memberObj.is_owner) {
        msg = "❎ 该命令仅限管理可用"
      }
    }
    if (isReply && msg !== true) {
      e.reply(msg, true)
    }
    if (msg !== true) {
      throw new Error(msg)
    }
  }

  /**
   * 在候选列表中查找与目标字符串最相似的项，并返回其对应的键（id）。
   *
   * @param {string} target - 要匹配的目标字符串。
   * @param {Object.<string, Object>} candidates - 候选对象，键为 id，值为{id,name}对象（角色名列表）。
   * @param {number} [score=0.5] - 最低相似度阈值（0~1 之间），低于此值则返回 `undefined`。
   * 
   * @returns {string|undefined} - 返回匹配到的候选项 id，如果没有达到阈值则返回 `undefined`。
   */
  findBestMatch(target, candidates, score = 0.5) {
    // 相似度计算（内部闭包）
    function similarity(a, b) {
      // 归一化
      const normalize = s =>
        String(s).toLowerCase().replace(/[^\p{sc=Han}a-z0-9]/giu, '')

      const na = normalize(a)
      const nb = normalize(b)
      if (!na || !nb) return 0
      if (na === nb) return 1
      if (na.includes(nb) || nb.includes(na)) {
        const ratio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length)
        return Math.max(0.6, ratio)
      }

      // Levenshtein 距离
      const levenshtein = (x, y) => {
        const m = x.length, n = y.length
        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
        for (let i = 0; i <= m; i++) dp[i][0] = i
        for (let j = 0; j <= n; j++) dp[0][j] = j
        for (let i = 1; i <= m; i++) {
          for (let j = 1; j <= n; j++) {
            const cost = x[i - 1] === y[j - 1] ? 0 : 1
            dp[i][j] = Math.min(
              dp[i - 1][j] + 1,
              dp[i][j - 1] + 1,
              dp[i - 1][j - 1] + cost
            )
          }
        }
        return dp[m][n]
      }

      const dist = levenshtein(na, nb)
      const maxLen = Math.max(na.length, nb.length)
      return 1 - dist / Math.max(1, maxLen)
    }

    let best = { value: null, score: 0 }
    Object.entries(candidates).forEach(([id, { name }]) => {
      const n = name;
      const s = similarity(target, n);
      if (s > best.score) {
        best = { value: id, score: s };
      }
    })

    if (best?.score >= score && best.value) {
      return best.value
    }
  }




}

export default Object.assign(new Utils(), common)