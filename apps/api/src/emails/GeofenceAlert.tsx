import * as React from 'react';
import { Html, Body, Head, Heading, Hr, Container, Preview, Section, Text, Button, Img } from '@react-email/components';

interface GeofenceAlertEmailProps {
    vehiclePlate: string;
    geofenceName: string;
    eventType: 'ENTER' | 'EXIT';
    time: string;
    mapLink: string;
}

export const GeofenceAlertEmail = ({
    vehiclePlate,
    geofenceName,
    eventType,
    time,
    mapLink,
}: GeofenceAlertEmailProps) => { // Removed 'default' destructuring
    const isEnter = eventType === 'ENTER';
    const color = isEnter ? '#10B981' : '#EF4444'; // Green or Red
    const actionText = isEnter ? 'ingresó a' : 'salió de';

    return (
        <Html>
            <Head />
            <Preview>Alerta de Geocerca: {vehiclePlate}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={h1}>Alerta de Rastreo GPS</Heading>
                    <Text style={text}>
                        El vehículo <strong>{vehiclePlate}</strong> ha reportado un evento.
                    </Text>

                    <Section style={{ ...box, borderColor: color }}>
                        <Text style={paragraph}>
                            <strong style={{ color: color, fontSize: '18px' }}>
                                {isEnter ? '🟢 ENTRADA' : '🔴 SALIDA'}
                            </strong>
                        </Text>
                        <Text style={paragraph}>
                            El vehículo {actionText} la zona: <strong>{geofenceName}</strong>
                        </Text>
                        <Text style={paragraph}>Hora: {time}</Text>
                    </Section>

                    <Button style={{ ...button, backgroundColor: '#2563EB' }} href={mapLink}>
                        Ver en Mapa en Vivo
                    </Button>

                    <Hr style={hr} />
                    <Text style={footer}>
                        Sistema de Logística - Notificaciones Automáticas
                    </Text>
                </Container>
            </Body>
        </Html>
    );
};

// Styles
const main = {
    backgroundColor: '#f6f9fc',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    padding: '20px 0 48px',
    marginBottom: '64px',
};

const box = {
    padding: '24px',
    borderRadius: '8px',
    borderWidth: '2px',
    borderStyle: 'solid',
    backgroundColor: '#f9f9f9',
    marginBottom: '24px',
};

const h1 = {
    color: '#333',
    fontSize: '24px',
    fontWeight: 'bold',
    textAlign: 'center' as const,
    margin: '30px 0',
};

const text = {
    color: '#333',
    fontSize: '16px',
    lineHeight: '24px',
    textAlign: 'left' as const,
};

const paragraph = {
    color: '#333',
    fontSize: '16px',
    lineHeight: '20px',
    margin: '10px 0',
};

const button = {
    backgroundColor: '#5F51E8',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '16px',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'block',
    width: '100%',
    padding: '12px',
};

const hr = {
    borderColor: '#e6ebf1',
    margin: '20px 0',
};

const footer = {
    color: '#8898aa',
    fontSize: '12px',
    lineHeight: '16px',
};

export default GeofenceAlertEmail;
