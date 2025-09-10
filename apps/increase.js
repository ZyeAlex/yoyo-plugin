// import plugin from '../../../lib/plugins/plugin.js'

// /** 冷却cd 30s */
// let cd = 30
// let msg = ''

// export class increase extends plugin {
//   constructor() {
//     // super({
//     //   name: '[悠悠助手]进退群通知',
//     //   event: 'notice.group.increase',
//     //   priority: 9999
//     // })
//   }

//   async accept(e) {
//     /** 定义入群欢迎内容 */


//     if (this.e.user_id === this.e.bot.uin) return
//     /** cd */
//     let key = `Yz:newcomers:${this.e.group_id}`
//     if (await redis.get(key)) return
//     redis.set(key, '1', { EX: cd })

//     let nickname
//     if (e.nickname) {
//       nickname = e.nickname
//     } else if (e.sender && e.sender.card) {
//       nickname = e.sender.card
//     } else {
//       // 从成员列表里获取该用户昵称
//       let memberMap = await e.group.getMemberMap()
//       nickname = (memberMap && memberMap.get(e.user_id)) ? memberMap.get(e.user_id).nickname : ''
//     }


//     /** 回复 */
//     await this.reply([
//       segment.at(this.e.user_id),
//       segment.image(`https://q1.qlogo.cn/g?b=qq&s=0&nk=${e.user_id}`),
//       msg
//     ])
//   }
// }
