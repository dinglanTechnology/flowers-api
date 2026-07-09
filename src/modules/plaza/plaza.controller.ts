import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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

  @Get()
  @ApiData(PlazaFeedResultDto)
  feed(@Query() query: PlazaFeedDto) {
    return this.plazaService.feed(query);
  }

  @Get(':id')
  @ApiData(PlazaPostDto)
  getById(@Param('id') id: string) {
    return this.plazaService.getById(id);
  }

  @Post()
  @ApiData(PlazaPostDto)
  share(@CurrentUser('userId') userId: string, @Body() dto: SharePlazaDto) {
    return this.plazaService.share(userId, dto);
  }

  @Post(':id/like')
  @ApiData(LikeResultDto)
  like(@Param('id') id: string) {
    return this.plazaService.like(id);
  }
}
