
import fastCsv from 'fast-csv'
import setting from './setting.js';

export default async (url) => {
    let heros = {}
    return new Promise((resolve, reject) => {
        fastCsv.parseFile(url, { headers: true })
            .on('data', row => {
                logger.info(row)
                if (row.角色 == '女主角') {
                    row.角色 = '星临者'
                }
                let heroId = setting.getHeroId(row.角色)
                if (heroId) {
                    if (!heros[heroId]) {
                        heros[heroId] = []
                    }
                    delete row.角色
                    heros[heroId].push(row)
                }
            })
            .on('end', () => resolve(heros));
    })
}