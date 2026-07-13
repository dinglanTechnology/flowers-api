import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { WechatService } from './wechat.service';
import { TokenService } from './token.service';
import { SmsService } from './sms.service';
import { CookieService } from '../../common/cookies/cookie.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        // access 有效期在签发时按 token 指定（见 TokenService），此处不设全局默认
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    WechatService,
    TokenService,
    SmsService,
    CookieService,
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
