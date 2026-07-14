import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class CreateTenantDto {
    @IsNotEmpty()
    name: string;

    @IsNotEmpty()
    slug: string;

    @IsNotEmpty()
    plan: string;

    @IsEmail()
    adminEmail: string;

    @IsNotEmpty()
    @MinLength(6)
    adminPassword: string;
}
