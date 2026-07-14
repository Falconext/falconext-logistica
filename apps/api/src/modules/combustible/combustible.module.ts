import { Module } from '@nestjs/common';
import { CombustibleController } from './combustible.controller';
import { CombustibleService } from './combustible.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [CombustibleController],
  providers: [CombustibleService, PrismaService]
})
export class CombustibleModule { }
