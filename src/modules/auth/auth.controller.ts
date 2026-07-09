import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ApiData } from '../../common/dto/api-response.dto';
import { LoginResultDto } from '../../common/dto/entities.dto';
import { AuthService } from './auth.service';
import { WechatLoginDto } from './dto/wechat-login.dto';

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
}
