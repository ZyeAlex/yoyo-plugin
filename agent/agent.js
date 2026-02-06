import fs from 'fs'
import YAML from 'yaml';
import path from 'path'
import { slangsDB } from './db.js'
import { tool_functions, tools } from './tool.js'
import { systemPrompt, slangPrompt } from './prompt/index.js'
import { ChatOpenAI } from '@langchain/openai'

import { AIMessage, SystemMessage, HumanMessage } from 'langchain'
// 加载yaml
const { model, apiKey, baseURL, msgCacheLength } = YAML.parse(fs.readFileSync(path.join(import.meta.dirname, '../config/config.yaml'), 'utf8'));


class Agent {
    constructor() {

        // 保存对话内容
        this.groupMsgs = {}
        // 初始化大模型（含Function Call配置）
        this.initModel();
    }

    // 初始化大模型（整合Function Call）
    initModel() {
        this.model = new ChatOpenAI({
            model,
            apiKey,
            configuration: {
                baseURL,
            }
        });
    }

    // 处理工具调用
    async handleToolCall(group_id, res, systemMessage) {
        if (res.tool_calls?.length) {
            for (const tool_call of res.tool_calls) {
                const { name, args, id } = tool_call;
                // 执行工具函数
                const toolResult = await tool_functions[name](args);
                // 将工具结果作为新消息，再次调用模型生成最终回复
                const functionMessage = JSON.stringify({
                    role: 'tool',
                    id,
                    content: toolResult
                });
                // 生成带工具结果的回复
                res = await this.model.invoke([systemMessage, ...this.groupMsgs[group_id], functionMessage]);
            }
        }
        return res;
    }

    /** 处理黑话提取
     * 
     * @param {*} content 机器人回复的content
     * @returns 
     */
    async extractSlangs(content) {
        let finalReply = '';
        try {
            const result = JSON.parse(
                content.replace(/^```\s*json\s*/i, '')
                    .replace(/\s*```\s*$/, '')
                    .trim()
            )
            finalReply = result.messages
            // 提取黑话并批量保存到LanceDB（全局）
            if (Array.isArray(result.slangs) && result.slangs.length > 0) {
                await slangsDB.saveSlangs({
                    slangs: result.slangs || [],
                    meanings: result.meanings || []
                });
            }
        } catch (e) {
            logger.info('黑话提取失败:', content)
            // JSON解析失败，降级使用原始回复（黑话提取失败不影响主流程）
            finalReply = [[{ "type": "text", "text": content }]];
        }

        return finalReply;
    }

    /**
     * 
     * @param {*} param0 
     * @returns 
     */
    async handleMsgs(group_id) {
        if (!msgCacheLength) {
            this.groupMsgs[group_id] = []
        } else {
            this.groupMsgs[group_id] = this.groupMsgs[group_id].slice(-msgCacheLength);
        }
    }

    // 核心聊天方法    messages:[ { user_id,user_name,at,content } ]
    async chat({ group_name, group_id, self_id, messages }) {
        try {

            if (!this.groupMsgs[group_id]) this.groupMsgs[group_id] = []

            // 获取全局有效黑话，融入System Prompt
            const slangs = (await slangsDB.getSlangs()).reduce((s, slang) => s + slangPrompt(slang), '');

            // 拼接最终System Prompt（替换群名+群ID，加入黑话上下文）
            const systemMessage = new SystemMessage(systemPrompt({ group_name, group_id, self_id, slangs }))

            const userMessage = new HumanMessage(JSON.stringify(messages))


            // 单次调用模型
            let res = await this.model.invoke([systemMessage, ...this.groupMsgs[group_id], userMessage], {
                // 传递转换后的工具列表（核心参数）
                tools: tools,
                // 工具调用策略：auto（自动判断是否调用）、none（不调用）、{name: "工具名"}（强制调用指定工具）
                tool_choice: "auto",
            })
            // 保存用户消息
            this.groupMsgs[group_id].push(userMessage)
            // 处理工具调用
            res = await this.handleToolCall(group_id, res, systemMessage)
            // 提取黑话


            let content = await this.extractSlangs(res.content);
            // 保存AI回复
            this.groupMsgs[group_id].push(new AIMessage(JSON.stringify(content)))
            // 处理历史对话
            this.handleMsgs(group_id)
            // 5. 返回最终回复
            return content;

        } catch (error) {
            console.error('聊天处理失败：', error);
            return ['']
        }
    }
}

export default Agent