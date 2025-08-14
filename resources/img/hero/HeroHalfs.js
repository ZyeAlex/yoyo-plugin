const matrix = [
    ['星临者','珐兰塔','寒悠悠','诺诺','夏儿'],
    ['西芙莉雅','末音','米蒂','阿比','源千代'],
    ['璐璐卡','诺诺','芃芃','未知'],
    ['洛卿'],
]

const avatar = {};
matrix.forEach((subArray, rowIndex) => {
    subArray.forEach((item, colIndex) => {
        if (!avatar[item]) {
            avatar[item] = [colIndex,rowIndex ];
        }
    });
});

export default avatar