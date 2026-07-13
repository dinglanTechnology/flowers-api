import { BadRequestException, Body, Controller, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ApiData } from '../../common/dto/api-response.dto';
import { LoginResultDto, TokenPairDto } from '../../common/dto/entities.dto';
import {
  CookieService,
  REFRESH_COOKIE,
} from '../../common/cookies/cookie.service';
import { AuthService } from './auth.service';
import { WechatLoginDto } from './dto/wechat-login.dto';
import { SmsSendDto } from './dto/sms-send.dto';
import { SmsLoginDto } from './dto/sms-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

/** 从 Cookie 或 body 取 refreshToken（Web 用 Cookie，小程序用 body） */
function pickRefreshToken(
  req: { cookies?: Record<string, string> },
  body: RefreshTokenDto,
): string {
  const token = req.cookies?.[REFRESH_COOKIE] ?? body.refreshToken;
  if (!token) throw new BadRequestException('缺少 refreshToken');
  return token;
}

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookies: CookieService,
  ) {}

  /**
   * 微信小程序登录。
   * 令牌在 body 返回（小程序用）并同时写入 httpOnly Cookie（Web 用，小程序忽略）。
   */
  @Public()
  @Post('wechat/login')
  @ApiData(LoginResultDto)
  async wechatLogin(
    @Body() dto: WechatLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.wechatLogin(dto);
    this.cookies.setAuth(res, result);
    return result;
  }

  /** Web 手机号登录：发送短信验证码（IP 限流 5/min，另有同号 60s 冷却） */
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('sms/send')
  async sendSms(@Body() dto: SmsSendDto) {
    await this.authService.sendSmsCode(dto.phone);
    return { sent: true };
  }

  /** Web 手机号登录：校验验证码 → 签发令牌（账号跨端合并），写入 httpOnly Cookie */
  @Public()
  @Post('sms/login')
  @ApiData(LoginResultDto)
  async smsLogin(
    @Body() dto: SmsLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.smsLogin(dto);
    this.cookies.setAuth(res, result);
    return result;
  }

  /** 用 refresh token 换取新令牌对（Web 走 Cookie，小程序走 body） */
  @Public()
  @Post('refresh')
  @ApiData(TokenPairDto)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const req = res.req as { cookies?: Record<string, string> };
    const tokens = await this.authService.refresh(pickRefreshToken(req, dto));
    this.cookies.setAuth(res, tokens);
    return tokens;
  }

  /** 登出：吊销 refresh token 并清除 Cookie */
  @Public()
  @Post('logout')
  async logout(
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const req = res.req as { cookies?: Record<string, string> };
    const token = req.cookies?.[REFRESH_COOKIE] ?? dto.refreshToken;
    if (token) await this.authService.logout(token);
    this.cookies.clearAuth(res);
    return { success: true };
  }
}
