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

    // Read Hoja 2 for Vehicle info
    console.log('\n=== Reading Hoja 2 (First 10 rows) ===');
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Hoja 2!A1:Z10'
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
        console.log('No data found in Hoja 2');
        return;
    }

    console.log(`Total rows returned: ${rows.length}`);

    for (let i = 0; i < Math.min(5, rows.length); i++) {
        console.log(`\nRow ${i}:`);
        console.log(`  Full row: ${JSON.stringify(rows[i])}`);
    }

    // Check if row 1 has headers (like Hoja 1)
    if (rows.length > 1 && rows[1] && rows[1].length > 0) {
        console.log('\n=== Checking Row 1 as Headers ===');
        const headers = rows[1]?.map((h: string) => h?.toString().toUpperCase().trim()) || [];
        console.log(`Row 1 headers: ${JSON.stringify(headers)}`);

        const idxTarga = headers.findIndex((h: string) => h === 'TARGA' || h.includes('TARGA'));
        const idxModelo = headers.findIndex((h: string) => h === 'MODELO' || h.includes('MODEL'));
        console.log(`TARGA at index: ${idxTarga}, MODELO at index: ${idxModelo}`);

        if (idxTarga !== -1 && idxModelo !== -1 && rows.length > 2) {
            console.log('\n=== Vehicle Mappings (starting row 2) ===');
            for (let i = 2; i < Math.min(10, rows.length); i++) {
                const targa = rows[i][idxTarga];
                const modelo = rows[i][idxModelo];
                console.log(`${targa} => ${modelo}`);
            }
        }
    }
}

main().catch(console.error);
