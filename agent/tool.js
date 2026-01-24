import { http } from '../utils/http.js'
import setting from '../utils/setting.js'

export const tool_functions = {
    get_infos: async () => {
        return JSON.stringify({
            角色: Array.from(Object.keys(setting.heroIds)),
            奇波: Array.from(Object.keys(setting.petIds))
        })

    },
    get_info: async ({ name, type }) => {
        switch (type) {
            case 'hero':
                return JSON.stringify(
                    setting.heros[setting.getHeroId(name)]
                )
            case 'kibo':
                return JSON.stringify(
                    setting.pets[setting.petIds[name]]
                )
        }
    }
}

export const tools = [
    {
        "type": "function",
        "function": {
            "name": "get_infos",
            "description": "蓝色星原内角色、奇波列表，遇到疑似游戏内「角色、奇波」的信息，可调用此函数确认",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_info",
            "description": "蓝色星原内某个「角色、奇波」的详细信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "「角色、奇波」的名称"
                    },
                    "type": {
                        "type": "string",
                        "description": "类型，可选值：hero（角色）、kibo（奇波）",
                        "enum": ["hero", "kibo"]
                    },
                },
                "required": ["name", "type"] // 参数约束
            }
        }
    },
];

