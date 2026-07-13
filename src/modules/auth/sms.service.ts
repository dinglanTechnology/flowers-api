import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import Dysmsapi, { SendSmsRequest } from '@alicloud/dysmsapi20170525';
import { Config as OpenApiConfig } from '@alicloud/openapi-client';
import { RuntimeOptions } from '@alicloud/tea-util';
import { RedisService } from '../../redis/redis.service';

/** 验证码在 Redis 的 key 前缀 */
const CODE_PREFIX = 'sms:code:'; // 值=验证码，TTL 5min
const COOLDOWN_PREFIX = 'sms:cd:'; // 存在即处于 60s 冷却
const CODE_TTL = 300; // 验证码有效期（秒）
const COOLDOWN_TTL = 60; // 同号发送冷却（秒）

/**
 * 阿里云短信验证码服务（Web 手机号登录）。
 * 未配置 accessKey 时走开发降级：不真发短信，仅把验证码打到日志，便于本地联调。
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly signName: string;
  private readonly templateCode: string;
  private readonly client: Dysmsapi | null;

  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    const accessKeyId = config.get<string>('sms.accessKeyId') ?? '';
    const accessKeySecret = config.get<string>('sms.accessKeySecret') ?? '';
    const endpoint =
      config.get<string>('sms.endpoint') ?? 'dysmsapi.aliyuncs.com';
    this.signName = config.get<string>('sms.signName') ?? '';
    this.templateCode = config.get<string>('sms.templateCode') ?? '';

    this.client =
      accessKeyId && accessKeySecret
        ? new Dysmsapi(
            new OpenApiConfig({ accessKeyId, accessKeySecret, endpoint }),
          )
        : null;
    if (!this.client) {
      this.logger.warn('阿里云短信未配置，发码走开发降级（仅打印日志，不真发）');
    }
  }

  /**
   * 发送验证码：同号 60s 冷却 → 生成 6 位码存 Redis(5min) → 调用阿里云下发。
   * 冷却/下发失败均抛 BadRequestException。
   */
  async sendCode(phone: string): Promise<void> {
    // 同号 60s 冷却（SET NX EX 原子占位）
    const ok = await this.redis.set(
      COOLDOWN_PREFIX + phone,
      '1',
      'EX',
      COOLDOWN_TTL,
      'NX',
    );
    if (ok !== 'OK') {
      throw new BadRequestException('验证码发送过于频繁，请稍后再试');
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis.set(CODE_PREFIX + phone, code, 'EX', CODE_TTL);

    if (!this.client) {
      // 开发降级：不真发，打日志
      this.logger.warn(`[开发降级] 手机号 ${phone} 的验证码：${code}`);
      return;
    }

    try {
      const req = new SendSmsRequest({
        phoneNumbers: phone,
        signName: this.signName,
        templateCode: this.templateCode,
        templateParam: JSON.stringify({ code }),
      });
      const res = await this.client.sendSmsWithOptions(req, new RuntimeOptions({}));
      if (res.body?.code !== 'OK') {
        // 下发失败：清掉冷却，允许用户立即重试
        await this.redis.del(COOLDOWN_PREFIX + phone);
        this.logger.error(
          `短信下发失败 phone=${phone} code=${res.body?.code} msg=${res.body?.message}`,
        );
        throw new BadRequestException('验证码发送失败，请稍后再试');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      await this.redis.del(COOLDOWN_PREFIX + phone);
      this.logger.error(`短信服务异常: ${(error as Error).message}`);
      throw new BadRequestException('验证码发送失败，请稍后再试');
    }
  }

  /**
   * 校验验证码：命中即消费（getdel 一次性，防重放）。
   * 校验通过返回 true。
   */
  async verifyCode(phone: string, code: string): Promise<boolean> {
    const saved = await this.redis.getdel(CODE_PREFIX + phone);
    return Boolean(saved) && saved === code;
  }
}
