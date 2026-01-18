import { http } from '../utils/http.js'


export const tool_functions = {
    get_weather: async ({ city }) => {

        return '晴天'

    }
}

export const tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "获取城市的天气信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "城市名称"
                    }
                },
                "required": ["city"] // 参数约束
            }
        }
    }
];

