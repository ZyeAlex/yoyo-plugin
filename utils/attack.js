/**
 * 配置文件 ———— 战斗相关
 * 
 */
import setting from './setting.js'

class Attack {
    constructor(hero, monster) {


        // 常规伤害（非持续伤害部分） = 
        // 基础伤害 
        // 技能伤害增幅区 
        // 防御减伤区 
        // 通用增减伤区 
        // 暴击伤害 
        // 物魔伤害区 
        // 属性伤害区 
        // 克制伤害效果 
        // 部位伤害区 
        // BREAK阶段状态增伤
        this.hero = hero
        this.monster = monster


    }

    /**
     * 伤害计算
     * 
     */

    // 基础伤害计算
    baseDamage() {
        let product = [
            this.defense,
            this.damageReduction,
            this.demonDamage,
            this.propertyDamage,
            this.restrainDamage,
            this.partDamage,
            this.breakDamage
        ].reduce((p, fn) => p * fn.call(this), 1)

        return [
            this.criticalDamage() * product,
            this.criticalDamage(false) * product,
        ]

    }
    // dot 伤害计算
    dotDamage() {

    }


    /**
     * 乘区伤害
     * 
     */

    // 暴击伤害 是否期望伤害
    criticalDamage(expectation = true) {
        let { criticalRate, criticalDamage } = this.hero

        if (expectation) {
            return 1 + criticalRate * (criticalDamage - 1)
        } else {
            return criticalDamage
        }
    }
    // 防御区 
    defense() {
        let { level: heroLevel, fixedPenetration, percentPenetration } = this.hero
        let { level: monsterLevel, baseDefense } = this.monster

        // 进攻方等级系数 = 5 * (进攻方等级 + 100) 
        let attackLevelCoefficient = 5 * (heroLevel + 100)

        // 怪物方总防御 = 基础防御 * (0.05+0.0005*怪物方等级)
        let monsterDefense = baseDefense * (0.05 + 0.0005 * monsterLevel)

        // 防守方总有效防御 = (防守方总防御 - 进攻方固定值防御穿透) * (1 - 进攻方百分比防御穿透)
        let monsterEffectiveDefense = (monsterDefense - fixedPenetration) * (1 - percentPenetration)

        // 防御减伤区 = (进攻方等级系数) / (进攻方等级系数 + 防守方总有效防御)
        return attackLevelCoefficient / (attackLevelCoefficient + monsterEffectiveDefense)
    }
    // 减伤区
    damageReduction() {
        let { damageIncrease } = this.hero
        let { damageReduction, vulnerable } = this.monster

        // 通用增减伤区 = 进攻方通用伤害增幅 - 防守方通用受伤减免
        // 若存在易伤特性，易伤等效于通用增减伤，会和不特定属性的全增伤加算
        // 所以实际上易伤等于负的减伤

        return 1 + damageIncrease + vulnerable - damageReduction
    }
    // 物魔伤害区
    demonDamage() {

        let { 物理or魔法, physicalIncrease, magicIncrease } = this.hero

        let { physicalReduction, magicReduction } = this.monster
        // 物理伤害对应物理伤害增幅和物理受伤减免，魔法伤害对应魔法伤害增幅和魔法受伤减免
        // 物魔伤害区 = 进攻方对应伤害增幅 - 防守方对应受伤减免

        if (物理or魔法 == '物理') {
            return 1 + physicalIncrease - physicalReduction
        } else {
            return 1 + magicIncrease - magicReduction
        }
    }
    // 属性伤害区
    propertyDamage() {
        // 对应属性伤害适用于对应属性的伤害增幅和受伤减免
        // 星至测试中，文案中的属性受伤减免和属性抗性不统一，实际都是属性受伤减免。
        // 减少防守方的属性受伤减免，可以增加防守方受到的伤害，从而提升进攻方输出的伤害。
        // 攻击伤害为单元素的情况如下：
        // 属性伤害区 = 进攻方对应属性伤害增幅 - 防守方对应属性受伤减免
        // 星至测试中，怪物方(比如敌方奇波或凶兽)的属性受伤减免目前均为0。
        // 对应属性的奇波或敌人没有对应属性抗性，在使用火属性角色攻击火属性奇波时并不会降低伤害
        return 1
    }
    // 克制伤害区
    restrainDamage() {
        // 克制效果与被克制效果互相加算。
        // 比如 己方某一攻击属性为风，敌方本身属性为雷、地
        // 则最终效果为 克制伤害效果 = 1 - 0.25 + 0.25 = 1
        // 目前，无属性与其他九种元素属性，均无克制或被克制关系
        // 光属性和暗属性之间只有克制关系，没有被克制关系。即光打暗，暗打光的系数都是1.25
        // 剩余七个属性参照官方克制表，克制都是+0.25(+25%)，被克制都是-0.25(-25%)。不存在强弱克制的系数分层情况。
        return 1
    }
    // 部位伤害效果
    partDamage() {
        // 目前星至测试中的BOSS有两位，分别是巨刺凶鸟以及暗焰兽是存在部位伤害差的，在攻击头部时会获得伤害增幅，在攻击到尾部的时候会伤害减少，在攻击其他的部位时为正常伤害不会增减
        // 目前攻击头部时伤害会有10%的增幅
        // 在攻击尾部时会减少10%的伤害
        return 1
    }
    // BREAK阶段状态增伤
    breakDamage() {
        // 当敌方韧性条归零进入虚弱状态后会受到200%的伤害，此部分为单独区，会影响所有伤害来源，属于简单粗暴的最终结算。
        return 1
    }

}
