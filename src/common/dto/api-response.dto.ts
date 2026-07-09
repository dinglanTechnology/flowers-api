import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiProperty,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

/** 统一响应包裹的外层 */
export class ApiEnvelopeDto {
  @ApiProperty({
    example: 0,
    description: '业务码，0 成功；失败时与 HTTP 状态码一致',
  })
  code!: number;

  @ApiProperty({ example: 'ok', description: '提示信息，成功为 "ok"' })
  msg!: string;
}

const ERROR_MAP: Record<number, [string, string]> = {
  400: ['400 参数错误 / 校验失败 / 内容审核不通过', '参数校验失败'],
  401: ['401 未认证：缺失或失效的令牌', '令牌无效或已过期'],
  403: ['403 无权限：操作非本人资源', '无权操作'],
  404: ['404 资源不存在', '资源不存在'],
  429: ['429 请求过频（AI 接口限流）', '请求过于频繁，请稍后再试'],
};

/**
 * 声明成功响应的 data 类型，并套上统一包裹 { code, data, msg }，同时文档化常见错误响应。
 *
 * 用法：@ApiData(WorkDto) / @ApiData(WorkDto, { isArray: true })
 *      @ApiData(WorkDto, { errors: [401, 404] })  附加鉴权/资源错误
 */
export function ApiData<TModel extends Type<unknown>>(
  model: TModel,
  opts?: { isArray?: boolean; errors?: (400 | 401 | 403 | 404 | 429)[] },
) {
  const dataSchema = opts?.isArray
    ? { type: 'array', items: { $ref: getSchemaPath(model) } }
    : { $ref: getSchemaPath(model) };

  // 默认所有接口都可能 400；再叠加调用方声明的错误
  const statuses = Array.from(new Set<number>([400, ...(opts?.errors ?? [])]));

  return applyDecorators(
    ApiExtraModels(ApiEnvelopeDto, model),
    ApiOkResponse({
      description:
        '成功；外层恒为 { code: 0, …, msg: "ok" }，data 为下方 schema',
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiEnvelopeDto) },
          { properties: { data: dataSchema } },
        ],
      },
    }),
    ...statuses.map((s) =>
      ApiResponse({
        status: s,
        description: ERROR_MAP[s][0],
        schema: { example: { code: s, data: null, msg: ERROR_MAP[s][1] } },
      }),
    ),
  );
}
