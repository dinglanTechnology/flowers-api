import { Logger } from '@nestjs/common';
import { AiProvider, CutoutInput, Image2Input } from './ai-provider.interface';

/** 带标识的 provider（AtlasProvider / RelayProvider 均满足） */
export type NamedProvider = AiProvider & { readonly name: string };

/**
 * 展开错误的 cause 链，把真正原因带出来。
 * 连接层失败时 undici 的 message 恒为 "fetch failed"、OpenAI SDK 为 "Connection error."，
 * 真正的 errno（ENOTFOUND / ECONNREFUSED / UND_ERR_CONNECT_TIMEOUT / 证书错误）藏在 error.cause 里。
 * 只取 message 会丢诊断信息，这里沿 cause 链拼出 "fetch failed → ECONNREFUSED (…)"。
 */
function describeError(error: unknown): string {
  const parts: string[] = [];
  let cur: unknown = error;
  for (let depth = 0; cur instanceof Error && depth < 5; depth++) {
    const code = (cur as { code?: string }).code;
    parts.push(code ? `${cur.message} [${code}]` : cur.message);
    cur = (cur as { cause?: unknown }).cause;
  }
  if (typeof cur === 'string' && cur) parts.push(cur);
  // 去掉相邻重复（cause 有时与父错误同文案）
  return parts.filter((p, i) => p && p !== parts[i - 1]).join(' → ');
}

/**
 * 多中转站故障转移：按顺序尝试（主用 atlas → 备用 tokenlab …），
 * 前一个抛错就切下一个，全部失败才向上抛出汇总错误。
 * 每次成功/切换都记日志，便于观测哪个上游在扛量。
 * 不关心各上游协议（Atlas 原生 / OpenAI 兼容），只依赖统一的 AiProvider 接口。
 */
export class FailoverProvider implements AiProvider {
  private readonly logger = new Logger(FailoverProvider.name);

  /** providers[0] 为主用，其余按序为备用 */
  constructor(private readonly providers: NamedProvider[]) {
    if (!providers.length) {
      throw new Error('FailoverProvider 需要至少一个中转站');
    }
  }

  image2(input: Image2Input): Promise<Buffer> {
    return this.run('image2', (p) => p.image2(input));
  }

  cutout(input: CutoutInput): Promise<Buffer> {
    return this.run('cutout', (p) => p.cutout(input));
  }

  private async run(
    op: string,
    call: (p: NamedProvider) => Promise<Buffer>,
  ): Promise<Buffer> {
    const errors: string[] = [];
    for (let i = 0; i < this.providers.length; i++) {
      const p = this.providers[i];
      try {
        const buffer = await call(p);
        if (i > 0) {
          this.logger.log(`${op} 由备用中转站 ${p.name} 完成（主用已失败）`);
        }
        return buffer;
      } catch (error) {
        const msg = describeError(error);
        const isLast = i === this.providers.length - 1;
        this.logger.warn(
          `${op} 中转站 ${p.name} 失败: ${msg}` +
            (isLast ? '（已无备用）' : '，切换下一个'),
        );
        errors.push(`${p.name}: ${msg}`);
      }
    }
    throw new Error(`${op} 所有中转站均失败 → ${errors.join(' | ')}`);
  }
}
