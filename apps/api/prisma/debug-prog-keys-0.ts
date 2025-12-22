
import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = path.join(__dirname, '../data.xlsx');
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets['PROGRAMA DIARIO DHL'];
const r0 = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];
console.log('PROGRAMA KEYS (Row 0):', JSON.stringify(r0));
