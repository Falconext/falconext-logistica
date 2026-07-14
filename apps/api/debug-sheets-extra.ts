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

    // Read MANCATO P. sheet
    console.log('\n=== Reading MANCATO P. ===');
    try {
        const res1 = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'MANCATO P.!A1:Z10'
        });

        const rows1 = res1.data.values;
        if (rows1 && rows1.length > 0) {
            console.log(`Total rows: ${rows1.length}`);
            for (let i = 0; i < Math.min(5, rows1.length); i++) {
                console.log(`Row ${i}: ${JSON.stringify(rows1[i])}`);
            }
        }
    } catch (e) {
        console.log(`Error reading MANCATO P.: ${e.message}`);
    }

    // Read COMBUSTIBLE sheet
    console.log('\n=== Reading COMBUSTIBLE ===');
    try {
        const res2 = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'COMBUSTIBLE!A1:Z10'
        });

        const rows2 = res2.data.values;
        if (rows2 && rows2.length > 0) {
            console.log(`Total rows: ${rows2.length}`);
            for (let i = 0; i < Math.min(5, rows2.length); i++) {
                console.log(`Row ${i}: ${JSON.stringify(rows2[i])}`);
            }
        }
    } catch (e) {
        console.log(`Error reading COMBUSTIBLE: ${e.message}`);
    }
}

main().catch(console.error);
