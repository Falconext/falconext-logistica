import { IsArray, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUsuarioDto {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6)
    password: string;

    @IsOptional()
    @IsString()
    nombre?: string;

    @IsIn(['ADMIN', 'USER'])
    role: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    modulos?: string[];
}
