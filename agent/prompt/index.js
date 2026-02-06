import fs from 'fs'


// 解析字符串内{}占位符模板，解决内部符号与外层冲突问题
export const compileTemplate = (str) => {
  // 第一步：转义模板字符串特殊符号，避免破坏外层语法
  // 先转义反斜杠（避免后续转义被抵消），再转义反引号
  const escapedStr = str.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
  // 第二步：替换{占位符}为data.$1，生成安全的函数体
  const funcStr = `return \`${escapedStr.replace(/\{(\w+)\}/g, '$\{data.$1\}')}\``;
  // 第三步：生成函数（闭包缓存编译结果）
  return new Function('data', funcStr);
};

// 系统提示语（System Prompt）
export const systemPrompt = compileTemplate(fs.readFileSync(import.meta.dirname + '/system.md', 'utf-8'))



// 黑话迭代提示词
export const slangPrompt = compileTemplate(`黑话名称：【{slang}】当前含义：【{meaning}】当前含义已迭代次数：【{freq}】\n`)

