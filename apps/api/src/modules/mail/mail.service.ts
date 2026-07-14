import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import * as React from 'react';
import GeofenceAlertEmail from '../../emails/GeofenceAlert';

@Injectable()
export class MailService {
    private resend: Resend;

    constructor() {
        this.resend = new Resend(process.env.RESEND_API_KEY);
    }

    async sendGeofenceAlert(to: string, data: { vehiclePlate: string, geofenceName: string, eventType: 'ENTER' | 'EXIT', time: string, mapLink: string }) {
        if (!to || !process.env.RESEND_API_KEY) {
            console.log("Skipping email: No API Key or Recipient");
            return;
        }

        try {
            const emailHtml = await render(
                React.createElement(GeofenceAlertEmail, {
                    vehiclePlate: data.vehiclePlate,
                    geofenceName: data.geofenceName,
                    eventType: data.eventType,
                    time: data.time,
                    mapLink: data.mapLink
                })
            );

            const subject = `Alerta GPS: ${data.vehiclePlate} ${data.eventType === 'ENTER' ? 'ENTRÓ' : 'SALIÓ'} de ${data.geofenceName}`;

            await this.resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
                to: to,
                subject: subject,
                html: emailHtml,
            });

            console.log(`Email sent to ${to}`);
        } catch (error) {
            console.error('Error sending email:', error);
        }
    }
}
