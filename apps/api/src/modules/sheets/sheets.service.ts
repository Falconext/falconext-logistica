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
            // Path to your Service Account Key
            // In a real env, this could be an ENV VAR with the JSON content
            const keyFilePath = path.join(process.cwd(), 'google-credentials.json');

            this.authClient = new google.auth.JWT({
                keyFile: keyFilePath,
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
            });

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
