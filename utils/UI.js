import path from 'path'
import fs from 'fs'
import https from 'https'
import bot from 'nodemw'
import setting from './setting.js'
import utils from './index.js'
/**
 * 下载UI图标
 */

export default function () {
    let UI = fs.readdirSync(path.join(setting.path, '/resources/UI'))
    // 要下载的图片列表
    let imgs = []
    // 是否正在下载图片
    let loading = false
    // 定义匹配模式的正则表达式
    const pattern = /^tex_[a-zA-Z0-9_]+\.(png|jpg|jpeg|gif)$/;
    // 日志
    let logs = {}
    // wiki 链接
    const client = new bot({
        protocol: "https",
        server: "wiki.biligame.com",
        path: "/ap",
        debug: false,
    });


    // 获取help图片
    let { helpGroup, excludeIconReg } = setting.getData('config/help')

    // 递归处理对象
    const traverse = (current) => {
        if (typeof current === 'object' && current !== null) {
            for (const key in current) {
                if (current.hasOwnProperty(key)) {
                    if (typeof current[key] === 'string' && pattern.test(current[key]) && excludeIconReg.every(item => !current[key].includes(item))) {
                        imgs.push(current[key]) // 保存图片地址
                    } else if (typeof current[key] === 'object') {
                        traverse(current[key]);
                    }
                }
            }
        } else if (Array.isArray(current)) {
            for (let i = 0; i < current.length; i++) {
                if (typeof current[i] === 'string' && pattern.test(current[i]) && excludeIconReg.every(item => !current[key].includes(item))) {
                    imgs.push(current[i]) // 保存图片地址
                } else if (typeof current[i] === 'object') {
                    traverse(current[i]);
                }
            }
        }
    }
    // 获取图片地址
    const getImgUrl = (imgName, source) => {
        switch (source) {
            case 'wiki':
                return new Promise((res, rej) => {
                    client.getImageInfo('文件:' + imgName, (err, info) => {
                        if (err || !info?.url) {
                            return rej(`[wiki] ❌️ 未从Wiki查询到图片：${imgName}`)
                        }
                        return res(info?.url)
                    });
                })
            default:
                return source + imgName
        }
    }
    // 下载图片
    const preDownImg = (imgName, imgUrl) => {
        return new Promise(async (resolve, reject) => {
            const file = fs.createWriteStream(path.join(setting.path, 'resources/UI', imgName));
            https.get(imgUrl, (response) => {
                if (response.statusCode != 200) {
                    fs.unlink(path.join(setting.path, 'resources/UI', imgName), () => { });
                    return reject(`[${response.statusCode}] ❌️ ${imgName}下载失败`)
                }
                response.pipe(file);
                file.on('finish', () => resolve(file.close()));
            }).on('error', (err) => {
                fs.unlink(path.join(setting.path, 'resources/UI', imgName), () => { });
                reject(` ❌️ ${err}`);
            });
        });
    }



    // 流程函数
    let getImg = async (obj) => {
        // 时间差
        // 一个小时内不重复更新图标
        let time = await redis.get('yoyo:ui')
        if (time && utils.getDateDiffHours(time, new Date()) < 1) {
            // logger.info(`[yoyo-plugin] 🎈 上次下载图库于一小时内，不再重复下载`)
            return
        }
        // 搜集图标
        traverse(obj)
        let sourceIndex = 0 // 图片源
        // queue内有未处理完任务，且pool内无运行中任务
        while (imgs.length && !loading) {
            let imgName = imgs.shift()// 从queue中取出一张图片
            if (UI.includes(imgName)) continue //过滤
            loading = true
            try {
                const imgUrl = await getImgUrl(imgName, setting.config.iconSource[sourceIndex])
                await preDownImg(imgName, imgUrl)
                UI.push(imgName)
                sourceIndex = 0
            } catch (error) {
                logs[imgName] = [...(logs[imgName] || []), error]
                // 更换图片源
                if (sourceIndex < setting.config.iconSource.length - 1) {
                    imgs.unshift(imgName)
                    sourceIndex++
                } else {
                    UI.push(imgName) // 不再重复下载该图片
                }
            }
            await utils.sleep(500)
            loading = false
        }

        if (!imgs.length) {
            // 保存日志
            setting.setData('data/logs/ui-logs', logs)
            redis.set('yoyo:ui', new Date().toJSON())

        }
    }
    this.getImg = getImg
    getImg(helpGroup)
    return getImg
}