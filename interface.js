// 用于第三方仓库图片加载
import setting from './utils/setting.js'
import utils from './utils/index.js'


const setConfig = utils.throttle(() => {
    setting.getHeroImgs();
    setting.setConfig('config', setting.config);
}, 1000)


export const img = (path) => {
    if (!setting.config.imgPath.includes(path)) {
        setting.config.imgPath.push(path);
        setConfig()
    }
};