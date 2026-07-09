// 响应模型（供 Swagger 文档展示；运行时返回结构兼容的普通对象）

export class UserDto {
  id!: string;
  nickname!: string;
  avatarId!: string;
  avatarUrl!: string | null;
  phone!: string | null;
  createdAt!: string;
}

export class LoginResultDto {
  accessToken!: string;
  refreshToken!: string;
  user!: UserDto;
}

export class TokenPairDto {
  accessToken!: string;
  refreshToken!: string;
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

export class MaterialStyleDto {
  styleOption!: string;
  name!: string;
  /** 该姿态的 OSS 透明底 PNG（已烘入长度） */
  imageUrl!: string;
}

export class BuiltinMaterialDto {
  id!: string;
  name!: string;
  category!: string;
  /** 缩略图/单样式素材的 OSS 透明底 PNG */
  imageUrl!: string | null;
  /** 多样式素材（花/枝/线）的 6 款姿态；花器等单样式素材为 null */
  styles!: MaterialStyleDto[] | null;
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
