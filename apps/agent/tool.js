import setting from '#setting'
import { OpenAI } from 'openai'

let client

export const tool_functions = {

    // 游戏处理
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

    // 图片处理
    analyze_image: async ({ image_urls, description = '请分析图片中的内容', text }, e) => {
        try {
            if (!client) client = new OpenAI({ baseURL: setting.config.baseURL, apiKey: setting.config.apiKey })
            if (text) e.reply(text)
            let response = await client.responses.create({
                model: setting.config.multimodal || setting.config.model,
                input: [
                    {
                        role: 'user',
                        content: [
                            ...image_urls.map(image_url => ({
                                "type": "input_image",
                                "image_url": image_url
                            })),
                            {
                                "type": "input_text",
                                "text": description
                            }
                        ]
                    }
                ]
            })
            return response.output_text
        } catch (error) {
            return '当前模型不支持图片识别，需要配置多模态模型'
        }
    },
    generate_image: async ({ prompt, image, size, text }, e) => {
        if (!setting.config.imgModel) {
            return '未配置图片生成模型'
        }
        if (!client) client = new OpenAI({ baseURL: setting.config.baseURL, apiKey: setting.config.apiKey })
        if (text) e.reply(text)
        let response = await client.images.generate({
            model: setting.config.imgModel,
            prompt,
            image,
            size,
            extra_body: {
                "watermark": true,
            },
        })

        // response.data[0].url

        return `{"res":"图片已生成成功","img_url":"${response.data[0].url}"}`
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
            "name": "analyze_image",
            "description": "对指定图片进行内容分析",
            "parameters": {
                "type": "object",
                "properties": {
                    "image_urls": {
                        "type": ["array"],
                        "description": "需要分析的图片URL地址,传入URL数组",
                        "items": {
                            "type": "string",
                            "description": "图片的URL地址"
                        }
                    },
                    "description": {
                        "type": "string",
                        "description": "需要如何分析图片，比如「请分析图片中的内容」"
                    },
                    "text": {
                        "type": "string",
                        "description": "在分析之前回复给用户的内容，比如「我来看看」"
                    }
                },
                "required": ["image_urls"]
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
                    },
                    "image": {
                        "type": ["string", "array"],
                        "description": "图片的URL地址，当需要修改图片时，传入这个参数，传入单个URL（字符串）或多个URL（数组）均可",
                        "items": { // 仅当类型为数组时生效，定义数组元素类型
                            "type": "string",
                            "description": "单个图片的URL地址"
                        }
                    },
                    "text": {
                        "type": "string",
                        "description": "图片生成前给用户的反馈，比如：我将要为你生成xxx的图片",
                    },
                },
                "required": ["prompt"] // 必填参数
            }
        }
    },
];





