
import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = path.join(__dirname, '../data.xlsx');
const workbook = XLSX.readFile(filePath);

console.log('--- ALL SHEETS ---');
console.log(workbook.SheetNames);
