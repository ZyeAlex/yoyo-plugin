/** YoAgent 聊天接口路径（相对服务根地址） */
export const AGENT_CHAT_PATH = '/api/chat'
export const AGENT_MESSAGES_PATH = '/api/messages'

const DEFAULT_AGENT_PORT = 8787

/** 读取 YoAgent 后端端口 */
export function getAgentPort(cfg) {
  const port = Number(cfg?.agentPort)
  return port > 0 ? port : DEFAULT_AGENT_PORT
}

/** 根据端口拼接 YoAgent 根地址 */
export function getAgentBaseURL(cfg) {
  return `http://127.0.0.1:${getAgentPort(cfg)}`
}

/**
 * POST body:
 * {
 *   request_id,
 *   session: { session_id, group_id, bot_id },
 *   caller: { user_id, user_name, group_role, is_master },
 *   messages: [{ message_id, user_id, sender, message, raw_message?, time?, reply? }]
 * }
 * messages 为 OneBot v11 原格式；reply 为被引用消息的同样结构（插件侧补全）
 */
