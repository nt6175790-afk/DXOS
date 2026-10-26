// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DatabaseModule } from '../../backend/src/database/database.module';
import { PrismaService } from '../../backend/src/database/prisma.service';

describe('database foundation', () => {
  it('initializes one Prisma service without opening a database connection', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              app: {
                databaseUrl: 'mysql://dxos:example@localhost:3306/dx_os',
              },
            }),
          ],
        }),
        DatabaseModule,
      ],
    }).compile();

    const prisma = moduleRef.get(PrismaService);

    expect(prisma).toBeDefined();
    expect(prisma.$connect).toEqual(expect.any(Function));
    expect(prisma.$disconnect).toEqual(expect.any(Function));

    await moduleRef.close();
  });
});
