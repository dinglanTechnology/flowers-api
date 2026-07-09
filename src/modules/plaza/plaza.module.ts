import { Module } from '@nestjs/common';
import { WechatModule } from '../../wechat/wechat.module';
import { PlazaController } from './plaza.controller';
import { PlazaService } from './plaza.service';

@Module({
  imports: [WechatModule],
  controllers: [PlazaController],
  providers: [PlazaService],
  exports: [PlazaService],
})
export class PlazaModule {}
