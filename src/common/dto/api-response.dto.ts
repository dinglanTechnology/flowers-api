import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

/** 统一响应包裹的外层 */
export class ApiEnvelopeDto {
  /** 业务码，0 表示成功 */
  code!: number;
  /** 提示信息 */
  msg!: string;
}

/**
 * 声明成功响应的 data 类型，并套上统一包裹 { code, data, msg }。
 * 用法：@ApiData(WorkDto) / @ApiData(WorkDto, { isArray: true })
 */
export function ApiData<TModel extends Type<unknown>>(
  model: TModel,
  opts?: { isArray?: boolean },
) {
  const dataSchema = opts?.isArray
    ? { type: 'array', items: { $ref: getSchemaPath(model) } }
    : { $ref: getSchemaPath(model) };

  return applyDecorators(
    ApiExtraModels(ApiEnvelopeDto, model),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiEnvelopeDto) },
          { properties: { data: dataSchema } },
        ],
      },
    }),
  );
}
