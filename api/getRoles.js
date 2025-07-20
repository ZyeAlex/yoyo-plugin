import puppeteer from 'puppeteer'
export default async () => {

    // puppeteer‌获取网页 https://wiki.biligame.com/ap/%E6%B8%B8%E6%88%8F%E4%BF%A1%E6%81%AF%E6%95%B4%E7%90%86%E5%90%88%E9%9B%86

    // 启动无头浏览器
    const browser = await puppeteer.launch({
        headless: true, // 是否启用无头模式
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // 额外参数，用于提高某些环境下的兼容性
    });

    // 创建新页面
    const page = await browser.newPage();

    // 导航到目标网页
    await page.goto('https://wiki.biligame.com/ap/%E6%B8%B8%E6%88%8F%E4%BF%A1%E6%81%AF%E6%95%B4%E7%90%86%E5%90%88%E9%9B%86');

    // 等待页面加载完成（可选，根据页面加载情况调整）
    await page.waitForSelector('.wikitable');

    // 提取所有class为"wikitable"的表格内容
    const tables = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll('table.wikitable'));
        return tables.map(table => {
            const rows = Array.from(table.rows);
            return rows.map(row => {
                const cells = Array.from(row.cells);
                console.log('cells', cells);
                return cells.map(cell => cell.innerHTML);
            });
        });
    });

    const roleSkills = tables[5].slice(1).reduce((acc, [name, skill, describe]) => {
        acc[name.replace('\n', '')] = {
            skill: {
                name: skill,
                describe
            }
        }
        return acc
    }, {})
    // 关闭浏览器
    await browser.close();
    return roleSkills
}
