import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiData } from '../../common/dto/api-response.dto';
import {
  LikeResultDto,
  OkDto,
  PlazaFeedResultDto,
  PlazaPostDto,
  ViewResultDto,
} from '../../common/dto/entities.dto';
import { PlazaService } from './plaza.service';
import { PlazaFeedDto, SharePlazaDto, ViewPlazaDto } from './dto/plaza.dto';

@ApiTags('广场')
@ApiBearerAuth()
@Controller('plaza')
export class PlazaController {
  constructor(private readonly plazaService: PlazaService) {}

  /** 广场 feed（公开，无需登录；登录用户会带上 liked 态） */
  @Public()
  @Get()
  @ApiData(PlazaFeedResultDto)
  feed(
    @CurrentUser('userId') userId: string | undefined,
    @Query() query: PlazaFeedDto,
  ) {
    return this.plazaService.feed(userId, query);
  }

  /** 广场作品详情（供"点开继续编辑"） */
  @Get(':id')
  @ApiData(PlazaPostDto, { errors: [404] })
  getById(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.plazaService.getById(userId, id);
  }

  @Post()
  @ApiData(PlazaPostDto)
  share(@CurrentUser('userId') userId: string, @Body() dto: SharePlazaDto) {
    return this.plazaService.share(userId, dto);
  }

  /** 撤回发布（仅作者本人；不删除本地保存的作品） */
  @Delete(':id')
  @ApiData(OkDto, { errors: [403, 404] })
  remove(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.plazaService.remove(userId, id);
  }

  /** 点赞/取消赞（幂等 toggle） */
  @Post(':id/like')
  @ApiData(LikeResultDto, { errors: [404] })
  like(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.plazaService.like(userId, id);
  }

  /**
   * 浏览量上报（公开）：打开作品预览弹窗时调用；
   * 同一用户/匿名访客对同一帖子每自然日最多计 1 次
   */
  @Public()
  @Post(':id/view')
  @ApiData(ViewResultDto, { errors: [400, 404] })
  recordView(
    @CurrentUser('userId') userId: string | undefined,
    @Param('id') id: string,
    @Body() dto: ViewPlazaDto,
  ) {
    return this.plazaService.recordView(userId, id, dto);
  }
}
