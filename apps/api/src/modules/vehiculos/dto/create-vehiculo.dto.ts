
import { IsString, IsNotEmpty, IsOptional, IsInt, IsDateString } from 'class-validator';

export class CreateVehiculoDto {
    @IsString()
    @IsNotEmpty()
    placa: string;

    @IsString()
    @IsOptional()
    marca_modelo?: string;

    @IsInt()
    @IsOptional()
    anio_fabricacion?: number;

    @IsString()
    @IsOptional()
    tipo_unidad?: string;

    @IsString()
    @IsOptional()
    tarjeta_circulacion?: string;

    @IsString()
    @IsOptional()
    poliza_seguro?: string;
}
