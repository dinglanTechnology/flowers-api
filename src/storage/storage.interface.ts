/** 存储适配层：DI 注入令牌 + 统一接口。切换 OSS/MinIO 只改实现，业务不感知。 */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/** 直传场景：决定对象 key 前缀、大小与类型限制 */
export type UploadScene = 'cutout-source' | 'export-reference' | 'work-thumbnail' | 'general';

export interface UploadSignatureInput {
  scene: UploadScene;
  ext?: string; // 文件扩展名，如 "png"
  userId: string;
}

/** OSS PostObject 策略签名，供小程序 wx.uploadFile 直传 */
export interface UploadSignature {
  mode: 'post-policy';
  host: string; // 直传地址 https://<bucket>.<region>.aliyuncs.com
  key: string; // 服务端预分配的对象 key
  policy: string; // base64 编码的 policy
  signature: string; // 基于 policy 的签名
  ossAccessKeyId: string;
  expire: number; // 过期 Unix 秒
  maxSize: number; // 允许的最大字节
  fileUrl: string; // 上传成功后可访问的 URL（含 CDN）
}

export interface StorageProvider {
  /** 服务端上传对象并返回可公开访问的 URL（AI 结果图等由后端直传时用） */
  put(key: string, buffer: Buffer, contentType: string): Promise<string>;

  /** 生成客户端直传凭证（OSS PostObject 策略签名）。MinIO 可不实现。 */
  createUploadSignature?(input: UploadSignatureInput): Promise<UploadSignature>;
}
