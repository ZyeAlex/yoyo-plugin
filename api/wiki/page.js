import puppeteer from 'puppeteer'
export const getNotice = async () => {
    // 启动无头浏览器
    const browser = await puppeteer.launch({
        headless: true, // 是否启用无头模式
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // 额外参数，用于提高某些环境下的兼容性
    });

    // 创建新页面
    const page = await browser.newPage();

    // 导航到目标网页
    await page.goto('https://wiki.biligame.com/ap');

    // 等待页面加载完成（可选，根据页面加载情况调整）
    await page.waitForSelector('.BOX-title-1');


    // 提取class为 BOX-title-1且text内容包含“公告”的节点的下一个节点
    const notice = await page.evaluate(() => {
        const noticeNodes = document.querySelectorAll('.BOX-title-1');
        const noticeNode = Object.values(noticeNodes).find(node => node.textContent.includes('公告'));
        if (noticeNode) {
            const nextNode = noticeNode.nextElementSibling;
            if (nextNode && noticeNode.textContent.includes('公告')) {
                // nextNode 下面的 div  下面的第二个 span
                const spans = nextNode.querySelectorAll('div > span:nth-child(2)');
                return Object.values(spans).map(span => {
                    // span下面a标签的herf和a标签的内容
                    const a = span.querySelector('a');
                    return {
                        url: a.href,
                        title: a.textContent,
                    };
                })
            }
        }
        return null;
    });

    // 关闭浏览器
    await browser.close();
    return notice
}