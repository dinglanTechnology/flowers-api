import { Module } from '@nestjs/common';
import { WechatModule } from '../../wechat/wechat.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [WechatModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
