/**
 * 杂项
 */

class Ohter {
  formatTimeDiff(timestampDiff) {
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
    if (minutes > 0) parts.push(`${minutes}分`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}秒`); // 至少显示秒
    return parts.join('');
  }
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
}

export default new Ohter()