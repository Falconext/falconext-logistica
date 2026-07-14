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
}
