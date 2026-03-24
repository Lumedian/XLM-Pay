import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DatabaseModule } from '../database.module';
import { AuditController } from './audit.controller';
import { AuditContextMiddleware } from './audit-context.middleware';
import { AuditContextService } from './audit-context.service';
import { AuditLoggingInterceptor } from './audit.interceptor';
import { AuditLogService } from './audit-log.service';

@Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [AuditController],
    providers: [
        AuditContextService,
        AuditLogService,
        RolesGuard,
        {
            provide: APP_INTERCEPTOR,
            useClass: AuditLoggingInterceptor,
        },
    ],
    exports: [AuditContextService, AuditLogService],
})
export class AuditModule implements NestModule {
    configure (consumer: MiddlewareConsumer) {
        consumer
            .apply(AuditContextMiddleware)
            .forRoutes({ path: '*', method: RequestMethod.ALL });
    }
}