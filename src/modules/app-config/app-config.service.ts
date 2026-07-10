import { Injectable } from '@nestjs/common';
import { AVATAR_OPTIONS, THEMES } from './bootstrap.data';

@Injectable()
export class AppConfigService {
  /** 客户端启动配置（主题 + 头像预设） */
  getBootstrap() {
    return {
      themes: THEMES,
      avatars: AVATAR_OPTIONS,
    };
  }
}
