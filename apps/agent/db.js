// 安装：npm install lowdb
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import fs from 'fs'
import path from 'path'
class Slangs {
    constructor() {
        // recursive: true → 若父文件夹不存在则自动创建，且文件夹已存在时不会报错
        if (!fs.existsSync((path.join(import.meta.dirname, '../data/db/')))) {
            fs.mkdirSync(path.join(import.meta.dirname, '../data/db/'), { recursive: true })
        }
        const adapter = new JSONFile(path.join(import.meta.dirname, '../data/db/slangs.json'))
        this.db = new Low(adapter, {})
        this.db.read()
    }
    // 获取黑话
    async getSlangs() {
        // 查询数据
        return Object.values(this.db.data).sort((a, b) => a.freq - b.freq)
    }
    // 存储黑话
    async saveSlangs({ slangs, meanings }) {
        // 写入数据
        await this.db.read()
        slangs.forEach((slang, i) => {
            const meaning = meanings[i] || ''

            // 迭代
            if (this.db.data[slang]) {
                this.db.data[slang] = {
                    slang,
                    freq: this.db.data[slang].freq + 1,
                    meaning: meaning || this.db.data[meaning] || '未知含义',
                    update: new Date().getTime()
                }
            }
            // 新增
            else {
                this.db.data[slang] = {
                    slang,
                    freq: 1, // 出现频率
                    meaning, // 黑话含义,
                    update: new Date().getTime()
                }
            }
        })
        await this.db.write()
    }
    // 删除已过时黑话
    async delSlangs() {
        await this.db.read()

        await this.db.write()
    }
}

export const slangsDB = new Slangs()