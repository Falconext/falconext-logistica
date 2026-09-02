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
import { PanelModule } from './modules/panel/panel.module';
import { RecorridosModule } from './modules/recorridos/recorridos.module';
import { RegistrosModule } from './modules/registros/registros.module';
import { VelocityModule } from './modules/velocity/velocity.module';

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
        UsuariosModule,
        RolesModule,
        PanelModule,
        RecorridosModule,
        RegistrosModule,
        VelocityModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule { }
