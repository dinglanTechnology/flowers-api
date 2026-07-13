import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { WorksModule } from './modules/works/works.module';
import { PlazaModule } from './modules/plaza/plaza.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { UploadModule } from './modules/upload/upload.module';
import { AiModule } from './modules/ai/ai.module';
import { AppConfigModule } from './modules/app-config/app-config.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    StorageModule,
    // 业务模块（接口在各自阶段实现）
    AuthModule,
    UsersModule,
    WorksModule,
    PlazaModule,
    MaterialsModule,
    UploadModule,
    AiModule,
    AppConfigModule,
  ],
  controllers: [AppController],
  providers: [
    // 全局响应包裹 + 异常处理
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // 全局限流：让 @Throttle() 真正生效（sms/send、ai 接口等按各自 limit 限流）。
    // 无此 guard 时 @Throttle 仅是元数据、形同虚设。放在鉴权前，未登录请求也受限。
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // 全局鉴权（@Public() 跳过）；JwtService 由 AuthModule 导出的 JwtModule 提供
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
