import { SheetsModule } from './modules/sheets/sheets.module';
import { Module } from '@nestjs/common';
import { TrabajadoresModule } from './modules/trabajadores/trabajadores.module';
import { VehiculosModule } from './modules/vehiculos/vehiculos.module';
import { ProgramacionModule } from './modules/programacion/programacion.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { MantenimientoModule } from './modules/mantenimiento/mantenimiento.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { GpsModule } from './modules/gps/gps.module';
import { MailModule } from './modules/mail/mail.module';
import { FilesModule } from './modules/files/files.module';
import { DocumentosModule } from './modules/documentos/documentos.module';
import { PeajesModule } from './modules/peajes/peajes.module';
import { CombustibleModule } from './modules/combustible/combustible.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { RolesModule } from './modules/roles/roles.module';

@Module({
    imports: [
        AuthModule,
        TenantsModule,
        DashboardModule,
        VehiculosModule,
        GpsModule,
        MailModule,
        FilesModule, // Added FilesModule
        TrabajadoresModule, // Kept existing modules
        ProgramacionModule, // Kept existing modules
        MantenimientoModule, // Kept existing modules
        DocumentosModule,
        PeajesModule,
        CombustibleModule,
        AlertsModule, // Kept existing modules
        SheetsModule,
        UsuariosModule,
        RolesModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule { }
