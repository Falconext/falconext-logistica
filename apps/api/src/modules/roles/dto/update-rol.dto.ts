import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateRolDto {
    @IsOptional()
    @IsString()
    nombre?: string;

    @IsOptional()
    @IsString()
    descripcion?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    modulos?: string[];

    @IsOptional()
    @IsBoolean()
    es_admin?: boolean;

    @IsOptional()
    @IsBoolean()
    solo_propios?: boolean;
}
