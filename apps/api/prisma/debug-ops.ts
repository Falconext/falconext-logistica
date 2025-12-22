
import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = path.join(__dirname, '../data.xlsx');
const workbook = XLSX.readFile(filePath);

const opsSheets = ['PROGRAMA DIARIO DHL', 'GIROS FARMACIA', 'CALENDARIO DHL'];

console.log('--- OPERATIONS SHEETS HEADERS ---');
opsSheets.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    if (sheet) {
        // Try range 0 and range 1 to guess headers
        const r0 = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];
        const r1 = XLSX.utils.sheet_to_json(sheet, { header: 1 })[1]; // Row 2 (Index 1)

        console.log(`\n=== ${sheetName} ===`);
        console.log('Row 0:', JSON.stringify(r0));
        console.log('Row 1:', JSON.stringify(r1));

        // Also preview a data row
        const data = XLSX.utils.sheet_to_json(sheet, { range: 1 }); // Assuming Row 1 headers
        if (data.length > 0) {
            console.log('Sample Data (Row 2/3):', JSON.stringify(data[0], null, 2));
        }
    } else {
        console.log(`\n[MISSING] Sheet '${sheetName}' not found.`);
    }
});
