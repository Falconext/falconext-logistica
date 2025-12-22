
import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = path.join(__dirname, '../data.xlsx');
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets['Hoja 1'];

console.log('--- Range 0 (Default) ---');
const r0 = XLSX.utils.sheet_to_json(sheet, { header: 1 });
console.log('Row 0:', r0[0]);
console.log('Row 1:', r0[1]);
console.log('Row 2:', r0[2]);
console.log('Row 3:', r0[3]);
