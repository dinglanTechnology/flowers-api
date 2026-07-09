import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { WechatService } from './wechat.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: {
          // 值形如 '30d'，运行时由 ms() 解析；此处转型以满足 @nestjs/jwt 类型
          expiresIn: (config.get<string>('jwt.expiresIn') ?? '30d') as unknown as number,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, WechatService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
