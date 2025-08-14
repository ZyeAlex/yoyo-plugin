
import ExcelJS from 'exceljs'
import YAML from 'yaml'
import fs from 'fs'
export const getExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const heros = {}
    try {
        // 从URL加载Excel文件
        await workbook.xlsx.readFile('角色.xlsx');

        // 获取第一个工作表
        const worksheet = workbook.getWorksheet(1);

        // 遍历每一行
        worksheet.eachRow((row, rowNumber) => {
            // 跳过第一行
            if (rowNumber === 1) return;
            // 遍历每一列
            const c = []
            row.eachCell((cell, colNumber) => {
                c.push(cell.value)
            });
            console.log(c);
            heros[c[0]] = {
                名称: c[0],
                稀有度: c[1],
                元素: c[2],
                武器类型: c[3],
                普攻: c[4],
                重击: c[5],
                闪击: c[6],
                跃击: c[7],
                星携技: c[8],
                极限反击: c[9],
                精准防御: c[10],
                完美招架: c[11],
                集中闪避: c[12],
                星鸣技: c[13],
                星结合击: c[14],
                必杀技: c[15],
                台词: c[16],
                自我介绍: c[17],
                详情1: c[18],
                详情2: c[19],
                详情3: c[20],
                关于自己1: c[21],
                关于自己2: c[22],
                关于星临者: c[23],
                世界见闻1: c[24],
                世界见闻2: c[25],
                趣闻: c[26],
                必杀技: c[27]
            }
        });
        console.log(heros);
        // 输出yaml 不用setting
        fs.writeFileSync( process.cwd().replace(/\\/g, '/') + `/角色.yaml`, YAML.stringify(heros));
    } catch (error) {
        console.error('Error reading online Excel file:', error);
    }
}


getExcel()