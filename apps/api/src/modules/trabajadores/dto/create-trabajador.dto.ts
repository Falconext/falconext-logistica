
import { IsString, IsNotEmpty, IsOptional, IsEmail, IsDateString } from 'class-validator';

export class CreateTrabajadorDto {
    @IsString()
    @IsNotEmpty()
    nombre_completo: string;

    @IsString()
    @IsNotEmpty()
    cargo: string;

    @IsString()
    @IsOptional()
    estado_laboral?: string;

    @IsOptional()
    sueldo_base?: number;

    @IsString()
    @IsOptional()
    nacionalidad?: string;

    @IsDateString()
    @IsOptional()
    fecha_nacimiento?: string;

    @IsString()
    @IsOptional()
    url_foto?: string;

    // Docs
    @IsString()
    @IsOptional()
    numero_pasaporte?: string;

    @IsDateString()
    @IsOptional()
    fecha_vencimiento_pasaporte?: string;

    // ... (Simplifying for brevity, but all fields should be here ideally)
    // We can add the rest as needed or use partial mapping
    @IsString()
    @IsOptional()
    email_personal?: string;
}
