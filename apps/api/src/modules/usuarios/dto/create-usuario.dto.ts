import { IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUsuarioDto {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6)
    password: string;

    @IsOptional()
    @IsString()
    nombre?: string;

    @IsOptional()
    @IsString()
    rol_id?: string | null; // rol/puesto asignado (define módulos y comportamiento)

    @IsOptional()
    @IsString()
    trabajador_id?: string | null; // UUID del trabajador vinculado
}
