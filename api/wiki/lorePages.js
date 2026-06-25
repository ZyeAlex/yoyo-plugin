/** BWIKI 背景 / 资料合集页面定义 */
export const LORE_PAGES = {
  promilia: {
    title: '普罗米利亚',
    slug: 'promilia',
    storagePath: 'data/game/lore/promilia',
    sourceUrl: 'https://wiki.biligame.com/ap/%E6%99%AE%E7%BD%97%E7%B1%B3%E5%88%A9%E4%BA%9A',
    kind: 'lore',
    description: '游戏世界观、地区、阵营、种族等背景设定',
  },
  gameInfo: {
    title: '游戏信息整理合集',
    slug: 'game-info',
    storagePath: 'data/game/lore/game-info',
    sourceUrl: 'https://wiki.biligame.com/ap/%E6%B8%B8%E6%88%8F%E4%BF%A1%E6%81%AF%E6%95%B4%E7%90%86%E5%90%88%E9%9B%86',
    kind: 'reference',
    description: '官方情报合集：开发历程、元素职业、角色奇波索引等',
  },
}

export const LORE_PAGE_LIST = Object.values(LORE_PAGES)

export function getLorePage(slugOrKey) {
  if (LORE_PAGES[slugOrKey]) return LORE_PAGES[slugOrKey]
  return LORE_PAGE_LIST.find(page => page.slug === slugOrKey) || null
}
