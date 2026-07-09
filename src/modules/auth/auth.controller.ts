import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ApiData } from '../../common/dto/api-response.dto';
import { LoginResultDto, TokenPairDto } from '../../common/dto/entities.dto';
import { AuthService } from './auth.service';
import { WechatLoginDto } from './dto/wechat-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 微信小程序登录 */
  @Public()
  @Post('wechat/login')
  @ApiData(LoginResultDto)
  wechatLogin(@Body() dto: WechatLoginDto) {
    return this.authService.wechatLogin(dto);
  }

  /** 用 refresh token 换取新令牌对 */
  @Public()
  @Post('refresh')
  @ApiData(TokenPairDto)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /** 登出：吊销 refresh token */
  @Public()
  @Post('logout')
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
    return { success: true };
  }
}
