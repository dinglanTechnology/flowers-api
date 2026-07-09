import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiData } from '../../common/dto/api-response.dto';
import { OkDto, WorkDto } from '../../common/dto/entities.dto';
import { WorksService } from './works.service';
import { CreateWorkDto } from './dto/create-work.dto';
import { UpdateWorkDto } from './dto/update-work.dto';

@ApiTags('作品')
@ApiBearerAuth()
@Controller('works')
export class WorksController {
  constructor(private readonly worksService: WorksService) {}

  /** 日历：某月每天作品数量（须在 :id 路由之前声明） */
  @Get('calendar')
  calendar(
    @CurrentUser('userId') userId: string,
    @Query('month') month?: string,
  ) {
    return this.worksService.calendar(userId, month);
  }

  /** 某天的作品列表（`?dateKey=YYYY-MM-DD`），按 createdAt 倒序 */
  @Get()
  @ApiData(WorkDto, { isArray: true })
  list(
    @CurrentUser('userId') userId: string,
    @Query('dateKey') dateKey?: string,
  ) {
    return this.worksService.list(userId, dateKey);
  }

  /** 作品详情 */
  @Get(':id')
  @ApiData(WorkDto, { errors: [403, 404] })
  findOne(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.worksService.findOne(userId, id);
  }

  /** 保存作品 */
  @Post()
  @ApiData(WorkDto)
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateWorkDto) {
    return this.worksService.create(userId, dto);
  }

  /** 更新作品（字段任意子集） */
  @Patch(':id')
  @ApiData(WorkDto, { errors: [403, 404] })
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkDto,
  ) {
    return this.worksService.update(userId, id, dto);
  }

  /** 删除作品 */
  @Delete(':id')
  @ApiData(OkDto, { errors: [403, 404] })
  remove(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.worksService.remove(userId, id);
  }
}
