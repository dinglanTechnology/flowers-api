import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ApiData } from '../../common/dto/api-response.dto';
import { BootstrapConfigDto } from '../../common/dto/entities.dto';
import { AppConfigService } from './app-config.service';

@ApiTags('配置')
@Controller('config')
export class AppConfigController {
  constructor(private readonly appConfigService: AppConfigService) {}

  /** 启动配置：主题 + 头像预设（公开，版本化缓存） */
  @Public()
  @Get('bootstrap')
  @ApiData(BootstrapConfigDto)
  bootstrap(@Query('version') version?: string) {
    return this.appConfigService.getBootstrap(version);
  }
}
