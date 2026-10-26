import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
@Module({ imports: [AuthModule, RbacModule], controllers: [CalendarController], providers: [CalendarService], exports: [CalendarService] })
export class CalendarModule {}
