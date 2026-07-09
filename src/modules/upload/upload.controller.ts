import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UploadScene } from '../../storage/storage.interface';
import { ApiData } from '../../common/dto/api-response.dto';
import {
  UploadSignatureResultDto,
  UploadUrlDto,
} from '../../common/dto/entities.dto';
import { UploadService } from './upload.service';
import { SignatureDto, UploadDataUrlDto } from './dto/upload.dto';

@ApiTags('上传')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /** OSS 直传签名（推荐） */
  @Post('signature')
  @ApiData(UploadSignatureResultDto)
  signature(@CurrentUser('userId') userId: string, @Body() dto: SignatureDto) {
    return this.uploadService.createSignature(
      userId,
      dto.scene as UploadScene,
      dto.ext,
    );
  }

  /** 服务端代传（dataURL，兜底；multipart 待 P5 补充） */
  @Post()
  @ApiData(UploadUrlDto)
  upload(@CurrentUser('userId') userId: string, @Body() dto: UploadDataUrlDto) {
    return this.uploadService.uploadDataUrl(userId, dto.dataUrl);
  }
}
