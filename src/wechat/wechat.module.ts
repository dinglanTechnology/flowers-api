import { Module } from '@nestjs/common';
import { WechatSecurityService } from './wechat-security.service';

/** 微信开放能力（内容安全审核等），供 Plaza 等模块使用 */
@Module({
  providers: [WechatSecurityService],
  exports: [WechatSecurityService],
})
export class WechatModule {}
