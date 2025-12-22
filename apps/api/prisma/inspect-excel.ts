
import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = path.join(__dirname, '../data.xlsx');
const workbook = XLSX.readFile(filePath);

const sheetNames = workbook.SheetNames;
console.log('Sheets found:', sheetNames);

sheetNames.forEach(name => {
    const sheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    const headers = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = sheet[XLSX.utils.encode_cell({ c: C, r: range.s.r })];
        if (cell && cell.v) headers.push(cell.v);
    }
    console.log(`\nHeaders for ${name}:`);
    console.log(JSON.stringify(headers, null, 2));
});
