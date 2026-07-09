/** AI 能力适配层：DI 令牌 + 统一接口。中转站是同步出图，队列负责异步化。 */
export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface Image2Input {
  prompt: string;
  /** 参考图（图生图），dataURL 或 URL */
  image?: string;
  size?: string;
}

export interface CutoutInput {
  /** 待抠图原图，dataURL 或 URL */
  image: string;
  prompt?: string;
}

export interface AiProvider {
  /** 生成真实插花照片，同步返回成品图字节 */
  image2(input: Image2Input): Promise<Buffer>;
  /** 抠图，返回透明底 PNG 字节 */
  cutout(input: CutoutInput): Promise<Buffer>;
}
