# Music Hub

AI 音乐创作桌面应用，集成 APIMart 提供的 Suno 和 Flow Music 音乐生成模型。

## 功能

- **音乐生成** - 灵感模式（描述音乐风格/情绪）和自定义模式（提供歌词/曲风）
- **翻唱** - 将已有歌曲翻唱为新的风格版本
- **续写** - 从任意位置延长歌曲
- **音轨分离** - 分离人声和伴奏音轨
- **MV 生成** - 为歌曲生成音乐视频
- **音频播放器** - 底部永久播放栏，支持播放控制、进度条、音量调节
- **曲库管理** - 搜索、筛选、删除生成的音乐
- **多模型支持** - 供应商抽象层，便于扩展新模型

## 技术栈

| 技术 | 用途 |
|------|------|
| Electron | 桌面框架 |
| React + Vite + TypeScript | 渲染进程 UI |
| Zustand | 状态管理 |
| SQLite + Prisma | 本地数据库 |
| Tailwind CSS | 暗色主题样式 |
| lucide-react | 图标库 |

## 快速开始

### 前置要求

- Node.js >= 18
- npm >= 9

### 安装

```bash
# 安装依赖
npm install

# 复制环境变量
cp .env.example .env
# 编辑 .env 填入你的 APIMart API Key
```

### 开发

```bash
# 启动开发模式（Vite + Electron）
npm run dev
```

### 构建

```bash
npm run build
```

## 项目结构

```
src/
├── main/              # Electron 主进程
│   ├── index.ts       # 入口：创建窗口、注册 IPC
│   ├── ipc/           # IPC 处理器
│   ├── providers/     # 供应商抽象层 (Suno, Flow Music)
│   ├── services/      # 业务逻辑 (TaskManager, MusicService, LibraryService)
│   └── lib/           # 工具 (api-client, prisma)
├── preload/           # contextBridge API 暴露
├── renderer/          # React 渲染进程
│   ├── pages/         # 页面 (Dashboard, Generate, Library, TrackDetail)
│   ├── components/    # 组件 (layout, ui, 业务组件)
│   ├── stores/        # Zustand 状态 (player, generation)
│   └── lib/           # 工具函数
└── shared/            # 共享类型定义
```

## 供应商支持

当前支持 APIMart 提供的两个音乐模型：

- **Suno** - 通用音乐生成，支持完整的 20+ 端点（生成、翻唱、续写、音轨分离、MV、Remaster、Mashup 等）
- **Flow Music** - 流式音乐生成，支持 10 个端点（生成、歌词生成、续写、翻唱、音轨分离、视频剪辑等）

### 扩展新供应商

实现 `MusicProvider` 接口并通过 `ProviderFactory.registerProvider()` 注册：

```typescript
import { ProviderFactory } from './providers/ProviderFactory';
import { MyCustomProvider } from './providers/MyCustomProvider';

ProviderFactory.registerProvider('my-model', MyCustomProvider);
```

## 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `APIMART_API_KEY` | APIMart API 密钥 | - |
| `APIMART_BASE_URL` | APIMart API 基础地址 | https://api.apimart.ai |
| `DATABASE_URL` | SQLite 数据库路径 | file:./dev.db |