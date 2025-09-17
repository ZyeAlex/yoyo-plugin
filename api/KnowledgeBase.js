import OpenAI from "openai";
import setting from "#setting";
import * as lancedb from "@lancedb/lancedb";

/**
 * 知识库交互文件
 * 向量化模型： text-embedding-3-small
 * 向量数据库： LanceDB
 * AI模型： deepseek-chat
 * 数据来源： wiki数据
 * AI中转站： 柏拉图AI
 * 导出函数： loadData(e), searchWiki(query, topK)
 * loadData(e) 传入事件对象，加载数据到向量数据库
 * searchWiki(query, topK) 传入查询内容和返回结果数量，返回查询结果数组
 * 结果对象格式： { score: number, metadata: { text: string, type: string } }
 * type 可能的值： accessory, achievement, building, food
 * 波奇和角色因为wiki不完全，未定
 */



// wiki数据
const accessoryData = setting.accessories
const achievementData = setting.achievements
const buildingData = setting.buildings
const foodData = setting.foods


const apiKey = 'sk-**************************'; // 替换为你的 柏拉图AI API 密钥
const apiUrl = 'https://api.bltcy.ai/v1/'; // 柏拉图AI api地址

// LanceDB 配置
const DB_DIR = `${setting.path}/data/lancedb`;

// 初始化客户端
const client = new OpenAI({
    apiKey: apiKey,
    baseURL: apiUrl,
    timeout: 30000
});

// 处理数据
// 装备文本生成
function generateAccessoryText(equipment) {
    const id = equipment.id ?? '未知ID';
    const name = equipment.name ?? '未知装备';
    const type = getTypeText(equipment.type);
    const rarity = equipment.rarity ?? '未知品质';
    const mainAttr = parseMainAttr(equipment.mainAttr);
    const subAttr = equipment.subAttr ?? '无';
    const headRank = equipment.headRank ?? '无';
    const setId = equipment.setId ?? '无';
    const subParameter = equipment.subParameter ?? '无';
    const exp = equipment.exp ?? '无';
    const desc = equipment.desc ?? '暂无描述';
    const commonItemId = equipment.commonItemId ?? '无';
    const texture = (equipment.texture || []).join(',');

    function getTypeText(type) {
        if (!type) return '未知类型';
        else {
            return type;
        }
    }

    function parseMainAttr(mainAttr) {
        if (!mainAttr) return '无主属性';
        else {
            return mainAttr
        }

    }

    return `装备ID:${id} 名称:${name} 类型:${type} 品质:${rarity} 主属性:${mainAttr} 副属性:${subAttr} 头衔等级:${headRank} 套装:${setId} 子参数:${subParameter} 经验:${exp} 模板ID:${commonItemId} 图标:${texture} 描述:${desc}`;
}


// 成就文本生成
function generateAchievementText(achi) {
    const achiName = achi.achiName ?? '';
    const achiRes = achi.achiRes ?? '';
    const achiPage = achi.achiPage ?? '';
    const reward = achi.reward ?? '';

    const subAchievements = (achi.achievement || [])
        .map(sub => {
            const id = sub.id ?? '';
            const level = sub.achiLevel ?? '';
            const name = sub.achiName ?? '';
            const desc = sub.achiDesc ?? '';
            const finishCondi = sub.finishCondi ?? '';
            const param = sub.param ?? '';
            const nextAchi = sub.nextAchi ?? '';
            const firstAchi = sub.firstAchi ?? '';
            const subReward = sub.reward ?? '';

            return `子成就ID: ${id}，名称: ${name}，等级: ${level}，完成条件: ${finishCondi}，描述: ${desc}，参数: ${param}，下一成就: ${nextAchi}，首成就: ${firstAchi}，奖励: ${subReward}`;
        })
        .join('； ');

    return `成就ID: ${achi.id}，名称: ${achiName}，奖励: ${reward}，图标: ${achiRes}，页面图标: ${achiPage}。${subAchievements}`;
}



// 建筑文本生成
function generateBuildingText(buildingGroup) {
    const name = buildingGroup.name ?? '';
    const type = buildingGroup.type ?? '';

    const buildingLevels = (buildingGroup.building || []).map(level => {
        const lvl = level.level ?? '';
        const lvlName = level.name ?? '';
        const desc = level.desc ?? '';
        const upgradeDesc = level.upgradeDesc ?? '';
        const upgradeCondition = level.upgradeCondition ?? '';
        const material = level.material ?? '';
        const trough = level.trough ?? '';
        const exp = level.exp ?? '';
        const prosperity = level.prosperity ?? '';

        return `等级 ${lvl} (${lvlName}): ${desc} 升级效果: ${upgradeDesc}，所需材料: ${material}，升级条件: ${upgradeCondition}，产量/容量: ${trough}，经验: ${exp}，繁荣度: ${prosperity}`;
    }).join('\n');

    return `建筑: ${name}（类型: ${type}）\n${buildingLevels}`;
}



// 食物文本生成
function generateFoodText(food) {
    const id = food.id ?? '未指明食物ID';
    const name = food.name ?? '未指明食物名称';
    const foodTypeId = food.foodType?.id ?? '未指明食物归属类型ID';
    const foodTypeName = food.foodType?.name ?? '未指明食物归属类型名称';
    const icon = food.icon ?? '未指明食物图标存放路径';
    const unlockLevel = food.unlockLevel ?? '未指明解锁等级';

    const materials = (food.material || []).map(m => {
        const mId = m.id ?? '未指明所需材料ID';
        const mName = m.name ?? '未指明所需材料名称';
        const mDesc = m.desc ?? '未指明所需材料描述';
        const specialDesc = m.specialDesc ?? '未指明所需材料特殊说明';
        const way1desc = m.way1desc ?? '未指明获取方式1说明';
        const way2desc = m.way2desc ?? '未指明获取方式2说明';
        const way3desc = m.way3desc ?? '未指明获取方式3说明';

        return `材料ID: ${mId}，名称: ${mName}，描述: ${mDesc}，特殊说明: ${specialDesc}，获取方式: ${[way1desc, way2desc, way3desc].filter(Boolean).join('、')}`;
    }).join('； ');

    return `食物ID: ${id}，食物名称: ${name}，食物归属类型ID：${foodTypeId}，食物归属类型名称: ${foodTypeName}，食物图标存放路径: ${icon}，解锁等级: ${unlockLevel}。制造所需材料: ${materials}`;
}


// 角色/波奇未定




async function embedText(text) {
    try {
        const res = await client.embeddings.create({
            model: "text-embedding-3-small",
            input: text,
        });

        if (!res?.data?.[0]?.embedding) throw new Error("Embedding response malformed");

        const embedding = res.data[0].embedding;

        return embedding instanceof Float32Array ? embedding : new Float32Array(embedding);
    } catch (err) {
        console.error("[yoyo-plugin]生成向量出错:", err);
        return new Float32Array(1536).fill(0);
    }
}


// 文本拆分函数
function splitText(text, maxLen = 500) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
        const end = Math.min(start + maxLen, text.length);

        // 尝试在句号或逗号处截断，避免生硬切割
        let splitPoint = text.lastIndexOf("，", end);
        if (splitPoint === -1 || splitPoint <= start) {
            splitPoint = text.lastIndexOf("。", end);
        }
        if (splitPoint === -1 || splitPoint <= start) {
            splitPoint = end;
        }

        chunks.push(text.slice(start, splitPoint).trim());
        start = splitPoint;
    }

    return chunks.filter(c => c.length > 0);
}




/**
 * 加载数据到向量数据库
 * @param {*} e 传入的事件对象
 */
export async function loadData(e) {
    try {


        // 成就
        logger.info("[yoyo-plugin]开始写入成就数据...");
        e.reply("[yoyo-plugin]开始写入成就数据...");
        await loadCategoryData('achievement', achievementData);
        logger.info("[yoyo-plugin]成就数据写入完成");
        e.reply("[yoyo-plugin]成就数据写入完成");

        // 食物
        logger.info("[yoyo-plugin]开始写入食物数据...");
        e.reply("[yoyo-plugin]开始写入食物数据...");
        await loadCategoryData('food', foodData);
        logger.info("[yoyo-plugin]食物数据写入完成");
        e.reply("[yoyo-plugin]食物数据写入完成");




        // 装备
        logger.info("[yoyo-plugin]开始写入装备数据...");
        e.reply("[yoyo-plugin]开始写入装备数据...");
        await loadCategoryData('accessory', accessoryData);
        logger.info("[yoyo-plugin]装备数据写入完成");
        e.reply("[yoyo-plugin]装备数据写入完成");



        // 建筑
        logger.info("[yoyo-plugin]开始写入建筑数据...");
        e.reply("[yoyo-plugin]开始写入建筑数据...");
        await loadCategoryData('building', buildingData);
        logger.info("[yoyo-plugin]建筑数据写入完成");
        e.reply("[yoyo-plugin]建筑数据写入完成");



        logger.info("[yoyo-plugin]所有数据已写入向量数据库");
        e.reply("[yoyo-plugin]所有数据已写入向量数据库");
    } catch (error) {
        logger.error("[yoyo-plugin]数据写入过程中出错:", error);
        e.reply(`[yoyo-plugin]数据写入过程中出错`);
    }
}

export async function searchWiki(query, topK = 3) {
    const queryVector = Array.from(await embedText(query));
    const db = await lancedb.connect(DB_DIR);
    const categories = ['accessory', 'achievement', 'building', 'food'];

    const tables = {};
    await Promise.all(categories.map(async category => {
        try {
            tables[category] = await db.openTable(`wiki_${category}`);
        } catch (err) {
            logger.warn(`[searchWiki] 打开表失败: wiki_${category}`, err);
        }
    }));

    const resultsArr = await Promise.all(categories.map(async category => {
        const table = tables[category];
        if (!table) return [];
        try {
            const aa = await table.search(queryVector).limit(topK)
            const results = await aa.toArray();


            return results.map(x => ({
                score: x._distance,
                metadata: x.metadata
            }));
        } catch (err) {
            logger.warn(`[searchWiki] 搜索表 wiki_${category} 出错:`, err);
            return [];
        }
    }));

    const flatResults = resultsArr.flat();
    return flatResults.sort((a, b) => a.score - b.score).slice(0, topK);
}





async function loadCategoryData(category, data) {
    const tableName = `wiki_${category}`;
    const rows = [];
    let num = 0;
    let totalChunks = 0;

    for (const item of data) {
        let text;
        switch (category) {
            case 'accessory': text = generateAccessoryText(item); break;
            case 'achievement': text = generateAchievementText(item); break;
            case 'building': text = generateBuildingText(item); break;
            case 'food': text = generateFoodText(item); break;
            default: text = "未定义的类别"; break;
        }

        const safeText = text || '';
        const chunks = splitText(safeText, 500); // 每 500 字符拆分
        totalChunks += chunks.length;

        for (const [i, chunk] of chunks.entries()) {
            const metadata = {
                text: chunk,
                type: category || '',
                parentId: item.id || 'unknown',  // 父级ID，方便后续聚合
                chunkIndex: i
            };

            const float32Vector = await embedText(chunk);

            logger.info(`[yoyo-plugin]生成${category}向量 ${++num}/${totalChunks} (chunk ${i})`);

            const id = `${category}-${item.id || 'unknown'}-chunk${i}`;

            rows.push({
                id: id,
                vector: Array.from(float32Vector),
                metadata
            });
        }
    }

    try {
        const db = await lancedb.connect(DB_DIR);
        const tableNames = await db.tableNames();

        if (tableNames.includes(tableName)) {
            logger.info(`[yoyo-plugin]删除已存在的表: ${tableName}`);
            await db.dropTable(tableName);
        }

        logger.info(`[yoyo-plugin]创建新表: ${tableName}`);
        await db.createTable(tableName, rows, {
            vectorColumn: "vector",
            vectorIndex: { type: "IVFFlat", metric: "cosine" }
        });

        logger.info(`[yoyo-plugin]表 ${tableName} 创建完成，共写入 ${rows.length} 条记录`);
    } catch (error) {
        logger.error(`[yoyo-plugin]写入${category}数据出错:`, error);
        throw error;
    }
}
