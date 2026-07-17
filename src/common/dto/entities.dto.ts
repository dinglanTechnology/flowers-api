// 响应模型（供 Swagger 文档展示；运行时返回结构兼容的普通对象）
import { ApiProperty } from '@nestjs/swagger';

const THEME_IDS = ['night', 'light', 'morning', 'rouge', 'gallery', 'onyx'];
const AVATAR_IDS = [
  'lotus',
  'orchid',
  'sun',
  'leaf',
  'rose',
  'moon',
  'tea',
  'ink',
];
const AUDIT_STATUS = ['pending', 'approved', 'rejected'];

export class UserDto {
  @ApiProperty({ example: 'ckuser123' })
  id!: string;
  @ApiProperty({ example: '花间一壶酒' })
  nickname!: string;
  @ApiProperty({ enum: AVATAR_IDS, example: 'lotus' })
  avatarId!: string;
  @ApiProperty({
    nullable: true,
    example: null,
    description: '自定义头像 OSS URL',
  })
  avatarUrl!: string | null;
  @ApiProperty({
    nullable: true,
    example: '13800138000',
    description: '手机号，未绑为 null',
  })
  phone!: string | null;
  @ApiProperty({ example: '2026-07-09T02:15:00.000Z' })
  createdAt!: string;
}

export class LoginResultDto {
  @ApiProperty({ description: '短期访问令牌（JWT）' })
  accessToken!: string;
  @ApiProperty({ description: '长期刷新令牌（不透明串）' })
  refreshToken!: string;
  user!: UserDto;
}

export class TokenPairDto {
  accessToken!: string;
  refreshToken!: string;
}

export class WorkDto {
  @ApiProperty({ example: 'ckwork123' })
  id!: string;
  userId!: string;
  @ApiProperty({ example: '今日花事' })
  title!: string;
  @ApiProperty({ enum: THEME_IDS, example: 'night' })
  theme!: string;
  @ApiProperty({ example: 'mat-vase-ink' })
  vaseId!: string;
  @ApiProperty({
    type: Object,
    additionalProperties: true,
    description: '插花快照 { items[], theme, vaseId, ... }',
  })
  arrangement!: Record<string, any>;
  @ApiProperty({ nullable: true })
  thumbnailUrl!: string | null;
  @ApiProperty({ example: '2026-07-09', description: '日历聚合键 YYYY-MM-DD' })
  dateKey!: string;
  createdAt!: string;
  updatedAt!: string;
}

export class PlazaPostDto {
  @ApiProperty({ example: 'ckpost123' })
  id!: string;
  userId!: string;
  @ApiProperty({ description: '作者昵称快照', example: '花间一壶酒' })
  authorName!: string;
  title!: string;
  @ApiProperty({ enum: THEME_IDS, example: 'night' })
  theme!: string;
  @ApiProperty({ type: Object, additionalProperties: true })
  arrangement!: Record<string, any>;
  @ApiProperty({ nullable: true })
  thumbnailUrl!: string | null;
  @ApiProperty({ example: 12 })
  likeCount!: number;
  @ApiProperty({ example: 340 })
  viewCount!: number;
  @ApiProperty({
    nullable: true,
    description: '来源作品 id（作品删除时本帖级联撤回）',
    example: 'ckwork123',
  })
  workId!: string | null;
  @ApiProperty({ description: '当前登录用户是否已赞', example: false })
  liked!: boolean;
  @ApiProperty({
    enum: AUDIT_STATUS,
    description: 'feed 仅返回 approved',
    example: 'approved',
  })
  auditStatus!: string;
  createdAt!: string;
}

export class PlazaFeedResultDto {
  items!: PlazaPostDto[];
  @ApiProperty({ description: '总条数', example: 128 })
  total!: number;
  @ApiProperty({ description: '当前页码', example: 1 })
  page!: number;
  @ApiProperty({ description: '每页条数', example: 20 })
  size!: number;
}

export class LikeResultDto {
  likeCount!: number;
  /** 本次操作后当前用户的点赞态（true=已赞） */
  liked!: boolean;
}

export class ViewResultDto {
  @ApiProperty({
    description: '本次上报是否计入了浏览（当日首次）',
    example: true,
  })
  counted!: boolean;
  @ApiProperty({ example: 341 })
  viewCount!: number;
}

export class MyWorkItemDto {
  id!: string;
  userId!: string;
  title!: string;
  theme!: string;
  vaseId!: string;
  @ApiProperty({ type: Object, additionalProperties: true })
  arrangement!: Record<string, any>;
  @ApiProperty({ nullable: true, description: '创作台预览图' })
  thumbnailUrl!: string | null;
  @ApiProperty({
    nullable: true,
    description: '列表封面：该作品最新 AI 图 ?? 创作台预览图',
  })
  coverUrl!: string | null;
  @ApiProperty({
    example: 3,
    description: '花材数量（arrangement.items 长度）',
  })
  materialCount!: number;
  @ApiProperty({
    description: '是否已发布到广场（删除时需提示将同步撤回）',
    example: false,
  })
  published!: boolean;
  dateKey!: string;
  createdAt!: string;
  updatedAt!: string;
}

export class MyPostItemDto {
  id!: string;
  userId!: string;
  authorName!: string;
  title!: string;
  theme!: string;
  @ApiProperty({ type: Object, additionalProperties: true })
  arrangement!: Record<string, any>;
  @ApiProperty({ nullable: true, description: '发布时快照图' })
  thumbnailUrl!: string | null;
  @ApiProperty({
    nullable: true,
    description: '列表封面：关联作品最新 AI 图 ?? 发布快照图',
  })
  coverUrl!: string | null;
  materialCount!: number;
  likeCount!: number;
  viewCount!: number;
  @ApiProperty({ nullable: true })
  workId!: string | null;
  auditStatus!: string;
  createdAt!: string;
}

export class MyLikeItemDto {
  @ApiProperty({ description: '帖子 id', example: 'ckpost123' })
  id!: string;
  userId!: string;
  authorName!: string;
  title!: string;
  theme!: string;
  @ApiProperty({ type: Object, additionalProperties: true })
  arrangement!: Record<string, any>;
  @ApiProperty({ nullable: true })
  thumbnailUrl!: string | null;
  @ApiProperty({
    nullable: true,
    description: '列表封面：关联作品最新 AI 图 ?? 发布快照图',
  })
  coverUrl!: string | null;
  materialCount!: number;
  likeCount!: number;
  viewCount!: number;
  @ApiProperty({ nullable: true })
  workId!: string | null;
  @ApiProperty({ description: '恒为 true（该列表即点赞列表）', example: true })
  liked!: boolean;
  @ApiProperty({ description: '点赞时间' })
  likedAt!: string;
  createdAt!: string;
}

export class MyWorksResultDto {
  items!: MyWorkItemDto[];
  total!: number;
  page!: number;
  size!: number;
}

export class MyPostsResultDto {
  items!: MyPostItemDto[];
  total!: number;
  page!: number;
  size!: number;
}

export class MyLikesResultDto {
  items!: MyLikeItemDto[];
  total!: number;
  page!: number;
  size!: number;
}

export class WorkImageItemDto {
  @ApiProperty({
    enum: ['ai', 'preview'],
    description: 'ai=AI 生成图；preview=创作台预览图（垫底）',
  })
  type!: 'ai' | 'preview';
  @ApiProperty({ required: false, description: 'AI 任务 id（type=ai 时有）' })
  taskId?: string;
  url!: string;
  createdAt!: string;
}

export class WorkImagesDto {
  @ApiProperty({
    type: [WorkImageItemDto],
    description:
      '下载弹窗图片列表：AI 图新→旧在前，预览图垫底；无 AI 图时仅预览图',
  })
  images!: WorkImageItemDto[];
}

export class CustomMaterialDto {
  id!: string;
  userId!: string;
  @ApiProperty({ example: '阳台茉莉' })
  name!: string;
  @ApiProperty({
    enum: ['flower', 'greenery', 'line', 'vase'],
    example: 'flower',
  })
  category!: string;
  @ApiProperty({ example: 'mat-rose' })
  baseMaterialId!: string;
  @ApiProperty({ nullable: true, example: 'rose' })
  baseKind!: string | null;
  @ApiProperty({ description: '抠图成品透明底 OSS URL' })
  imageUrl!: string;
  @ApiProperty({ nullable: true, description: '上传原图 OSS URL' })
  sourceImageUrl!: string | null;
  createdAt!: string;
}

export class MaterialStyleDto {
  @ApiProperty({ description: '样式预设 id', example: 'rose-full-mid' })
  styleOption!: string;
  @ApiProperty({ example: '玫瑰盛放' })
  name!: string;
  @ApiProperty({ description: '该姿态的 OSS 透明底 PNG（已烘入长度）' })
  imageUrl!: string;
}

export class BuiltinMaterialDto {
  @ApiProperty({ example: 'mat-rose' })
  id!: string;
  @ApiProperty({ example: '玫瑰' })
  name!: string;
  @ApiProperty({
    enum: ['flower', 'greenery', 'line', 'vase'],
    example: 'flower',
  })
  category!: string;
  @ApiProperty({
    nullable: true,
    description: '缩略图/单样式素材的 OSS 透明底 PNG',
  })
  imageUrl!: string | null;
  @ApiProperty({
    type: [MaterialStyleDto],
    nullable: true,
    description: '多样式素材（花/枝/线）的 6 款姿态；花器等单样式素材为 null',
  })
  styles!: MaterialStyleDto[] | null;
}

export class MaterialCategoryDto {
  id!: string;
  label!: string;
}

export class MaterialsCatalogDto {
  categories!: MaterialCategoryDto[];
  materials!: BuiltinMaterialDto[];
}

export class AiSubmitDto {
  taskId!: string;
  status!: string;
  progress!: number;
  @ApiProperty({
    required: false,
    description: '今日剩余生成额度（含在途占用；仅 image2）',
    example: 4,
  })
  remaining?: number;
}

export class AiImage2StatusDto {
  status!: string;
  progress!: number;
  imageUrl?: string;
  error?: string;
  @ApiProperty({
    required: false,
    description: '今日剩余生成额度；「生成成功，今日还剩 X 次」取此值',
    example: 4,
  })
  remaining?: number;
}

export class AiCutoutStatusDto {
  status!: string;
  progress!: number;
  /** 成品透明底图 URL。与 image2 统一用此字段（Web 端推荐读这个） */
  imageUrl?: string;
  /** @deprecated 旧字段，保留兼容小程序；新接入请用 imageUrl */
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

export class ThemeDto {
  id!: string;
  label!: string;
  note!: string;
  bg!: string;
  panel!: string;
  panel2!: string;
  text!: string;
  muted!: string;
  line!: string;
  accent!: string;
  accent2!: string;
  danger!: string;
  canvas!: string;
  paper!: string;
  shadow!: string;
  vase!: string[];
  previewFlower!: string[];
}

export class AvatarOptionDto {
  id!: string;
  label!: string;
  colors!: string[];
}

export class BootstrapConfigDto {
  themes!: ThemeDto[];
  avatars!: AvatarOptionDto[];
}
