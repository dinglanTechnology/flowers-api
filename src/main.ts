import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  // 请求体上限调大：AI 参考图内联 dataURL、/upload 代传、作品缩略图、抠图原图均为 base64 图，
  // express 默认 100kb 会 PayloadTooLargeError。与 /upload 的 8MB 上限对齐留余量。
  app.useBodyParser('json', { limit: '15mb' });
  app.useBodyParser('urlencoded', { limit: '15mb', extended: true });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // CORS 全放开：反射任意 origin（credentials 场景浏览器不认字面量 '*'，反射等效）。
  // 代价：Cookie 鉴权的写操作不再有 Origin 白名单 CSRF 防护，敏感客户端建议用 Bearer token。
  app.enableCors({
    origin: '*',
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('插了个花 · 业务后端 API')
    .setDescription(
      [
        '微信小程序「插了个花」后端接口文档。',
        '',
        '## 统一响应包裹',
        '所有接口返回 `{ code, data, msg }`：',
        '- 成功：HTTP `200`，`{ code: 0, data: <业务数据>, msg: "ok" }`',
        '- 失败：HTTP 为真实状态码（400/401/403/404/429/500），`{ code: <同状态码>, data: null, msg: <错误信息> }`',
        '',
        '文档里各接口标注的响应 schema 即上面的 `data` 部分。',
        '',
        '## 鉴权',
        '除标注「公开」外均需登录：请求头 `Authorization: Bearer <accessToken>`。',
        '`accessToken` 由 `POST /api/auth/wechat/login` 或 `POST /api/auth/refresh` 获取。',
        '点右上角 **Authorize** 填入 token 后即可在此页调试。',
      ].join('\n'),
    )
    .setVersion('0.0.1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addTag('认证', 'wechat 登录、令牌刷新/登出')
    .addTag('用户', '当前用户资料')
    .addTag('配置', '主题、头像等客户端启动配置')
    .addTag('花材', '内置素材目录 + 自定义花材')
    .addTag('作品', '作品保存与创作日历')
    .addTag('广场', '作品分享、feed、点赞')
    .addTag('AI', 'AI 出图 / 抠图（异步任务）')
    .addTag('上传', 'OSS 直传签名与代传')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // 刷新页面保留已填的 token
      docExpansion: 'list',
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      tryItOutEnabled: true,
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(
    `🌸 flowers-api 启动: http://localhost:${port}/api  文档: /api/docs`,
    'Bootstrap',
  );
}
void bootstrap();
