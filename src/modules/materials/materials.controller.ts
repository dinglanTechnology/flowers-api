import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
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

  /** 内置素材目录（公开） */
  @Public()
  @Get('catalog')
  @ApiData(MaterialsCatalogDto)
  catalog() {
    return this.materialsService.getCatalog();
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
    @CurrentUser('openid') openid: string,
    @Body() dto: CreateCustomMaterialDto,
  ) {
    return this.materialsService.createCustom(userId, openid, dto);
  }

  /** 删除自定义花材（仅本人） */
  @ApiBearerAuth()
  @Delete('custom/:id')
  @ApiData(OkDto, { errors: [403, 404] })
  removeCustom(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.materialsService.removeCustom(userId, id);
  }
}
