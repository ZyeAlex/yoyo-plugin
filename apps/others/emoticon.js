import fetch, { Blob, FormData } from "node-fetch"
import plugin from '#plugin'
import setting from "#setting"
import path from "path"
import lodash from "lodash"
import fs from "fs"
import render from '#render'

export const Emoticon = plugin({
  name: '[悠悠助手]表情包',
  event: 'message.group',
  priority: 1145,
  rule: [
    {
      reg: "^#?表情包?开启$",
      fnc: open
    },
    {
      reg: "^#?表情包?关闭$",
      fnc: close
    },
    {
      reg: "^#?表情包?列表$",
      fnc: list
    }
  ],
  func: [accept]
})


// 中文对照表
let dict = {}
// 表情包列表
let arr = {
  img: [],  // 图片表情包
  text: []  // 文字表情包
}
const res = JSON.parse(fs.readFileSync(path.join(setting.path, '/data/db/emoticon.json')))
for (const v of Object.values(res)) {
  if (v.params_type.min_images) {
    arr.img.push(v.keywords)
  } else {
    arr.text.push(v.keywords)
  }
  for (const i of v.keywords) {
    dict[i] = v
  }
}

async function accept(e) {
  if (!e.msg || !setting.config.emoticon) return true

  const match = e.msg.match?.(new RegExp(`^(${Object.keys(dict).join("|")})`))?.[0]
  if (!match) return
  const keyword = e.msg.split(" ")
  keyword[0] = keyword[0].replace(match, "")
  const id = keyword[0] || e.at || e.user_id
  const item = dict[match]

  const pick = await e.group?.pickMember?.(id) || await e.bot?.pickFriend?.(id)
  const info = await pick?.getInfo?.() || pick?.info || pick
  const name = info?.card || info?.nickname

  const formData = new FormData()

  if (item.params_type.min_images > 0) {
    // 可以有图，来从回复、发送和头像找图
    let imgUrls = []
    if (e.source || e.reply_id) {
      // 优先从回复找图
      let reply
      if (e.getReply) {
        reply = await e.getReply()
      } else if (e.source) {
        if (e.group?.getChatHistory)
          reply = (await e.group.getChatHistory(e.source.seq, 1)).pop()
      }
      if (reply?.message) {
        for (let val of reply.message) {
          if (val.type === 'image' || val.type === "file") {
            imgUrls.push(val.url)
          }
        }
      }
    } else if (e.img) {
      imgUrls.push(...e.img)
    } else if (e.message.filter(m => m.type === 'at').length > 0) {
      // 艾特的用户的头像
      let ats = e.message.filter(m => m.type === 'at')
      imgUrls = ats.map(at => at.qq).map(qq => `https://q1.qlogo.cn/g?b=qq&s=160&nk=${qq}`)
    }
    if (!imgUrls || imgUrls.length === 0) {
      // 如果都没有，用发送者的头像
      imgUrls = [`https://q1.qlogo.cn/g?b=qq&s=160&nk=${e.user_id}`]
    }
    if (imgUrls.length < item.params_type.min_images && imgUrls.indexOf(`https://q1.qlogo.cn/g?b=qq&s=0&nk=${e.user_id}`) === -1) {
      // 如果数量不够，补上发送者头像，且放到最前面
      let me = [`https://q1.qlogo.cn/g?b=qq&s=160&nk=${e.user_id}`]
      imgUrls = me.concat(imgUrls)
    }

    imgUrls = imgUrls.slice(0, Math.min(item.params_type.max_images, imgUrls.length))
    for (let imgUrl of imgUrls) {
      const imgRes = await fetch(imgUrl)
      const buffer = Buffer.from(await imgRes.arrayBuffer())
      formData.append("images", new Blob([buffer]))
    }
  }

  if (item.params_type.min_texts != 0)
    for (let i = 0; i < keyword.length - 1; i++)
      formData.append("texts", keyword[i + 1])

  let args
  if (item.params_type.min_texts == 0 & keyword[1] != undefined)
    args = handleArgs(item.key, keyword[1], [{ text: name, gender: "unknown" }])
  else
    args = handleArgs(item.key, "", [{ text: name, gender: "unknown" }])
  if (args)
    formData.set("args", args)

  const res = await fetch(new URL(`memes/${item.key}/`, setting.config.emoticonServer[0]), { method: "POST", body: formData })

  if (res.status > 299)
    return true

  const resultBuffer = Buffer.from(await res.arrayBuffer())
  return e.reply(segment.image(resultBuffer))
}


function handleArgs(key, args, userInfos) {
  let argsObj = {}
  switch (key) {
    case "look_flat":
      argsObj = { ratio: parseInt(args) || 2 }
      break
    case "crawl":
      argsObj = { number: parseInt(args) || lodash.random(1, 92, false) }
      break
    case "symmetric": {
      const directionMap = {
        左: "left",
        右: "right",
        上: "top",
        下: "bottom"
      }
      argsObj = { direction: directionMap[args.trim()] || "left" }
      break
    }
    case "petpet":
    case "jiji_king":
    case "kirby_hammer":
      argsObj = { circle: args.startsWith("圆") }
      break
    case "my_friend":
      if (!args) args = lodash.trim(userInfos[0].text, "@")
      argsObj = { name: args }
      break
    case "looklook":
      argsObj = { mirror: args === "翻转" }
      break
    case "always": {
      const modeMap = {
        "": "normal",
        循环: "loop",
        套娃: "circle"
      }
      argsObj = { mode: modeMap[args] || "normal" }
      break
    }
    case "gun":
    case "bubble_tea": {
      const directionMap = {
        左: "left",
        右: "right",
        两边: "both"
      }
      argsObj = { position: directionMap[args.trim()] || "right" }
      break
    }
  }
  argsObj.user_infos = userInfos.map(u => {
    return {
      name: lodash.trim(u.text, "@"),
      gender: u.gender
    }
  })
  return JSON.stringify(argsObj)
}




function open(e) {
  if (!e.isMaster) {
    e.reply('仅管理员可以设置！')
    return true
  }
  setting.config.emoticon = true
  setting.setData('config/config', setting.config)
  return e.reply("表情功能已开启")
}

function close(e) {
  if (!e.isMaster) {
    e.reply('仅管理员可以设置！')
    return true
  }
  setting.config.emoticon = false
  setting.setData('config/config', setting.config)
  return e.reply("表情功能已关闭")
}

async function list(e) {
  await render(e, 'emoticon/index', arr, { origin: '土块插件' })
}