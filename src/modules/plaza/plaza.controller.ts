import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiData } from '../../common/dto/api-response.dto';
import {
  LikeResultDto,
  PlazaFeedResultDto,
  PlazaPostDto,
} from '../../common/dto/entities.dto';
import { PlazaService } from './plaza.service';
import { PlazaFeedDto, SharePlazaDto } from './dto/plaza.dto';

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

  /** 点赞/取消赞（幂等 toggle） */
  @Post(':id/like')
  @ApiData(LikeResultDto, { errors: [404] })
  like(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.plazaService.like(userId, id);
  }
}
