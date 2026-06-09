import luaparse from 'luaparse'
import { getWikitextBatch } from './client.js'

function convertExpressionToJS(expr) {
  switch (expr.type) {
    case 'NumericLiteral':
      return expr.value
    case 'StringLiteral':
      return JSON.parse(expr.raw) ?? expr.value
    case 'BooleanLiteral':
      return expr.value
    case 'NilLiteral':
      return null
    case 'TableConstructorExpression':
      return convertTableToJS(expr)
    default:
      throw new Error(`Unsupported expression type: ${expr.type}`)
  }
}

function convertTableToJS(tableExpr) {
  if (tableExpr.fields[0]?.type === 'TableValue') {
    return tableExpr.fields.map(field => convertExpressionToJS(field.value))
  }
  const obj = {}
  tableExpr.fields.forEach(field => {
    if (field.type === 'TableKeyString') {
      obj[field.key.name] = convertExpressionToJS(field.value)
    } else if (field.type === 'TableKey') {
      obj[convertExpressionToJS(field.key)] = convertExpressionToJS(field.value)
    } else {
      throw new Error(`Unsupported field type: ${field.type}`)
    }
  })
  return obj
}

export function parseLuaModuleData(lua, key = 'data') {
  const ast = luaparse.parse(lua, {
    comments: false,
    locations: false,
    ranges: false,
    luaVersion: '5.3',
  })
  for (const node of ast.body) {
    if (node.type !== 'AssignmentStatement') continue
    for (let i = 0; i < node.variables.length; i++) {
      const varNode = node.variables[i]
      let matched = false
      if (varNode.type === 'MemberExpression' && varNode.indexer === '.' && varNode.identifier?.name === key) {
        matched = true
      }
      if (varNode.type === 'Identifier' && varNode.name === key) {
        matched = true
      }
      if (matched) return convertTableToJS(node.init[i])
    }
  }
  return null
}

const ICON_MODULES = {
  element: '模块:Icon/element',
  groups: '模块:Icon/groups',
  profession: '模块:Icon/profession',
}

/**
 * 从 Wiki Lua 模块页拉取 Icon 基础数据（元素/阵营/职业）
 * @param {'element'|'groups'|'profession'} name
 */
export async function fetchIconModule(name) {
  const title = ICON_MODULES[name]
  if (!title) throw new Error(`Unknown icon module: ${name}`)
  const map = await getWikitextBatch([title])
  const lua = map[title]
  if (!lua) throw new Error(`Empty wikitext for ${title}`)
  const data = parseLuaModuleData(lua, 'data')
  if (!Array.isArray(data)) throw new Error(`Invalid module data for ${title}`)
  return data.filter(item => item?.name)
}

export async function fetchAllIconModules() {
  const entries = await Promise.all(
    Object.keys(ICON_MODULES).map(async (name) => [name, await fetchIconModule(name)])
  )
  return Object.fromEntries(entries)
}
