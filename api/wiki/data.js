import bot from 'nodemw'
import luaparse from 'luaparse'

// wiki 链接
const client = new bot({
    protocol: "https",
    server: "wiki.biligame.com",
    path: "/ap",
    debug: false,
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
const getWikiData = async (module) => {
    const ids = await new Promise(res => {
        client.getArticle(`模块:${module}/id`, async function (err, data) {
            // error handling
            try {
                if (err) throw new Error(err)
                res(await parseLua(data, 'data'))
            } catch (error) {
                logger.error('[yoyo-plugin][getWikiData] ', error)
                return res({});
            }
        });
    })
    let objs = {}
    for (let id in ids) {
        const data = await new Promise((res, rej) => {
            client.getArticle(`模块:${module}/` + id, async function (err, data) {
                // error handling
                if (err) return rej()
                try {
                    res(await parseLua(data, 'data'))
                } catch (error) {
                    rej()
                }
            });
        }).catch((err) => err && logger.error('[yoyo-plugin][getWikiData]', err))
        if (data) {
            objs[id] = data
        } else {
            objs[id] = {
                id,
                name: ids[id]
            }
        }
    }
    return objs
}






export {
    getWikiData
}


