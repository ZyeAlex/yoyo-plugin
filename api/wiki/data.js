import wikiAPI from 'nodemw'
import luaparse from 'luaparse'

// wiki 链接
const client = new wikiAPI({
    protocol: "https",
    server: "wiki.biligame.com",
    path: "/ap",
    debug: false,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
});

/**
 * 将Lua解析为Lua AST
 * 并从抽象语法树中提取数据
 * 
 * @param {*} lua Lua String
 * @param {*} key 要提取的属性
 * @returns 
 */
const parseLua = async (lua, key) => {
    function convertExpressionToJS(expr) {
        switch (expr.type) {
            case 'NumericLiteral':
                return expr.value;
            case 'StringLiteral':
                return JSON.parse(expr.raw) || expr.value;
            case 'BooleanLiteral':
                return expr.value;
            case 'NilLiteral':
                return null;
            case 'TableConstructorExpression':
                return convertTableToJS(expr);
            default:
                throw new Error(`Unsupported expression type: ${expr.type}`);
        }
    }
    // 将Table转换为Object
    function convertTableToJS(tableExpr) {
        // 处理数组
        if (tableExpr.fields[0]?.type === 'TableValue') {
            let arr = []
            tableExpr.fields.forEach(field => {
                const value = convertExpressionToJS(field.value);
                arr.push(value);
            })
            return arr
        }
        // 处理object
        let obj = {};
        tableExpr.fields.forEach(field => {
            if (field.type === 'TableKeyString') {
                //  key = value
                const key = field.key.name;
                const value = convertExpressionToJS(field.value);
                obj[key] = value;
            } else if (field.type === 'TableKey') {
                //key: [expr] = value
                const key = convertExpressionToJS(field.key);
                const value = convertExpressionToJS(field.value);
                obj[key] = value;
            } else {
                throw new Error(`Unsupported field type: ${field.type}`);
            }
        });
        return obj;
    }

    return new Promise((res, rej) => {
        // 解析配置选项
        const options = {
            comments: false,    // 不保留注释
            locations: true,    // 记录节点位置
            ranges: true,       // 记录字符范围
            luaVersion: '5.3'   // 指定Lua版本
        };
        // 解析为AST
        const ast = luaparse.parse(lua, options);
        ast.body.filter(
            node => node.type === 'AssignmentStatement' //找出Table节点
        ).forEach(assign => {
            assign.variables.forEach((varNode, i) => {
                if (varNode.identifier.name == key) {
                    return res(convertTableToJS(assign.init[i]))
                }
            });
        });
        rej()
    })


}

/**
 * 从Wiki中拿数据
 * 
 * @param {*} module 要提取的模块名称 https://wiki.biligame.com/ap/模块:【模块名称】/
 * @returns 
 */
const getWikiData = async (path) => {
    const data = await new Promise((res, rej) => {
        client.getArticle(path, async function (error, data) {
            // error handling
            if (error) return rej(error)
            try {
                res(await parseLua(data, 'data'))
            } catch (error) {
                rej(error)
            }
        });
    })
    return data
}
const getWikiModuleData = async (module) => {
    let ids = [], arr = []
    try {
        ids = await getWikiData(`模块:${module}/id`)
    } catch (error) {
        logger.error('[yoyo-plugin][getWikiModuleData] ', error)
        ids = []
    }
    for (let id in ids) {
        let data
        try {
            data = await getWikiData(`模块:${module}/` + id)
        } catch (error) {
            logger.error('[yoyo-plugin][getWikiModuleData]', error)
        }
        if (data) {
            arr.push(data)
        } else {
            arr.push({ id, name: ids[id] })
        }
    }
    return arr
}








export {
    getWikiData,
    getWikiModuleData
}


