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
  CustomMaterialDto,
  MaterialsCatalogDto,
  OkDto,
} from '../../common/dto/entities.dto';
import { MaterialsService } from './materials.service';
import { CreateCustomMaterialDto } from './dto/create-custom-material.dto';

@ApiTags('花材')
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  /** 内置素材目录（公开，版本化缓存） */
  @Public()
  @Get('catalog')
  @ApiData(MaterialsCatalogDto)
  catalog(@Query('version') version?: string) {
    return this.materialsService.getCatalog(version);
  }

  @ApiBearerAuth()
  @Get('custom')
  @ApiData(CustomMaterialDto, { isArray: true })
  listCustom(@CurrentUser('userId') userId: string) {
    return this.materialsService.listCustom(userId);
  }

  @ApiBearerAuth()
  @Post('custom')
  @ApiData(CustomMaterialDto)
  createCustom(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateCustomMaterialDto,
  ) {
    return this.materialsService.createCustom(userId, dto);
  }

  @ApiBearerAuth()
  @Delete('custom/:id')
  @ApiData(OkDto)
  removeCustom(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.materialsService.removeCustom(userId, id);
  }
}
