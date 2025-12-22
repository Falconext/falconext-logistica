
import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = path.join(__dirname, '../data.xlsx');
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets['Hoja 1'];
const r1 = XLSX.utils.sheet_to_json(sheet, { header: 1 })[1];
console.log('HEADERS (Row 1):', JSON.stringify(r1, null, 2));
