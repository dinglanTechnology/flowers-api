import { Injectable } from '@nestjs/common';
import { AVATAR_OPTIONS, BOOTSTRAP_VERSION, THEMES } from './bootstrap.data';

@Injectable()
export class AppConfigService {
  /** 客户端启动配置（主题 + 头像预设），版本化，未变则回 changed:false */
  getBootstrap(clientVersion?: string) {
    if (clientVersion && clientVersion === BOOTSTRAP_VERSION) {
      return { version: BOOTSTRAP_VERSION, changed: false };
    }
    return {
      version: BOOTSTRAP_VERSION,
      themes: THEMES,
      avatars: AVATAR_OPTIONS,
    };
  }
}
