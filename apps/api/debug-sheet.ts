
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
    // 1. Get Tenant Config
    const tenant = await prisma.tenant.findFirst();
    if (!tenant?.google_sheet_id) {
        console.error('No Tenant or Sheet ID found in DB');
        return;
    }
    console.log(`Using Sheet ID: ${tenant.google_sheet_id}`);

    // 2. Auth
    const keyFilePath = path.join(process.cwd(), 'google-credentials.json');
    const auth = new google.auth.GoogleAuth({
        keyFile: keyFilePath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const client = await auth.getClient();

    // 3. Get Data
    const sheets = google.sheets({ version: 'v4', auth: client as any });

    try {
        console.log('Fetching range DHL CONSEGNAS!A:Z ...');
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: tenant.google_sheet_id,
            range: 'DHL CONSEGNAS!A:Z',
        });

        const rows = response.data.values;
        if (!rows) {
            console.log('No rows returned.');
        } else {
            console.log(`TOTAL ROWS RETURNED BY API: ${rows.length}`);
            console.log('--- HEADERS (Row 0) ---');
            console.log(rows[0]);
            console.log('--- SAMPLE ROW (Row 100) ---');
            console.log(rows[100]); // Check a deeper row if it exists
        }

    } catch (error: any) {
        console.error('Error reading sheet:', error.message);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
