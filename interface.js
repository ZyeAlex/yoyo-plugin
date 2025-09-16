// 用于第三方仓库图片加载
import setting from './utils/setting.js'
import utils from './utils/index.js'


const setConfig = utils.throttle((...fns) => {
    fns.forEach(fn => fn())
    setting.setConfig('config', setting.config);
}, 1000)


export const img = (path) => {
    if (!setting.config.imgPath.includes(path)) {
        setting.config.imgPath.push(path);
        setConfig(setting.getHeroImgs())
    }
};
export const characterImg = (path) => {
    if (!setting.config.characterImgPath.includes(path)) {
        setting.config.characterImgPath.push(path);
        setConfig()
    }
};

export const guide = (path, type) => {
    switch (type) {
        case 'hero':
            setting.config.heroGuidePath.push(path);
            break;
    }
    setConfig()
};