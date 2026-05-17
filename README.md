# MixIQ - AI 原生智能体开发运维中台

<p align="center">
  <strong>AI-native Agent Development & Operations Platform with MCP Protocol</strong>
</p>

<p align="center">
  通过 MCP 协议统一封装项目管理、代码仓库、分支管理、环境部署、任务编排等能力，让 AI Agent 能够理解并执行完整的开发运维全流程。
</p>

---

## 🌟 项目简介

**MixIQ** 是一个 AI 原生的智能体开发运维中台，通过 MCP（Model Context Protocol）协议将开发运维全链路能力统一封装，使用户可通过与 Claude Code 对话完成项目初始化、代码提交、PR 管理、部署发布、环境管理等全链路开发运维操作。

## ✨ 核心特性

### 📋 项目管理
- 项目初始化与工作空间管理
- Git 仓库关联与配置
- 项目切换与上下文管理

### 🌿 Git 与分支管理
- 分支创建、切换、删除
- 代码提交与推送
- Pull Request 创建与审查
- Git 状态查询与历史记录

### 🚀 环境管理与部署
- 多环境配置管理
- 一键部署与回滚
- 远程服务器日志获取
- 环境健康检查
- SSH 命令远程执行

### 🤖 智能体管理
- Agent 实例生命周期管理
- 工具绑定与权限控制
- 上下文数据存储与传递
- 对话历史记录
- 操作审计日志

### 🎯 任务编排与工作流
- 可视化工作流定义
- 8 种步骤类型支持
- 内置 6 个常用工作流模板
- 条件分支、并行执行、循环重试
- 工作流执行状态追踪

### 🔧 基础设施
- 结构化日志系统（Winston）
- 参数校验（Zod）
- 安全命令过滤
- SSH 连接池管理
- SQLite 数据库存储

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| **语言** | TypeScript (严格模式) |
| **运行时** | Node.js 18+ |
| **数据库** | SQLite (开发) / PostgreSQL (生产预留) |
| **SSH** | node-ssh |
| **数据库驱动** | better-sqlite3 |
| **参数校验** | Zod |
| **日志** | Winston |
| **测试** | Jest |
| **协议** | MCP (Model Context Protocol) |

## 📦 安装部署

### 前置要求

- Node.js 18.x 或更高版本
- npm 9.x 或更高版本
- Git 2.30+

### 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/5shunchen/mixiq.git
cd mixiq

# 2. 安装依赖
npm install

# 3. 构建项目
npm run build

# 4. 运行测试（可选，验证安装）
npm test

# 5. 启动 MCP 服务器
npm start
```

### 开发模式

```bash
# 使用 ts-node 直接运行（支持热重载）
npm run dev
```

### 环境变量配置

在项目根目录创建 `.env` 文件：

```bash
# MixIQ 数据目录（默认 ~/.mixiq）
MIXIQ_HOME=~/.mixiq

# 数据库文件路径（默认 ~/.mixiq/mixiq.db）
MIXIQ_DB_PATH=~/.mixiq/mixiq.db

# 数据库类型（sqlite 或 postgres）
MIXIQ_DB_TYPE=sqlite

# SSH 密钥目录（默认 ~/.ssh）
MIXIQ_SSH_KEY_DIR=~/.ssh

# SSH 连接超时（秒，默认 30）
MIXIQ_SSH_TIMEOUT=30

# SSH 最大连接数（默认 10）
MIXIQ_MAX_SSH_CONNECTIONS=10

# 日志级别（debug, info, warn, error）
MIXIQ_LOG_LEVEL=info

# 默认 Git 远程名称（默认 origin）
MIXIQ_GIT_DEFAULT_REMOTE=origin

# 额外危险命令黑名单（逗号分隔）
MIXIQ_COMMAND_BLACKLIST=
```

## 🎮 使用方式

### 作为 Claude Code MCP 服务器

在 Claude Code 的配置文件中添加：

```json
{
  "mcpServers": {
    "mixiq": {
      "command": "node",
      "args": ["/path/to/mixiq/dist/server.js"]
    }
  }
}
```

配置完成后，重启 Claude Code 即可使用 MixIQ 的所有 MCP 工具。

### 常用命令示例

**项目管理：**
```typescript
// 初始化项目
await toolCall("project_init", { name: "my-project" });

// 切换项目
await toolCall("project_switch", { project_id: "uuid" });

// 获取项目信息
await toolCall("project_info");
```

**Git 操作：**
```typescript
// 创建分支
await toolCall("git_branch_create", {
  name: "feat/new-feature",
  from_branch: "main"
});

// 提交并推送
await toolCall("git_commit_and_push", {
  message: "feat: add new feature"
});
```

**部署操作：**
```typescript
// 部署到生产环境
await toolCall("env_deploy", {
  env_name: "production",
  branch: "main"
});

// 回滚部署
await toolCall("env_rollback", {
  env_name: "production"
});
```

**工作流编排：**
```typescript
// 运行完整 CI/CD 流程
await toolCall("workflow_run", {
  name: "full-cicd",
  params: {
    env: "production",
    branch: "main"
  }
});
```

## 📚 MCP 工具列表

### 项目管理（3 个）

| 工具 | 功能 | 参数 |
|------|------|------|
| `project_init` | 初始化项目 | name, template?, git_url? |
| `project_switch` | 切换项目 | project_id |
| `project_info` | 获取项目信息 | - |

### 远程执行（2 个）

| 工具 | 功能 | 参数 |
|------|------|------|
| `execute_remote` | 远程执行命令 | server, command, work_dir? |
| `sync_code` | 文件同步 | server, local_path, remote_path, direction |

### Git 管理（9 个）

| 工具 | 功能 | 参数 |
|------|------|------|
| `git_init` | 初始化 Git 仓库 | workspace_path, git_url? |
| `git_clone` | 克隆仓库 | git_url, target_path |
| `git_status` | 获取状态 | workspace_path |
| `git_branch_create` | 创建分支 | workspace_path, name, from_branch? |
| `git_branch_list` | 列出分支 | workspace_path |
| `git_checkout` | 切换分支 | workspace_path, branch_name |
| `git_commit_and_push` | 提交推送 | workspace_path, message, files?, remote?, branch? |
| `git_create_pr` | 创建 PR | workspace_path, title, body?, base_branch, head_branch |
| `git_review_pr` | 审查 PR | workspace_path, pr_id |

### 环境管理（8 个）

| 工具 | 功能 | 参数 |
|------|------|------|
| `env_list` | 列出环境 | project_id? |
| `env_create` | 创建环境 | name, servers, config?, project_id? |
| `env_info` | 获取环境详情 | env_name, project_id? |
| `env_deploy` | 部署环境 | env_name, branch, project_id?, force? |
| `env_rollback` | 回滚部署 | env_name, deployment_id?, project_id? |
| `env_deployment_history` | 部署历史 | env_name, project_id?, limit? |
| `env_get_logs` | 获取日志 | env_name, service?, lines?, filter?, project_id? |
| `env_health_check` | 健康检查 | env_name, project_id? |

### 智能体管理（9 个）

| 工具 | 功能 | 参数 |
|------|------|------|
| `agent_create` | 创建智能体 | agent_type, project_id, allowed_tools?, config? |
| `agent_list` | 列出智能体 | project_id |
| `agent_info` | 获取详情 | agent_id |
| `agent_switch` | 切换智能体 | agent_id |
| `agent_delete` | 删除智能体 | agent_id |
| `agent_set_context` | 设置上下文 | agent_id, key, value |
| `agent_get_context` | 获取上下文 | agent_id, key? |
| `agent_get_tools` | 获取可用工具 | agent_id |
| `agent_get_history` | 获取历史 | agent_id, limit? |

### 任务编排（8 个）

| 工具 | 功能 | 参数 |
|------|------|------|
| `workflow_list` | 列出工作流 | - |
| `workflow_create` | 创建工作流 | name, definition, description? |
| `workflow_get` | 获取定义 | workflow_id?, name? |
| `workflow_delete` | 删除工作流 | workflow_id |
| `workflow_run` | 执行工作流 | workflow_id?, name?, params?, project_id? |
| `workflow_run_status` | 执行状态 | run_id |
| `workflow_run_cancel` | 取消执行 | run_id |
| `workflow_run_list` | 执行历史 | project_id?, limit? |

**总计：37 个 MCP 工具**

## 🎬 内置工作流模板

| 模板 | 功能 |
|------|------|
| `project-init` | 项目初始化标准流程 |
| `feature-branch` | 特性分支开发流程 |
| `code-review` | 代码审查自动化流程 |
| `deploy-env` | 环境部署流程 |
| `rollback-env` | 环境回滚流程 |
| `full-cicd` | 完整 CI/CD 流水线 |

## 🔨 开发指南

### 项目结构

```
mixiq/
├── src/
│   ├── server.ts                      # MCP 服务器入口
│   ├── types/
│   │   └── index.ts                   # 全局类型定义
│   ├── utils/
│   │   ├── logger.ts                  # 日志工具
│   │   ├── validator.ts               # 参数校验
│   │   └── security.ts                # 安全工具
│   ├── db/
│   │   └── database.ts                # 数据库操作
│   ├── ssh/
│   │   ├── ssh-connection.ts          # SSH 连接池
│   │   └── ssh-executor.ts            # SSH 命令执行器
│   ├── managers/
│   │   ├── project-manager.ts         # 项目管理器
│   │   ├── git-manager.ts             # Git 管理器
│   │   ├── env-manager.ts             # 环境管理器
│   │   ├── agent-manager.ts           # 智能体管理器
│   │   └── orchestrator.ts            # 任务编排引擎
│   ├── tools/
│   │   ├── project-tools.ts           # 项目管理工具
│   │   ├── execute-tools.ts           # 远程执行工具
│   │   ├── git-tools.ts               # Git 管理工具
│   │   ├── env-tools.ts               # 环境管理工具
│   │   ├── agent-tools.ts             # 智能体管理工具
│   │   └── orchestrator-tools.ts      # 任务编排工具
│   └── gateway/
│       ├── tool-registry.ts           # 工具注册表
│       └── mcp-gateway.ts             # MCP 协议网关
├── tests/
│   ├── unit/                          # 单元测试
│   └── integration/                   # 集成测试
├── dist/                              # 编译输出
├── package.json
├── tsconfig.json
└── plan.md                            # 开发规划
```

### 编译构建

```bash
# 构建 TypeScript
npm run build

# 清理并重新构建
rm -rf dist && npm run build
```

### 运行测试

```bash
# 运行所有测试
npm test

# 只运行单元测试
npm run test:unit

# 运行测试并查看覆盖率
npm run test:coverage

# 运行特定测试文件
npm test -- tests/unit/orchestrator.test.ts
```

### 代码规范

项目采用 TypeScript 严格模式开发，遵循以下规范：

- 禁止使用 `any` 类型（特殊情况使用 `unknown` + 显式断言）
- 所有异步操作必须使用 try-catch 处理错误
- 错误消息使用简体中文
- 所有工具函数必须返回结构化 `ToolResult<T>`
- Git 提交遵循 Conventional Commits 规范

## 🧪 测试

测试覆盖范围：

| 模块 | 测试数量 | 覆盖率 |
|------|---------|--------|
| 项目管理 | 41 | 94.46% |
| Git 管理 | 54 | 94.46% |
| 环境管理 | 56 | 90.84% |
| 智能体管理 | 41+86 | 95%+ |
| 任务编排 | 93+78 | 95.4% |
| **总计** | **857** | **核心模块 > 90%** |

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feat/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feat/amazing-feature`)
5. 开启 Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🔗 相关链接

- **GitHub**: https://github.com/5shunchen/mixiq
- **Releases**: https://github.com/5shunchen/mixiq/releases
- **Issues**: https://github.com/5shunchen/mixiq/issues

## 📋 版本路线图

- ✅ **v0.1.0** - 基础远程执行 + 简单项目管理
- ✅ **v0.2.0** - Git 与分支管理
- ✅ **v0.3.0** - 环境管理与部署
- ✅ **v0.4.0** - 智能体管理
- ✅ **v1.0.0** - 任务编排与模板（当前版本）

---

<p align="center">
  Made with ❤️ by MixIQ Team
</p>
