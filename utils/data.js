/**
 * data文件夹下处理工具
 */
import setting from "./setting.js"

class Data {
    // 获取所有角色
    getAllRole() {
        const role = setting.getData('role')
        return role.keys()
    }
    // 查询是否有此角色，有则返回角色原本名称
    getRoleName(name) {
        const roleObj = setting.getData('role')
        // 直接返回角色名
        if (name in roleObj) {
            return name
        }
        // 遍历
        for (let roleName in roleObj) {
            if (roleObj[roleName]?.includes?.(name)) {
                return roleName
            }
        }
    }
}

export default new Data()