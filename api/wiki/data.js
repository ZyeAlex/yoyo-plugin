import bot from 'nodemw'
import luaparse from 'luaparse'

// wiki 链接
const client = new bot({
    protocol: "https",
    server: "wiki.biligame.com",
    path: "/ap",
    debug: false,
});



// 从wiki拿到角色数据
const getHeroData = async () => {
    const heroIds = await new Promise(res => {
        client.getArticle("模块:Hero/id", async function (err, data) {
            // error handling
            try {
                if (err) throw new Error(err)
                res(await parseLua(data, 'data'))
            } catch (error) {
                logger.error('[yoyo-plugin][getHeroData] ', error)
                return res({});
            }
        });
    })
    let heros = {}
    for (let heroId in heroIds) {
        const data = await new Promise((res, rej) => {
            client.getArticle("模块:Hero/" + heroId, async function (err, data) {
                // error handling
                if (err) return rej()
                try {
                    res(await parseLua(data, 'data'))
                } catch (error) {
                    // rej(`未查询到角色【${heroIds[heroId]}】[${heroId}] 的数据`)
                    rej()
                }
            });
        }).catch((err) => err && logger.error('[yoyo-plugin][getHeroData]', err))
        if (data) {
            heros[heroId] = data
        } else {
            heros[heroId] = {
                id: heroId,
                name: heroIds[heroId]
            }
        }
    }
    return heros
}

// 从 wiki拿到奇波数据
const getPetData = async () => {
    const petIds = await new Promise(res => {
        client.getArticle("模块:Kibo/id", async function (err, data) {
            try {
                if (err) throw new Error(err)
                return res(await parseLua(data, 'data'))
            } catch (error) {
                logger.error('[yoyo-plugin][getPetData] ', error)
                return res({});
            }
        });
    })
    let pets = {}
    for (let petId in petIds) {
        const data = await new Promise((res, rej) => {
            client.getArticle("模块:Kibo/" + petId, async function (err, data) {
                try {
                    if (err) return rej()
                    res(await parseLua(data, 'data'))
                } catch (error) {
                    rej(error)
                }
            });
        }).catch((err) => logger.error('[yoyo-plugin][getPetData]', err))
        if (data) {
            pets[petId] = data
        } else {
            pets[petId] = {
                id: petId,
                name: petIds[petId]
            }
        }
    }
    return pets
}

// 解析Lua  key为属性
async function parseLua(lua, key) {
    function convertExpressionToJS(expr) {
        switch (expr.type) {
            case 'NumericLiteral':
                return expr.value;
            case 'StringLiteral':
                return JSON.parse(expr.raw) || expr.value;  // Note: expr.raw includes quotes, but value is the raw string content
            case 'BooleanLiteral':
                return expr.value;
            case 'NilLiteral':
                return null;
            case 'TableConstructorExpression':
                return convertTableToJS(expr);
            // Add more cases as needed, e.g., for VarargLiteral, Identifier (would require scope resolution), etc.
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
                // String key: key = value
                const key = field.key.name;
                const value = convertExpressionToJS(field.value);
                obj[key] = value;
            } else if (field.type === 'TableKey') {
                // Expression key: [expr] = value
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




export {
    getHeroData,
    getPetData
}


