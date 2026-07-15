import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class TenantsService {
    constructor(private prisma: PrismaService) { }

    async create(data: CreateTenantDto) {
        // Check if slug exists
        const existing = await this.prisma.tenant.findUnique({ where: { slug: data.slug } });
        if (existing) throw new ConflictException('Slug already exists');

        // Check if user exists
        const userExists = await this.prisma.user.findUnique({ where: { email: data.adminEmail } });
        if (userExists) throw new ConflictException('Admin email already exists');

        const hashedPassword = await bcrypt.hash(data.adminPassword, 10);

        // Transaction to create Tenant and Admin User
        return this.prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.create({
                data: {
                    name: data.name,
                    slug: data.slug,
                    plan: data.plan
                }
            });

            const user = await tx.user.create({
                data: {
                    email: data.adminEmail,
                    password: hashedPassword,
                    role: 'ADMIN',
                    tenant_id: tenant.id
                }
            });

            return { tenant, admin: { id: user.id, email: user.email } };
        });
    }

    async findAll() {
        return this.prisma.tenant.findMany({
            include: {
                _count: {
                    select: { users: true, vehiculos: true }
                }
            }
        });
    }

    async findOne(id: string) {
        const tenant = await this.prisma.tenant.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { users: true, vehiculos: true }
                }
            }
        });
        if (!tenant) throw new NotFoundException('Tenant not found');
        return tenant;
    }

    async update(id: string, data: UpdateTenantDto) {
        const existing = await this.prisma.tenant.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Tenant not found');

        return this.prisma.tenant.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.plan !== undefined && { plan: data.plan }),
                ...(data.moneda !== undefined && { moneda: data.moneda })
            }
        });
    }

    async remove(id: string) {
        const existing = await this.prisma.tenant.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Tenant not found');

        await this.prisma.tenant.delete({ where: { id } });
        return { id, deleted: true };
    }
}
