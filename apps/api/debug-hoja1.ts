import { google } from 'googleapis';
import * as fs from 'fs';

async function main() {
    const credentials = JSON.parse(fs.readFileSync('./google-credentials.json', 'utf-8'));

    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const spreadsheetId = '1ZSNMIT69FJbkV9rsMjFJte8nddqDpSzPS0WG1FXG3hQ';

    // Read Hoja 1 - start from row 1 to see what's there
    console.log('\n=== Reading Hoja 1 (First 5 rows raw) ===');
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Hoja 1!A1:Z10'
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
        console.log('No data found in Hoja 1');
        return;
    }

    console.log(`Total rows returned: ${rows.length}`);

    for (let i = 0; i < Math.min(5, rows.length); i++) {
        console.log(`\nRow ${i}: Columns A and Z`);
        console.log(`  A (index 0): "${rows[i][0]}"`);
        console.log(`  Z (index 25): "${rows[i][25]}"`);
        console.log(`  Full row length: ${rows[i].length}`);
    }

    // Check if row 1 has headers
    if (rows.length > 1) {
        console.log('\n=== Checking Row 1 as Headers ===');
        const headers = rows[1]?.map((h: string) => h?.toString().toUpperCase().trim()) || [];
        console.log(`Row 1 headers: ${JSON.stringify(headers.slice(0, 5))}... [${headers.length} columns]`);

        const idxName = headers.findIndex((h: string) => h === 'NOMBRE');
        const idxCode = headers.findIndex((h: string) => h === 'ID_TRABAJADOR');
        console.log(`NOMBRE at index: ${idxName}, ID_TRABAJADOR at index: ${idxCode}`);

        if (idxName !== -1 && idxCode !== -1 && rows.length > 2) {
            console.log('\n=== Driver Mappings (starting row 2) ===');
            for (let i = 2; i < Math.min(7, rows.length); i++) {
                console.log(`${rows[i][idxCode]} => ${rows[i][idxName]}`);
            }
        }
    }
}

main().catch(console.error);
