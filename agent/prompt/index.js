import fs from 'fs'


// 解析字符串内{}占位符模板
export const compileTemplate = (str) => {
   // 将占位符替换为对象属性访问，生成函数体
   const funcStr = `return \`${str.replace(/\{(\w+)\}/g, '$\{data.$1\}')}\``;
   // 生成函数（闭包缓存编译结果）
   return new Function('data', funcStr);
}


// 系统提示语（System Prompt）
export const systemPrompt = compileTemplate(fs.readFileSync(import.meta.dirname +'/system.md', 'utf-8'))


// 用户提示词
export const userPrompt = compileTemplate(`用户名：【{user_name}】，用户ID：【{user_id}】，用户是否@你：【{at}】用户发言：【{content}】\n`)


// 黑话迭代提示词
export const slangPrompt = compileTemplate(`黑话名称：【{slang}】当前含义：【{meaning}】当前含义已迭代次数：【{freq}】\n`)

