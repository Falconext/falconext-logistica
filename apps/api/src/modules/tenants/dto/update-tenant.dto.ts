import { IsIn, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateTenantDto {
    @IsOptional()
    @IsNotEmpty()
    name?: string;

    @IsOptional()
    @IsNotEmpty()
    plan?: string;

    @IsOptional()
    @IsIn(['PEN', 'USD', 'EUR'])
    moneda?: string;
}
