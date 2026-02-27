# NATS Client

一个现代化、功能丰富的 NATS 桌面客户端，基于 Electron + React + TypeScript 构建。

## ✨ 功能特性

### 核心功能
- **连接管理** - 支持多连接配置、自动重连、状态监控、本地持久化存储
- **消息发布 (Publish)** - 支持单次发送和定时发送，多任务并行，可编辑任务参数
- **消息订阅 (Subscribe)** - 支持通配符订阅、消息过滤、自动滚动、消息详情查看
- **请求/回复 (Request/Reply)** - 发送请求并接收响应，支持启动回复服务自动响应

### JetStream 支持
- Stream 列表查看
- Consumer 列表查看
- 消息拉取
- ACK/NACK 操作

### 界面特性
- 🎨 现代化深色主题设计
- 📊 实时统计信息显示
- 🔍 消息搜索过滤
- 📋 一键复制消息内容
- 🖥️ 自定义标题栏（最小化、最大化、关闭）

## 📦 技术栈

- **框架**: Electron + electron-vite
- **前端**: React 18 + TypeScript
- **UI 组件**: Ant Design 5.x
- **状态管理**: Zustand
- **NATS 客户端**: nats.js
- **构建工具**: Vite

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 8 (推荐) 或 npm

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

### 构建应用

```bash
# 构建所有平台
pnpm build

# 构建 Windows 版本
pnpm build:win

# 构建 macOS 版本
pnpm build:mac

# 构建 Linux 版本
pnpm build:linux
```

## 📖 使用指南

### 1. 创建连接

1. 点击左侧"连接管理"区域的"新建"按钮
2. 填写连接信息：
   - 名称：连接名称
   - 服务器地址：NATS 服务器地址
   - 端口：服务器端口（默认 4222）
   - 认证方式：用户名/密码 或 Token
3. 点击"连接"按钮建立连接

### 2. 发布消息

1. 切换到"发布"标签页
2. 输入 Subject 和消息内容
3. 可选：添加 Headers（JSON 格式）
4. 开启"定时发送"可设置发送间隔和次数
5. 点击"发送"或"添加任务"

### 3. 订阅消息

1. 切换到"订阅"标签页
2. 输入要订阅的 Subject（支持通配符 `*` 和 `>`）
3. 点击"订阅"按钮
4. 从下拉列表选择订阅查看消息
5. 支持暂停接收、清空消息、取消订阅

### 4. 请求/回复

**发送请求：**
1. 切换到"请求"标签页
2. 输入 Subject 和请求内容
3. 点击"发送请求"
4. 查看响应结果

**启动回复服务：**
1. 切换到"回复服务"标签
2. 输入要监听的 Subject 和响应内容
3. 点击"启动回复服务"
4. 当收到请求时自动回复预设内容

### 5. JetStream 管理

1. 切换到"JetStream"标签页
2. 查看 Stream 列表
3. 点击 Stream 名称查看 Consumer 列表
4. 可拉取消息并进行 ACK/NACK 操作

## 📁 项目结构

```
NatsClient/
├── electron/                 # Electron 主进程
│   ├── ipc/                  # IPC 通信处理
│   ├── nats/                 # NATS 服务封装
│   ├── store/                # 本地存储服务
│   ├── main.ts               # 主进程入口
│   └── preload.ts            # 预加载脚本
├── src/                      # 渲染进程
│   ├── components/           # React 组件
│   ├── stores/               # Zustand 状态管理
│   ├── types/                # TypeScript 类型定义
│   └── utils/                # 工具函数
├── package.json
└── vite.config.ts
```

## ⚙️ 配置说明

### 连接配置

| 字段 | 说明 | 默认值 |
|------|------|--------|
| servers | 服务器地址 | localhost |
| port | 服务器端口 | 4222 |
| username | 用户名 | - |
| password | 密码 | - |
| token | 认证 Token | - |
| tls | 是否启用 TLS | false |
| autoReconnect | 是否自动重连 | true |
| maxReconnectAttempts | 最大重连次数 | -1 (无限) |

## 🔒 安全说明

- 连接配置存储在本地用户数据目录
- 密码和 Token 以明文存储，请勿在不可信环境使用
- 建议在生产环境使用 TLS 加密连接

## 📝 版本历史

### v1.0.0 (2025-02-27)

**新增功能：**
- 连接管理：多连接配置、自动重连、状态监控
- 消息发布：单次/定时发送、多任务并行、任务编辑
- 消息订阅：通配符支持、消息过滤、自动滚动、详情查看
- 请求/回复：发送请求、回复服务
- JetStream：Stream/Consumer 查看、消息拉取、ACK/NACK
- 界面：深色主题、自定义标题栏

## 📄 开源协议

MIT License

## 🙏 致谢

- [NATS](https://nats.io/) - 高性能消息系统
- [nats.js](https://github.com/nats-io/nats.js) - NATS JavaScript 客户端
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [Ant Design](https://ant.design/) - React UI 组件库
