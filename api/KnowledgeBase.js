import OpenAI from "openai";
import setting from "#setting";

/**
 * 知识库交互文件
 * 向量化模型： text-embedding-3-small
 * 向量数据库： LanceDB
 * 数据库位置： ./data/lancedb
 * AI模型： deepseek-chat
 * 数据来源： wiki数据
 * AI中转站： 柏拉图AI
 * 导出函数： loadData(e), searchWiki(query, topK)
 * loadData(e) 传入事件对象，加载数据到向量数据库
 * searchWiki(query, topK) 传入查询内容和返回结果数量，返回查询结果文本
 * 波奇和角色因为wiki不完全，未定
 */



// wiki数据
const accessoryData = cleanEmptyFields(setting.accessories)
const achievementData = cleanEmptyFields(setting.achievements)
const buildingData = cleanEmptyFields(setting.buildings)
const foodData = cleanEmptyFields(setting.foods)


const apiKey = setting.config.embedding.apiKey; // 替换为你的 柏拉图AI API 密钥
const apiUrl = setting.config.embedding.baseURL; // 柏拉图AI api地址
const model = setting.config.embedding.model || 'text-embedding-3-small'; // 使用的嵌入模型

// if (apiKey === '' || apiKey === null || apiKey === undefined) {
//     throw new Error("请在配置文件中填写向量化的apiKey");
// }
// if (apiUrl === '' || apiUrl === null || apiUrl === undefined) {
//     throw new Error("请在配置文件中填写向量化的apiUrl");
// }
// if (model === '' || model === null || model === undefined) {
//     logger.warn("未在配置文件中填写向量化的model，默认使用 text-embedding-3-small");
// }

// LanceDB 配置
const DB_DIR = `${setting.path}/data/lancedb`;

// 初始化客户端
const client = new OpenAI({
    apiKey: apiKey,
    baseURL: apiUrl,
    timeout: 30000
});

// ======================================
// 数据洗练
// ======================================
/**
 * 递归清理对象或数组中所有 null、undefined、空字符串字段
 * @param {Object|Array} obj
 * @returns {Object|Array}
 */
function cleanEmptyFields(obj) {
    if (Array.isArray(obj)) {
        return obj
            .map(cleanEmptyFields)
            .filter(item => {
                // 过滤掉空对象或空数组
                if (item === null || item === undefined) return false;
                if (typeof item === "string" && item.trim() === "") return false;
                if (Array.isArray(item) && item.length === 0) return false;
                if (typeof item === "object" && Object.keys(item).length === 0) return false;
                return true;
            });

    } else if (typeof obj === "object" && obj !== null) {
        const cleaned = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value === null || value === undefined) continue;
            if (typeof value === "string" && value.trim() === "") continue;

            const nested = cleanEmptyFields(value);
            if (nested === null) continue;
            if (typeof nested === "object" && Object.keys(nested).length === 0) continue;

            cleaned[key] = nested;
        }
        return cleaned;
    } else {
        return obj; // 基本类型直接返回
    }
}

// ======================================
// 数据处理
// ======================================
async function splitAllDataIntoTrunks() {
    let accessoryTrunk = []
    let achievementTrunk = []
    let buildingTrunk = []
    let foodTrunk = []
    let len = 0;


    accessoryData.forEach(accessory => {
        accessoryTrunk.push(...splitEquipmentToChunks(accessory, 500));
    });
    achievementData.forEach(achievement => {
        achievementTrunk.push(...splitAchievementToChunks(achievement, 500));
    });
    buildingData.forEach(building => {
        buildingTrunk.push(...splitBuildingToChunks(building, 500));
    });
    foodData.forEach(food => {
        foodTrunk.push(...splitFoodToChunks(food, 500));
    });

    len = accessoryTrunk.length
        + achievementTrunk.length
        + buildingTrunk.length
        + foodTrunk.length;
    return {
        accessoryTrunk,
        achievementTrunk,
        buildingTrunk,
        foodTrunk,
        len
    };
}

/**
 * 将装备数据拆分
 * @param {Object} equip - 一条清理过空字段的装备对象
 * @param {number} maxLen - 每个 chunk 最大长度
 * @returns {Array<{id: string, text: string}>}
 */
function splitEquipmentToChunks(equip, maxLen = 500) {
    const chunks = [];

    // 完整有效字段映射
    const fieldMap = {
        "装备ID": equip.id,
        "装备名": equip.name,
        "装备星级": equip.rarity,
        "装备类型": equip.type,
        "装备头部等级": equip.headRank,
        "装备套装ID": equip.setId,
        "装备主属性": equip.mainAttr,
        "装备副属性": equip.subAttr,
        "装备子参数": equip.subParameter,
        "装备经验": equip.exp,
        "通用物品ID": equip.commonItemId,
        "描述": equip.desc
    };

    // 拼接成文本，只保留有值的
    const texts = [];
    for (const [key, value] of Object.entries(fieldMap)) {
        if (value === null || value === undefined) continue;
        if (typeof value === "string" && value.trim() === "") continue;
        if (Array.isArray(value) && value.length === 0) continue;
        texts.push(`${key}: ${value}`);
    }


    if (texts.length > 0) {
        chunks.push({
            id: `equipment_${equip.id}`,
            parentId: equip.id,
            text: texts.join('\n').trim()
        });
    }

    return chunks;
}



/**
 * 将成就数据拆分
 * @param {Object} achiGroup - 一条清理过空字段的成就对象
 * @param {number} maxLen - 每个 chunk 最大长度
 * @returns {Array<{id: string, text: string}>}
 */
function splitAchievementToChunks(achiGroup, maxLen = 500) {
    const chunks = [];

    // 拼接成就组有效字段
    const groupFields = {
        "成就组ID": achiGroup.id,
        "成就组名": achiGroup.achiName,
        "组奖励": achiGroup.reward
    };

    const groupTexts = [];
    for (const [key, value] of Object.entries(groupFields)) {
        if (value === null || value === undefined) continue;
        if (typeof value === "string" && value.trim() === "") continue;
        if (Array.isArray(value) && value.length === 0) continue;
        groupTexts.push(`${key}: ${value}`);
    }


    if (groupTexts.length > 0) {
        chunks.push({
            id: `achievement_${achiGroup.id}`,
            parentId: achiGroup.id,
            text: groupTexts.join('\n').trim()
        });
    }


    achiGroup.achievement?.forEach((achi, idx) => {
        // 拼接每个成就有效字段
        const achiFields = {
            "成就ID": achi.id,
            // "所属组ID": achi.groupId,
            "等级": achi.achiLevel,
            "名称": achi.achiName,
            "描述": achi.achiDesc,
            "完成条件": achi.finishCondi,
            "参数": achi.param,
            "下一成就": achi.nextAchi,
            "首个成就ID": achi.firstAchi,
            "奖励": achi.reward
        };

        const achiTexts = [];
        for (const [key, value] of Object.entries(achiFields)) {
            if (value === null || value === undefined) continue;
            if (typeof value === "string" && value.trim() === "") continue;
            if (Array.isArray(value) && value.length === 0) continue;
            achiTexts.push(`${key}: ${value}`);
        }


        if (achiTexts.length > 0) {
            chunks.push({
                id: `achievement_${achiGroup.id}-${idx + 1}`,
                parentId: achiGroup.id,
                text: achiTexts.join('\n').trim()
            });
        }
    });

    return chunks;
}




/**
 * 将建筑数据拆分
 * @param {Object} buildingGroup - 一条清理过空字段的建筑对象
 * @param {number} maxLen - 每个 chunk 最大长度
 * @returns {Array<{id: string, text: string}>}
 */
function splitBuildingToChunks(buildingGroup, maxLen = 500) {
    const chunks = [];

    // 建筑组有效字段
    const groupFields = {
        "建筑组ID": buildingGroup.groupId,
        "建筑组名": buildingGroup.name,
        "类型": buildingGroup.type,
        "解锁条件": buildingGroup.unlockCondi,
        "是否可升级": buildingGroup.isUpgradable,
        "是否可存放": buildingGroup.isStorable,
        "交互优先级": buildingGroup.interactPriority,
        "操作按钮": buildingGroup.startButtonWord,
        "生产类型标题": buildingGroup.produceTypeTitle
    };

    const groupTexts = [];
    for (const [key, value] of Object.entries(groupFields)) {
        if (value === null || value === undefined) continue;
        if (typeof value === "string" && value.trim() === "") continue;
        if (Array.isArray(value) && value.length === 0) continue;
        groupTexts.push(`${key}: ${value}`);
    }

    if (groupTexts.length > 0) {
        chunks.push({
            id: `build_${buildingGroup.groupId}`,
            parentId: buildingGroup.groupId,
            text: groupTexts.join('\n').trim()
        });
    }


    buildingGroup.building?.forEach((level, lvlIdx) => {
        // 单个等级的有效字段
        const levelFields = {
            "建筑ID": level.id,
            "等级": level.level,
            "名称": level.name,
            "描述": level.desc,
            "附加描述": level.desc_2,
            "升级描述": level.upgradeDesc,
            "升级条件": level.upgradeCondition,
            "消耗材料": Array.isArray(level.material) ? level.material.map(m => `${m.name}x${m.num}`).join("、") : "",
            "时间": level.time,
            "科技经验": level.technologyExp,
            "下一级": level.nextLevel,
            "仓库容量": level.stackNum,
            "槽位数": level.slotNumber,
            "槽位大小": level.trough,
            "是否显示名称": level.isShowName,
            "经验": level.exp,
            "繁荣度": level.prosperity,
            "路径": level.path,
            "参数": level.param,
            "产出": level.ouput
        };

        const levelTexts = [];
        for (const [key, value] of Object.entries(levelFields)) {
            if (value === null || value === undefined) continue;
            if (typeof value === "string" && value.trim() === "") continue;
            if (Array.isArray(value) && value.length === 0) continue;
            levelTexts.push(`${key}: ${value}`);
        }


        if (levelTexts.length > 0) {
            chunks.push({
                id: `build_${buildingGroup.groupId}-${lvlIdx + 1}`,
                parentId: buildingGroup.groupId,
                text: levelTexts.join('\n').trim()
            });
        }
    });

    return chunks;
}


/**
 * 食物数据拆分
 * @param {Object} food - 一条清理过空字段的食物对象
 * @param {number} maxLen - 每个 chunk 最大长度
 * @returns {Array<{id: string, text: string}>}
 */
function splitFoodToChunks(food, maxLen = 500) {
    const chunks = [];

    const GroupFields = {
        "食物ID": food.id,
        "食物名": food.name,
        "食物类型ID": food.foodType?.id,
        "食物类型名称": food.foodType?.name,
        "是否需要宠物": food.isNeedPet,
        "食物解锁等级": food.unlockLevel
    };

    const groupTexts = [];
    for (const [key, value] of Object.entries(GroupFields)) {
        if (value === null || value === undefined) continue;
        if (typeof value === "string" && value.trim() === "") continue;
        if (Array.isArray(value) && value.length === 0) continue;
        groupTexts.push(`${key}: ${value}`);
    }


    if (groupTexts.length > 0) {
        chunks.push({
            id: `food_${food.id}`,
            parentId: food.id,
            text: groupTexts.join('\n').trim()
        });
    }


    // 先把每个材料都拆成文本
    food.material?.forEach((mat, matIdx) => {
        // 单个材料有效字段
        const materialFields = {
            "材料ID": mat.id,
            "材料名": mat.name,
            "材料描述": mat.desc,
            "材料附加描述": mat.specialDesc,
            "材料星级": mat.rarity,
            "材料类型": mat.type,
            "材料类型名称": mat.typeName,
            "在背包中": mat.inBag,
            "材料标签": mat.tag,
            "最大数量": mat.maxNum,
            "堆叠数量": mat.stackNum,
            "存在类型": mat.existType,
            "存在数量": mat.existNum,
            "使用类型": mat.useType,
            "背包类型": mat.bagType,
            "子类型": mat.subType,
            "子ID": mat.subId,
            "礼包奖励": mat.giftBagReward,
            "使用功能": mat.useFunction,
            "获取方式1": mat.way1desc,
            "获取方式2": mat.way2desc,
            "获取方式3": mat.way3desc
        };

        const materialTexts = [];
        for (const [key, value] of Object.entries(materialFields)) {
            if (value === null || value === undefined) continue;
            if (typeof value === "string" && value.trim() === "") continue;
            if (Array.isArray(value) && value.length === 0) continue;
            materialTexts.push(`${key}: ${value}`);
        }



        if (materialTexts.length > 0) {
            chunks.push({
                id: `food_${food.id}-${matIdx + 1}`,
                parentId: food.id,
                text: materialTexts.join('\n').trim()
            });
        }

    });

    return chunks;
}


// ======================================
// 向量化操作
// ======================================
async function embedText(text) {
    try {
        const res = await client.embeddings.create({
            model: model,
            input: text,
        });

        if (!res?.data?.[0]?.embedding) throw new Error("Embedding response malformed");

        const embedding = res.data[0].embedding;

        return embedding instanceof Float32Array ? embedding : new Float32Array(embedding);
    } catch (err) {
        logger.error("[yoyo-plugin]生成向量出错:", err);
        return new Float32Array(1536).fill(0);
    }
}


//=====================================
// 向量数据库操作
//=====================================


/**
 * 加载数据到向量数据库
 * @param {*} e 传入的事件对象
 */
export async function loadData(e) {
    try {
        const trunks = await splitAllDataIntoTrunks();
        const { connect } = await import('@lancedb/lancedb');
        const db = await connect(DB_DIR);

        // 成就
        logger.info(`[yoyo-plugin]开始写入向量数据库...`);
        e.reply(`[yoyo-plugin]开始写入向量数据库...目前为全量更新，数据量${trunks.len}条,耗时约10分15秒`);
        await loadCategoryData(db, 'achievement', trunks.achievementTrunk);
        logger.info("[yoyo-plugin]成就数据写入完成");
        e.reply("[yoyo-plugin]成就数据写入完成");

        // 食物
        await loadCategoryData(db, 'food', trunks.foodTrunk);
        logger.info("[yoyo-plugin]食物数据写入完成");
        e.reply("[yoyo-plugin]食物数据写入完成");




        // 装备
        await loadCategoryData(db, 'accessory', trunks.accessoryTrunk);
        logger.info("[yoyo-plugin]装备数据写入完成");
        e.reply("[yoyo-plugin]装备数据写入完成");



        // 建筑
        await loadCategoryData(db, 'building', trunks.buildingTrunk);
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
    const { connect } = await import('@lancedb/lancedb');
    const queryVector = Array.from(await embedText(query));
    const db = await connect(DB_DIR);
    const categories = ['accessory', 'achievement', 'building', 'food'];

    const tables = {};
    await Promise.all(categories.map(async category => {
        try {
            tables[category] = await db.openTable(`wiki_${category}`);
        } catch (err) {
            logger.warn(`[searchWiki] 打开表失败: wiki_${category}`, err);
        }
    }));

    // 搜索所有 chunk
    const resultsArr = await Promise.all(categories.map(async category => {
        const table = tables[category];
        if (!table) return [];
        try {
            const aa = await table.search(queryVector).limit(30); // 临时拉取更多 chunk 用于聚合
            const results = await aa.toArray();

            return results.map(x => ({
                score: x._distance,
                metadata: x.metadata,
                category
            }));
        } catch (err) {
            logger.warn(`[searchWiki] 搜索表 wiki_${category} 出错:`, err);
            return [];
        }
    }));

    const flatResults = resultsArr.flat();

    // 按 parentId 聚合
    const parentMap = {};
    flatResults.forEach(item => {
        const pid = item.metadata.parentId || 'unknown';
        if (!parentMap[pid]) parentMap[pid] = { scoreList: [], chunks: [], category: item.category };
        parentMap[pid].scoreList.push(item.score);
        parentMap[pid].chunks.push(item.metadata);
    });

    const aggregated = Object.entries(parentMap).map(([parentId, data]) => {
        return {
            parentId,
            category: data.category,
            score: Math.min(...data.scoreList), // 聚合策略：取最小距离
            chunks: data.chunks
        };
    });

    // 返回 topK parent
    let results = aggregated.sort((a, b) => a.score - b.score).slice(0, topK);
    return results.map(r => {
        const text = r.chunks.map(c => c.text).join("\n");
        return `[${r.category}][parentId=${r.parentId}]\n${text}`;
    }).join("\n\n");
}





async function loadCategoryData(db, category, data) {
    const tableName = `wiki_${category}`;
    const rows = [];
    let num = 0;
    let totalChunks = data.length;

    for (const item of data) {
        let text;

        text = item.text || '';
        const metadata = {
            text: text,
            type: category || '',
            parentId: item.parentId || 'unknown',  // 父级ID，方便后续聚合
            chunkIndex: item.id || 'unknown' // 当前块ID
        };

        const float32Vector = await embedText(text);

        logger.info(`[yoyo-plugin]生成${category}向量 ${++num}/${totalChunks}`);

        // const id = `${category}-${item.id || 'unknown'}-chunk${i}`;

        rows.push({
            id: item.id,
            vector: Array.from(float32Vector),
            metadata
        });

    }

    try {

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
