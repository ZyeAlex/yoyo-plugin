import bot from 'nodemw'
import setting from '#setting'
import utils from '#utils'
import path from 'path'
import luaparse from 'luaparse'
import https from 'https'
import fs from 'fs'
// wiki 链接
const client = new bot({
    protocol: "https",
    server: "wiki.biligame.com",
    path: "/ap",
    debug: false,
});



// 从wiki拿到角色数据
const getHeroData = async () => {

    const heroIds = await new Promise(res => {
        client.getArticle("模块:Hero", async function (err, data) {
            // error handling
            if (err) {
                logger.info(err);
                return;
            }
            try {
                try {
                    res(await parseLua(data, 'hero_id'))
                } catch (err) {
                    console.error('解析错误:', err);
                }
            } catch (error) {
                logger.info(error)
            }
        });
    })
    let heros = {}
    for (let heroId in heroIds) {
        const data = await new Promise((res, rej) => {
            client.getArticle("模块:Hero/" + heroId, async function (err, data) {
                // error handling
                if (err) return rej()
                try {
                    res(await parseLua(data, 'data'))
                } catch (error) {
                    rej()
                }
            });
        }).catch(() => null)
        if (data) {
            heros[heroId] = data
        } else {
            heros[heroId] = {
                id: heroId,
                name: heroIds[heroId]
            }
        }
    }


    // 时间差
    let time = await redis.get('yoyo:wiki:heroImg')
    if (!time || utils.getDateDiffHours(time, new Date()) >= 1) {
        preGetImg(heros, 'hero')
    } else {
        logger.info(`[yoyo-plugin]🍀🍀🍀🍀🍀 Wiki-hero图标已于一小时内更新，不再重复更新 🍀🍀🍀🍀🍀`)
    }
    return heros
}

// 从 wiki拿到奇波数据
const getPetData = async () => {
}

// 解析Lua  key为属性
async function parseLua(lua, key) {
    function convertExpressionToJS(expr) {
        switch (expr.type) {
            case 'NumericLiteral':
                return expr.value;
            case 'StringLiteral':
                return JSON.parse(expr.raw) || expr.value;  // Note: expr.raw includes quotes, but value is the raw string content
            case 'BooleanLiteral':
                return expr.value;
            case 'NilLiteral':
                return null;
            case 'TableConstructorExpression':
                return convertTableToJS(expr);
            // Add more cases as needed, e.g., for VarargLiteral, Identifier (would require scope resolution), etc.
            default:
                throw new Error(`Unsupported expression type: ${expr.type}`);
        }
    }

    // Main function to convert TableConstructorExpression to JS object
    function convertTableToJS(tableExpr) {
        // 处理数组
        if (tableExpr.fields[0].type === 'TableValue') {
            let arr = []
            tableExpr.fields.forEach(field => {
                const value = convertExpressionToJS(field.value);
                arr.push(value);
            })
            return arr
        }
        // 处理object
        let obj = {};
        tableExpr.fields.forEach(field => {
            if (field.type === 'TableKeyString') {
                // String key: key = value
                const key = field.key.name;
                const value = convertExpressionToJS(field.value);
                obj[key] = value;
            } else if (field.type === 'TableKey') {
                // Expression key: [expr] = value
                const key = convertExpressionToJS(field.key);
                const value = convertExpressionToJS(field.value);
                obj[key] = value;
            } else {
                throw new Error(`Unsupported field type: ${field.type}`);
            }
        });

        return obj;
    }
    return new Promise((res, rej) => {
        // 解析配置选项
        const options = {
            comments: false,    // 不保留注释
            locations: true,    // 记录节点位置
            ranges: true,       // 记录字符范围
            luaVersion: '5.3'   // 指定Lua版本
        };
        // 1. 解析为AST
        const ast = luaparse.parse(lua, options);
        ast.body.filter(
            node => node.type === 'AssignmentStatement'
        ).forEach(assign => {
            assign.variables.forEach((varNode, i) => {
                if (varNode.identifier.name == key) {
                    return res(convertTableToJS(assign.init[i]))
                }
            });
        });
        rej()
    })


}

// 预请求图片
async function preGetImg(obj, type = '') {
    // 定义匹配模式的正则表达式
    const pattern = /^tex_([a-z\d]+_?)*\.(png|jpg|jpeg|gif)$/gi;
    // 递归处理对象
    async function traverse(current) {
        if (typeof current === 'object' && current !== null) {
            for (const key in current) {
                if (current.hasOwnProperty(key)) {
                    if (typeof current[key] === 'string' && pattern.test(current[key])) {
                        // 下载图片
                        if (!(setting.UI.includes(current[key]))) {
                            try {
                                await preDownImg(current[key], await getImgUrl(current[key]))
                                await utils.sleep(500)
                            } catch (error) {
                            }
                        }
                    } else if (typeof current[key] === 'object') {
                        await traverse(current[key]);
                    }
                }
            }
        } else if (Array.isArray(current)) {
            for (let i = 0; i < current.length; i++) {
                if (typeof current[i] === 'string' && pattern.test(current[i])) {
                    if (!(setting.UI.includes(current[i]))) {
                        try {
                            await preDownImg(current[i], await getImgUrl(current[i]))
                            await utils.sleep(500)
                        } catch (error) {

                        }
                    }
                } else if (typeof current[i] === 'object') {
                    await traverse(current[i]);
                }
            }
        }
    }
    await traverse(obj);

    // 将时间存储到redis
    logger.info(`[yoyo-plugin]🍀🍀🍀🍀🍀 Wiki-${type}图标更新完毕，一小时内将不再重复更新🍀🍀🍀🍀🍀`)
    redis.set(`yoyo:wiki:${type}Img`, new Date().toJSON())
}

// 获取图片地址
const getImgUrl = (imgName) => {
    switch (setting.config.iconSource) {
        case 'wiki':
            return new Promise((res, rej) => {
                client.getImageInfo('文件:' + imgName, (err, info) => {
                    if (err || !info?.url) logger.error(`[yoyo-plugin][wiki] ❌️ 未从Wiki查询到图片：${imgName}`)
                    return res(info?.url)
                });
            })
        default:
            return 'https://gitee.com/yoyo-plugin/yoyo-icon/raw/master/' + imgName  // 从 Gitee访问资源
    }
}

// 下载图片
async function preDownImg(imgName, imgUrl) {
    if (!imgUrl) return
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(path.join(setting.path, 'resources/UI', imgName));
        https.get(imgUrl, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                logger.info(`[yoyo-plugin] [${setting.config.iconSource}] ✅ 图片下载成功：${imgName}`)
                setting.UI.push(imgName)
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(path.join(setting.path, 'resources/UI', imgName), () => { });
            reject(err);
        });
    });
}



export {
    getHeroData,
    getPetData
}


