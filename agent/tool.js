import { http } from '../utils/http.js'
import setting from '../utils/setting.js'
import YAML from 'yaml';
import path from 'path'
import fs from 'fs'
import { OpenAI } from 'openai'
// 加载yaml
const { imgModel, apiKey, baseURL } = YAML.parse(fs.readFileSync(path.join(import.meta.dirname, '../config/config.yaml'), 'utf8'));

let client

export const tool_functions = {
    get_infos: async () => {
        return JSON.stringify({
            '角色': Array.from(Object.keys(setting.heroIds)),
            '角色的别名(外号)': Object.entries(setting.nicknames).map(([id, nick]) => ({ [setting.heros[id].name]: nick })),
            '奇波': Array.from(Object.keys(setting.petIds))
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
    },
    // 生成图片的核心函数
    generate_image: async ({ prompt, image, size }) => {
        if (!imgModel) {
            return
        }
        if (!client) client = new OpenAI({ baseURL, apiKey })
        let response = await client.images.generate({
            model: imgModel,
            prompt,
            image,
            size,
            extra_body: {
                "watermark": true,
            },
        })
        return '图片生成成功，请将`[CQ:Image]' + response.data[0].url + '`作为一条消息原封不动返回给用户，不要对这条消息做出任何修改或添加'
    },
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
    {
        "type": "function",
        "function": {
            "name": "generate_image",
            "description": "根据用户提供的提示词生成指定风格和尺寸的图片，或者对已有图片进行修改调整",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "图片生成的提示词，描述图片内容、元素、氛围等"
                    },
                    "size": {
                        "type": "string",
                        "description": "图片尺寸，如720x1280、1080x1920等",
                        "default": "1080x1920",
                    },
                    "image": {
                        "type": ["string", "array"],
                        "description": "图片的URL地址，当需要修改图片时，传入这个参数，传入单个URL（字符串）或多个URL（数组）均可",
                        "items": { // 仅当类型为数组时生效，定义数组元素类型
                            "type": "string",
                            "description": "单个图片的URL地址"
                        }
                    }
                },
                "required": ["prompt"] // 必填参数
            }
        }
    },
];





