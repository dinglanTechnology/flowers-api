import { createHash } from 'crypto';

/** 主题配色（从原型 docs/index.html 的 themes 提取，前端换肤用） */
export interface ThemeConfig {
  id: string;
  label: string;
  note: string;
  bg: string;
  panel: string;
  panel2: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  accent2: string;
  danger: string;
  canvas: string;
  paper: string;
  shadow: string;
  vase: string[];
  previewFlower: string[];
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'night',
    label: '夜间创作台',
    note: '暗色画布、奶油色高亮，适合专注编辑。',
    bg: '#0d0c0b',
    panel: '#151515',
    panel2: '#202020',
    text: '#f8f1dd',
    muted: '#968f7b',
    line: '#303030',
    accent: '#f4e8b8',
    accent2: '#94b887',
    danger: '#e87777',
    canvas: '#0d0c0b',
    paper: '#f6efe3',
    shadow: 'rgba(0, 0, 0, 0.42)',
    vase: ['#25302e', '#5d6a61', '#0f1513'],
    previewFlower: ['#dc7f82', '#f0c05a', '#b86582'],
  },
  {
    id: 'light',
    label: '东方浅色',
    note: '纸感背景、陶土和叶色，更像花艺手札。',
    bg: '#f9f3e7',
    panel: '#fffaf1',
    panel2: '#efe4d3',
    text: '#2b241c',
    muted: '#8a7863',
    line: '#dfd0ba',
    accent: '#7f4f38',
    accent2: '#557a5b',
    danger: '#b9504d',
    canvas: '#f9f3e7',
    paper: '#fff7eb',
    shadow: 'rgba(78, 58, 39, 0.22)',
    vase: ['#d4b893', '#8f694d', '#f2e3cc'],
    previewFlower: ['#c66b6f', '#e8b05f', '#9c6f8e'],
  },
  {
    id: 'morning',
    label: '晨雾花房',
    note: '浅绿灰和雾白背景，适合自然清新的花束。',
    bg: '#eef3ed',
    panel: '#fbfdf8',
    panel2: '#dfe9de',
    text: '#21302a',
    muted: '#6f8176',
    line: '#c9d8cf',
    accent: '#4c7d66',
    accent2: '#d8a45f',
    danger: '#b86161',
    canvas: '#f4f7f1',
    paper: '#fbf8ed',
    shadow: 'rgba(55, 87, 72, 0.18)',
    vase: ['#cdd8cd', '#789286', '#f4f8ef'],
    previewFlower: ['#e28c93', '#efd47c', '#8eb182'],
  },
  {
    id: 'rouge',
    label: '胭脂茶室',
    note: '暖红棕、茶色和米金，适合东方复古氛围。',
    bg: '#251714',
    panel: '#33201b',
    panel2: '#442b24',
    text: '#fff0dc',
    muted: '#b99b82',
    line: '#5a3b31',
    accent: '#efc179',
    accent2: '#ca6d69',
    danger: '#f28c7a',
    canvas: '#2b1b17',
    paper: '#f5dfc1',
    shadow: 'rgba(0, 0, 0, 0.38)',
    vase: ['#8c4e3b', '#c78562', '#3b211c'],
    previewFlower: ['#d96878', '#edb76b', '#b14f59'],
  },
  {
    id: 'gallery',
    label: '蓝调展厅',
    note: '冷灰蓝和银色线条，更适合现代陈列感。',
    bg: '#111923',
    panel: '#172230',
    panel2: '#223143',
    text: '#edf5fb',
    muted: '#91a3b4',
    line: '#33475d',
    accent: '#9fd0e3',
    accent2: '#d6bd79',
    danger: '#e58a8a',
    canvas: '#101a25',
    paper: '#e9f0f3',
    shadow: 'rgba(0, 0, 0, 0.44)',
    vase: ['#465d70', '#9bb2c1', '#172636'],
    previewFlower: ['#8fbde8', '#d6bd79', '#b487c8'],
  },
  {
    id: 'onyx',
    label: '黑金橱窗',
    note: '黑色高对比和金属高光，突出成品展示。',
    bg: '#070707',
    panel: '#11100e',
    panel2: '#1f1d18',
    text: '#f7f0df',
    muted: '#9f927a',
    line: '#39342a',
    accent: '#d9b86f',
    accent2: '#7fb0a3',
    danger: '#d86d64',
    canvas: '#090807',
    paper: '#f7edda',
    shadow: 'rgba(0, 0, 0, 0.55)',
    vase: ['#1b1b1b', '#c1a15a', '#050505'],
    previewFlower: ['#d8535f', '#d9b86f', '#89bfb2'],
  },
];

/** 头像预设（从原型 avatarOptions 提取）。id 与 User.avatarId 对齐。 */
export interface AvatarOption {
  id: string;
  label: string;
  colors: string[];
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'lotus', label: '荷', colors: ['#e9a0b5', '#78945e'] },
  { id: 'orchid', label: '兰', colors: ['#c58fb1', '#6e8c64'] },
  { id: 'sun', label: '日', colors: ['#f2b23c', '#7b603a'] },
  { id: 'leaf', label: '叶', colors: ['#4d8760', '#2e5d43'] },
  { id: 'rose', label: '玫', colors: ['#c83f5a', '#7a253a'] },
  { id: 'moon', label: '月', colors: ['#7f8fb8', '#3f5260'] },
  { id: 'tea', label: '茶', colors: ['#b8864b', '#6e4335'] },
  { id: 'ink', label: '墨', colors: ['#29322f', '#111615'] },
];

/** 配置版本 = 内容哈希，数据变则变（客户端据此决定是否重拉） */
export const BOOTSTRAP_VERSION = createHash('sha256')
  .update(JSON.stringify({ t: THEMES, a: AVATAR_OPTIONS }))
  .digest('hex')
  .slice(0, 12);
