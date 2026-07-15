import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import * as path from 'path';

/**
 * Service to handle Google Sheets API authentication and basic read operations.
 * Requires 'google-credentials.json' to be present in the project root or specified path.
 */
@Injectable()
export class SheetsService {
    private readonly logger = new Logger(SheetsService.name);
    private authClient: JWT;

    constructor() {
        this.initializeAuth();
    }

    private async initializeAuth() {
        try {
            const scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
            // En serverless (Vercel) no hay archivo en disco: se usa la variable de entorno
            // GOOGLE_CREDENTIALS_JSON (JSON crudo o codificado en base64). En local cae al
            // archivo google-credentials.json de la raíz del proyecto.
            const raw = process.env.GOOGLE_CREDENTIALS_JSON;
            if (raw) {
                const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
                const creds = JSON.parse(text);
                this.authClient = new google.auth.JWT({
                    email: creds.client_email,
                    key: creds.private_key,
                    scopes,
                });
            } else {
                const keyFilePath = path.join(process.cwd(), 'google-credentials.json');
                this.authClient = new google.auth.JWT({ keyFile: keyFilePath, scopes });
            }

            await this.authClient.authorize();
            this.logger.log('Google Sheets Auth successful');
        } catch (error) {
            this.logger.error('Failed to initialize Google Sheets Auth', error);
        }
    }

    async getSheetData(spreadsheetId: string, range: string) {
        if (!this.authClient) {
            await this.initializeAuth();
        }

        const sheets = google.sheets({ version: 'v4', auth: this.authClient });

        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range,
            });
            return response.data.values;
        } catch (error: any) {
            this.logger.error(`Error reading sheet ${spreadsheetId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Gets the Service Account Email to share with user
     */
    async getServiceAccountEmail(): Promise<string> {
        if (!this.authClient) {
            await this.initializeAuth();
        }
        return this.authClient.email || 'Unknown';
    }
}
