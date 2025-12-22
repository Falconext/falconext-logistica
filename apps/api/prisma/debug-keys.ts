
import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = path.join(__dirname, '../data.xlsx');
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets['Hoja 1'];
const json = XLSX.utils.sheet_to_json(sheet);
console.log('KEYS:', Object.keys(json[0] as object));
