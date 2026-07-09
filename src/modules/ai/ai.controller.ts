import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiData } from '../../common/dto/api-response.dto';
import {
  AiCutoutStatusDto,
  AiImage2StatusDto,
  AiSubmitDto,
} from '../../common/dto/entities.dto';
import { AiService } from './ai.service';
import { Image2Dto, CutoutDto } from './dto/ai.dto';

@ApiTags('AI')
@ApiBearerAuth()
@Controller()
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /** 生成真实插花照片（每分钟限 10 次） */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('image2')
  @ApiData(AiSubmitDto)
  submitImage2(@CurrentUser('userId') userId: string, @Body() dto: Image2Dto) {
    return this.aiService.submitImage2(userId, dto);
  }

  @Get('image2/:taskId')
  @ApiData(AiImage2StatusDto)
  getImage2(@CurrentUser('userId') userId: string, @Param('taskId') taskId: string) {
    return this.aiService.getImage2Task(userId, taskId);
  }

  /** 抠图生成透明底素材（每分钟限 10 次） */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('cutout-flower')
  @ApiData(AiSubmitDto)
  submitCutout(@CurrentUser('userId') userId: string, @Body() dto: CutoutDto) {
    return this.aiService.submitCutout(userId, dto);
  }

  @Get('cutout-flower/:taskId')
  @ApiData(AiCutoutStatusDto)
  getCutout(@CurrentUser('userId') userId: string, @Param('taskId') taskId: string) {
    return this.aiService.getCutoutTask(userId, taskId);
  }
}
