/* eslint-disable @typescript-eslint/no-explicit-any */
// 响应模型（供 Swagger 文档展示；运行时返回结构兼容的普通对象）

export class UserDto {
  id!: string;
  nickname!: string;
  avatarId!: string;
  avatarUrl!: string | null;
  createdAt!: string;
}

export class LoginResultDto {
  accessToken!: string;
  user!: UserDto;
}

export class WorkDto {
  id!: string;
  userId!: string;
  title!: string;
  theme!: string;
  vaseId!: string;
  /** 插花快照 { items[], theme, vaseId, ... } */
  arrangement!: Record<string, any>;
  thumbnailUrl!: string | null;
  dateKey!: string;
  createdAt!: string;
  updatedAt!: string;
}

export class PlazaPostDto {
  id!: string;
  userId!: string;
  authorName!: string;
  title!: string;
  theme!: string;
  arrangement!: Record<string, any>;
  thumbnailUrl!: string | null;
  likeCount!: number;
  auditStatus!: string;
  createdAt!: string;
}

export class PlazaFeedResultDto {
  items!: PlazaPostDto[];
  nextCursor!: string | null;
}

export class LikeResultDto {
  likeCount!: number;
}

export class CustomMaterialDto {
  id!: string;
  userId!: string;
  name!: string;
  category!: string;
  baseMaterialId!: string;
  baseKind!: string | null;
  imageUrl!: string;
  sourceImageUrl!: string | null;
  createdAt!: string;
}

export class BuiltinMaterialDto {
  id!: string;
  name!: string;
  category!: string;
  kind!: string;
  colors!: string[];
  shape?: string;
  previewUrl?: string;
  minAppVersion?: string;
}

export class MaterialCategoryDto {
  id!: string;
  label!: string;
}

export class MaterialsCatalogDto {
  version!: string;
  categories!: MaterialCategoryDto[];
  materials!: BuiltinMaterialDto[];
}

export class AiSubmitDto {
  taskId!: string;
  status!: string;
  progress!: number;
}

export class AiImage2StatusDto {
  status!: string;
  progress!: number;
  imageUrl?: string;
  error?: string;
}

export class AiCutoutStatusDto {
  status!: string;
  progress!: number;
  image?: string;
  error?: string;
}

export class UploadSignatureResultDto {
  mode!: string;
  host!: string;
  key!: string;
  policy!: string;
  signature!: string;
  ossAccessKeyId!: string;
  expire!: number;
  maxSize!: number;
  fileUrl!: string;
}

export class UploadUrlDto {
  url!: string;
}

export class OkDto {
  ok!: boolean;
}
