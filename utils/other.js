
import fs from 'fs'
import sharp from 'sharp'
/**
 * 杂项
 */

class Ohter {
  // 两段时间的差值
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
}

export default new Ohter()