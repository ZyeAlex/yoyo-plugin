import plugin from '#plugin'
import setting from '#setting'

const regB23 = /(b23\.tv|bili2233.cn)\\?\/\w{7}/
const regBV = /BV1\w{9}/
const regAV = /av\d+/

export const Bili = plugin({
    name: '[悠悠助手]B站解析',
    event: 'message.group',
    priority: 9999,
    rule: [
        {
            reg: regBV,
            fnc: video
        },
        {
            reg: regAV,
            fnc: video
        },
        {
            reg: regB23,
            fnc: video
        }
    ]
})



async function video(e) {
    // 签到过滤
    if (
        !setting.config.bili ||
        setting.config.biliInclude?.length && !setting.config.biliInclude.includes(e.group_id) ||
        setting.config.biliExclude?.length && setting.config.biliExclude.includes(e.group_id) ||
        !e.group_id) return true

    let bvid = ""
    if (e.msg.match(regAV)) {
        let table = 'fZodR9XQDSUm21yCkr6zBqiveYah8bt4xsWpHnJE7jL5VG3guMTKNPAwcF'
        let tr = {}
        for (let i = 0; i < 58; i++) { tr[table[i]] = i }
        const s = [11, 10, 3, 8, 4, 6]
        const xor = 177451812
        const add = 8728348608
        let x = (regAV.exec(e.msg))[0].replace(/av/g, "")
        x = (x ^ xor) + add
        const r = Array.from('BV1  4 1 7  ')
        for (let i = 0; i < 6; i++) {
            r[s[i]] = table[Math.floor(x / 58 ** i) % 58]
        }
        bvid = r.join("")
        if (!(bvid.match(regBV))) return true

    }
    if (e.msg.includes("点赞" && "投币")) return true
    if (e.msg.match(regB23)) {
        bvid = regBV.exec((await fetch("https://" + (regB23.exec(e.msg)[0]).replace(/\\/g, ""))).url)
        if (bvid == null) return true
    }
    if (e.msg.match(regBV)) {
        bvid = regBV.exec(e.msg)
    }
    let res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
        headers: {
            'referer': 'https://www.bilibili.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
        }
    })
    res = await res.json()
    if (res.code != 0) return true

    res = await fetch(`https://api.bilibili.com/x/player/playurl?avid=${res.data.aid}&cid=${res.data.cid}&qn=16&type=mp4&platform=html5`, {
        headers: {
            'referer': 'https://www.bilibili.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
        }
    })

    res = await res.json()

    if (!res || res.code != 0) return true

    e.reply(segment.video(Buffer.from(await (await fetch(res.data.durl[0].url, {
        headers: {
            'referer': 'https://www.bilibili.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
        }
    })).arrayBuffer())))
}