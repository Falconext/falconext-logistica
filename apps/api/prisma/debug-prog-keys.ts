
import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = path.join(__dirname, '../data.xlsx');
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets['PROGRAMA DIARIO DHL'];
const r1 = XLSX.utils.sheet_to_json(sheet, { header: 1 })[1];
console.log('PROGRAMA KEYS:', JSON.stringify(r1));
