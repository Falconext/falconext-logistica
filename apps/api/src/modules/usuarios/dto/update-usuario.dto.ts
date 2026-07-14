import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUsuarioDto {
    @IsOptional()
    @IsString()
    nombre?: string;

    @IsOptional()
    @IsIn(['ADMIN', 'USER'])
    role?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    modulos?: string[];

    @IsOptional()
    @IsBoolean()
    activo?: boolean;

    @IsOptional()
    @IsString()
    @MinLength(6)
    password?: string;

    @IsOptional()
    @IsString()
    trabajador_id?: string | null; // UUID del trabajador vinculado (null para desvincular)

    @IsOptional()
    @IsString()
    rol_id?: string | null; // rol/puesto (null para desasignar)
}
