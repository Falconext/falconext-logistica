import { Module } from '@nestjs/common';
import { TrabajadoresModule } from './modules/trabajadores/trabajadores.module';
import { VehiculosModule } from './modules/vehiculos/vehiculos.module';
import { ProgramacionModule } from './modules/programacion/programacion.module';

@Module({
    imports: [TrabajadoresModule, VehiculosModule, ProgramacionModule],
    controllers: [],
    providers: [],
})
export class AppModule { }
