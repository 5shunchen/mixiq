# MixIQ 平台开发指令

> **受众**：简体中文用户群体  
> **角色**：本文件作为 Claude Code 的执行指令，**禁止 AI 修改本文件**

---

## 一、项目概述

**MixIQ** 是一个 AI 原生的智能体开发运维中台，通过 MCP 协议将以下能力统一封装，使用户可通过与 Claude Code 对话完成全链路开发运维操作：

| 能力域 | 核心功能 |
|--------|----------|
| 智能体管理 | 实例生命周期、技能绑定、上下文管理、审计 |
| 代码仓库管理 | 仓库关联、提交推送、PR 创建与审查 |
| 分支管理 | 分支创建、合并、冲突处理 |
| 项目管理 | 项目初始化、切换、工作空间管理 |
| 环境管理 | 部署、回滚、健康检查、日志查询 |
| 任务编排 | 工作流解析、条件判断、并行调度 |

---

## 二、全局约束（高优先级，不可违背）

```
⛔ 禁止将 .env / SSH私钥 / API Key / 数据库密码等敏感文件提交到 Git 仓库，必须加入 .gitignore
⛔ 禁止 force push 到 main/master 分支
⛔ 禁止对远程服务器安装任何 AI 相关组件（除非用户明确配置了 MixIQ-Agent）
⛔ 禁止在日志中出现密码、密钥、Token 等敏感信息
⛔ 禁止使用 any 类型（特殊情况使用 unknown + 显式类型断言）
⛔ 禁止直接执行 shell 命令进行 Git 操作（必须使用 simple-git 库封装）
⛔ 禁止硬编码 SSH 私钥路径（必须通过环境变量或配置文件指定）

✅ 授权 Claude Code 自动执行命令和计划，无需批准确认
✅ 必须在 main 分支开发新版本
✅ 所有代码使用 TypeScript 编写，运行在 Node.js 18+ 环境
✅ MCP 服务器实现必须遵循 MCP 协议规范（基于 JSON-RPC 2.0）
✅ 远程服务器操作基于 SSH 协议
✅ 元数据库：开发阶段使用 SQLite，生产阶段支持切换为 PostgreSQL
✅ gh 命令必须在代码仓目录下执行
✅ 目录章节分不同的 Markdown 文件存放，文档统一放在 docs/ 目录下
```

---

## 三、项目目录结构

```
mixiq/
├── src/
│   ├── server.ts                      # MCP 服务器主入口
│   ├── gateway/
│   │   ├── mcp-gateway.ts             # MCP 工具注册与路由网关
│   │   └── tool-registry.ts           # 工具注册表
│   ├── managers/
│   │   ├── project-manager.ts         # 项目管理器
│   │   ├── agent-manager.ts           # 智能体管理器
│   │   ├── git-manager.ts             # 代码仓库与分支管理器
│   │   ├── env-manager.ts             # 部署与环境管理器
│   │   └── orchestrator.ts            # 任务编排引擎
│   ├── tools/
│   │   ├── project-tools.ts           # 项目管理 MCP 工具定义
│   │   ├── agent-tools.ts             # 智能体管理 MCP 工具定义
│   │   ├── git-tools.ts               # Git 操作 MCP 工具定义
│   │   ├── env-tools.ts               # 环境管理 MCP 工具定义
│   │   ├── execute-tools.ts           # 远程执行 MCP 工具定义
│   │   └── orchestrator-tools.ts      # 任务编排 MCP 工具定义
│   ├── ssh/
│   │   ├── ssh-connection.ts          # SSH 连接池管理
│   │   └── ssh-executor.ts            # SSH 命令执行器
│   ├── db/
│   │   ├── database.ts                # 数据库初始化与连接
│   │   ├── migrations/                # 数据库迁移文件
│   │   └── models/                    # 数据模型定义
│   ├── types/
│   │   └── index.ts                   # 全局 TypeScript 类型定义
│   └── utils/
│       ├── logger.ts                  # 日志工具
│       ├── validator.ts               # 参数校验工具
│       └── security.ts               # 安全工具（命令过滤、脱敏等）
├── docs/
│   ├── architecture.md                # 架构设计文档
│   ├── api-reference.md               # MCP 工具 API 参考
│   ├── database-schema.md             # 数据库表结构文档
│   ├── deployment-guide.md            # 部署指南
│   └── module-*.md                    # 各模块详细设计文档
├── templates/
│   ├── projects/                      # 项目模板
│   └── workflows/                     # 工作流模板（YAML）
├── tests/
│   ├── unit/                          # 单元测试
│   └── integration/                   # 集成测试
├── plan.md                            # 任务规划文件
├── package.json
├── tsconfig.json
├── .gitignore
├── .env.example                       # 环境变量示例（不含真实值）
└── README.md
```

---

## 四、开发执行流程

每次任务执行遵循以下完整闭环流程，**步骤不可跳过**：

```
规划（Planning） → 开发（Development） → 审查（Review） → 发布（Release） → 文档（Docs） → 闭环（Closure）
```

---

### 4.1 规划阶段（Planning）

#### 4.1.1 确定新版本需求范围

按以下优先级顺序判断，**命中第一条即停止判断**：

| 优先级 | 条件 | 行动 |
|--------|------|------|
| P0 | plan.md 中所有任务已全部完成 | **立即结束任务，输出总结报告** |
| P1 | 存在未关闭的 GitHub Issues（`gh issue list --state open --limit 5 --search "sort:created-desc"`） | 规划 **PATCH 版本**修复问题 |
| P2 | plan.md 中存在未实现的核心模块 | 规划 **MINOR 版本**开发下一个模块 |
| P3 | 其他情况 | 规划 **MINOR 版本**开发 plan.md 中未完成的功能 |

> **核心模块缺失优先原则**：项目管理器、智能体管理器、Git 管理器、环境管理器、任务编排引擎中任一**完全未开始**，优先规划该模块的基础实现。

**版本路线示例**：
```
0.1.0(基础远程执行) → 0.2.0(Git管理) → 0.2.1(修复issue) → 0.3.0(环境管理)
→ 0.3.1(修复issue) → 0.4.0(智能体管理) → 0.4.1(修复issue) → 1.0.0(任务编排完成)
```

#### 4.1.2 更新 plan.md

**plan.md 标准格式**：

```markdown
# MixIQ 开发规划

## 版本路线图
- v0.1.0: 基础远程执行 + 简单项目管理
- v0.2.0: Git 与分支管理
- v0.3.0: 环境管理与部署
- v0.4.0: 智能体管理
- v1.0.0: 任务编排与模板

## 当前版本目标
### vX.Y.Z - [版本名称]
- [ ] 任务1: 具体描述（验收标准：xxx）
- [ ] 任务2: 具体描述（验收标准：xxx）

## 已完成版本
### vX.Y.Z - [版本名称] ✅
- 完成内容概述（最多保留最新 5 个版本详情，旧版本合并压缩为 1 条）
```

> **要求**：每个任务必须明确验收标准，支持长期迭代演进。

---

### 4.2 开发阶段（Development）

#### 4.2.1 更新版本号

同步更新以下两处版本号：
- `package.json` → `version` 字段
- `src/server.ts` → 版本相关常量

#### 4.2.2 模块开发顺序（严格遵守依赖关系）

```
基础设施（types → utils → db → ssh）
    ↓
管理器（project-manager → git-manager → env-manager → agent-manager → orchestrator）
    ↓
MCP工具（每完成一个管理器，立即实现对应工具定义）
    ↓
网关集成（所有工具定义完成后，在 mcp-gateway.ts 中统一注册）
```

#### 4.2.3 测试要求

| 类型 | 要求 |
|------|------|
| 单元测试 | 每个管理器模块必须编写对应单元测试，覆盖率 ≥ 70% |
| 集成测试 | MCP 工具定义完成后，必须编写集成测试验证工具调用链路 |
| 测试框架 | Jest |
| Mock 策略 | SSH 连接、Git 操作、数据库操作必须提供 Mock 实现 |

---

### 4.3 代码审查阶段（Review）

审查以下维度，**任一未通过须修复后方可进入发布流程**：

- [ ] 代码质量与架构一致性
- [ ] 错误处理完备性（所有异步操作已用 try-catch 包裹）
- [ ] SSH 命令注入防护（黑名单覆盖、路径穿越校验）
- [ ] 日志完整性（无敏感信息泄露）
- [ ] MCP 协议合规性（JSON-RPC 2.0）
- [ ] .gitignore 已覆盖所有敏感文件

---

### 4.4 提交规范

**每个独立模块或功能点单独提交**，保持 Commit 信息清晰。

**格式（Conventional Commits）**：
```
<类型>(<范围>): <简体中文主题>（首行 ≤ 72 字符）

正文（与首行空一行，简体中文，描述变更内容和原因）
```

**允许的类型**：`feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore` / `revert`

**允许的范围**：

| 范围 | 说明 |
|------|------|
| `gateway` | MCP 网关 |
| `project` | 项目管理器 |
| `agent` | 智能体管理器 |
| `git` | Git 管理器 |
| `env` | 环境管理器 |
| `orchestrator` | 任务编排引擎 |
| `ssh` | SSH 连接与执行 |
| `db` | 数据库 |
| `tools` | MCP 工具定义 |
| `docs` | 文档 |
| `test` | 测试 |
| `types` | 类型定义 |
| `utils` | 工具函数 |

**提交示例**：
```
feat(ssh): 实现SSH连接池管理

- 基于node-ssh实现连接复用，最大连接数默认10
- 添加自动重连机制，重试3次间隔5秒
- 连接超时默认30秒，可通过配置覆盖
```

**提交检查清单**：
- [ ] 未遗漏必要文件（类型定义、测试文件等）
- [ ] 未包含禁止文件（node_modules、.env、*.db）
- [ ] 未包含"Written by Claude"等 AI 生成标记
- [ ] 未附加"Signed-off-by"或"Co-authored-by: claude"
- [ ] 严格遵循 .gitignore 规则

---

### 4.5 版本发布（Release）

1. 使用新版本号创建 Git Tag 并推送到 GitHub
2. 在 GitHub 上发布 Release

**发布说明必须包含**：
- 新功能列表
- 修复的 Issue（含 Issue 编号）
- 升级注意事项
- 回滚方案

---

### 4.6 文档更新（Docs）

| 文档 | 触发条件 | 更新内容 |
|------|----------|----------|
| `plan.md` | 每次发布后 | 更新开发进展，勾选已完成任务 |
| `README.md` | 每次发布后 | 项目简介、快速开始、核心功能、架构图、使用示例 |
| `docs/api-reference.md` | 新增或修改 MCP 工具 | 工具描述、参数 schema、返回格式 |
| `docs/database-schema.md` | 数据库表结构变更 | 同步最新表结构 |

> README.md 最多保留最新 5 个版本介绍，旧版本合并压缩为 1 条。

---

### 4.7 问题闭环（Closure）

关闭已解决的 Issue，在 Issue 中以 Markdown 格式回复：
- 问题在哪个版本解决
- 新版本下载地址（GitHub Release 链接）
- 提醒用户进行验证

---

## 五、版本号规范

遵循 **SemVer 语义化版本**（MAJOR.MINOR.PATCH）：

| 版本类型 | 适用场景 |
|----------|----------|
| **MAJOR**（重大不兼容） | MCP 工具接口签名变更、数据库表结构不兼容变更、配置文件格式变更 |
| **MINOR**（新功能，向下兼容） | 新增管理器模块、新增 MCP 工具、新增工作流模板 |
| **PATCH**（修复，向下兼容） | 修复缺陷、性能优化、日志改进、文档更新 |

---

## 六、模块开发阶段规划

### 第一阶段：基础设施（v0.1.0）

| 顺序 | 模块 | 说明 |
|------|------|------|
| 1 | `src/types/index.ts` | 定义所有核心接口和类型 |
| 2 | `src/utils/` | 日志、校验、安全工具 |
| 3 | `src/db/` | 初始化、迁移、基础模型 |
| 4 | `src/ssh/` | 连接池、命令执行器 |
| 5 | `src/managers/project-manager.ts` | 项目 CRUD、工作空间管理 |
| 6 | `src/tools/project-tools.ts` | project_init, project_switch, project_info |
| 7 | `src/tools/execute-tools.ts` | execute_remote, sync_code |
| 8 | `src/gateway/` | 工具注册与路由 |
| 9 | `src/server.ts` | 启动 MCP 服务 |

### 第二阶段：Git 管理（v0.2.0）

| 顺序 | 模块 | 新增工具 |
|------|------|----------|
| 1 | `src/managers/git-manager.ts` | 仓库关联、分支操作、PR 管理 |
| 2 | `src/tools/git-tools.ts` | git_branch_create, git_commit_and_push, git_create_pr, git_review_pr |
| 3 | `src/gateway/mcp-gateway.ts` | 注册 Git 工具 |

### 第三阶段：环境管理（v0.3.0）

| 顺序 | 模块 | 新增工具 |
|------|------|----------|
| 1 | `src/managers/env-manager.ts` | 环境定义、部署、回滚、健康检查 |
| 2 | `src/tools/env-tools.ts` | env_list, env_deploy, env_rollback, env_get_logs, env_health_check |
| 3 | `src/gateway/mcp-gateway.ts` | 注册环境工具 |

### 第四阶段：智能体管理（v0.4.0）

| 顺序 | 模块 | 新增工具 |
|------|------|----------|
| 1 | `src/managers/agent-manager.ts` | 实例生命周期、技能绑定、上下文管理、审计 |
| 2 | `src/tools/agent-tools.ts` | agent_create, agent_set_context, agent_get_tools, agent_switch |
| 3 | `src/gateway/mcp-gateway.ts` | 注册智能体工具 |

### 第五阶段：任务编排（v1.0.0）

| 顺序 | 模块 | 新增工具 |
|------|------|----------|
| 1 | `src/managers/orchestrator.ts` | 工作流解析、步骤执行、条件判断、并行调度 |
| 2 | `templates/workflows/` | 内置常用工作流模板 |
| 3 | `src/tools/orchestrator-tools.ts` | workflow_run, workflow_list, workflow_create |
| 4 | `templates/projects/` | 内置项目模板 |
| 5 | `src/gateway/mcp-gateway.ts` | 注册编排工具 |

---

## 七、核心 MCP 工具规范

### 7.1 工具命名约定

- 格式：`{domain}_{action}`，全小写字母 + 下划线，**动词在后**
- 示例：`project_init`、`git_branch_create`、`env_deploy`
- description：简体中文，描述功能、适用场景和注意事项
- 工具返回必须为结构化 JSON，包含 `success`（boolean）和 `data` 或 `error` 字段
- 所有工具必须捕获异常并返回结构化错误，**不得抛出未处理异常**

### 7.2 工具参数与返回值规范

#### 项目管理工具

| 工具名 | 必填参数 | 可选参数 | 返回关键字段 |
|--------|----------|----------|-------------|
| `project_init` | `name` | `template`, `git_url` | `project_id`, `workspace_path` |
| `project_switch` | `project_id` | — | `project_id`, `name`, `current_branch`, `environments` |
| `project_info` | — | — | `id`, `name`, `git_remotes`, `environments`, `active_agents` |

#### 智能体管理工具

| 工具名 | 必填参数 | 可选参数 | 返回关键字段 |
|--------|----------|----------|-------------|
| `agent_create` | `agent_type` | `allowed_tools` | `agent_id`, `token` |
| `agent_set_context` | `key`, `value` | — | `success` |
| `agent_get_tools` | — | — | `tools` 数组（`name`, `description`） |
| `agent_switch` | `agent_id` | — | `agent_id`, `name`, `status` |

#### Git 操作工具

| 工具名 | 必填参数 | 可选参数 | 返回关键字段 |
|--------|----------|----------|-------------|
| `git_branch_create` | `name` | `from_branch` | `branch_name`, `remote_url` |
| `git_commit_and_push` | `message` | `files` | `commit_sha`, `branch` |
| `git_create_pr` | `title`, `body`, `base_branch` | — | `pr_url`, `pr_id` |
| `git_review_pr` | `pr_id` | — | `approved`, `comments`, `suggestions` |

#### 环境管理工具

| 工具名 | 必填参数 | 可选参数 | 返回关键字段 |
|--------|----------|----------|-------------|
| `env_list` | — | — | 环境数组（`name`, `servers_count`, `last_deployment`） |
| `env_deploy` | `env_name`, `branch` | `force` | `deployment_id`, `status`, `health_check_result` |
| `env_rollback` | `env_name` | `deployment_id` | `deployment_id`, `status` |
| `env_get_logs` | `env_name`, `service`, `lines` | `filter` | `log_lines` 数组 |
| `env_health_check` | `env_name` | — | `healthy`, `details` |

#### 远程执行工具

| 工具名 | 必填参数 | 可选参数 | 返回关键字段 |
|--------|----------|----------|-------------|
| `execute_remote` | `server`, `command` | `work_dir` | `stdout`, `stderr`, `exit_code` |
| `sync_code` | `server`, `local_path`, `remote_path`, `direction` | — | `synced_files`, `errors` |

#### 任务编排工具（v1.0.0）

| 工具名 | 必填参数 | 可选参数 | 返回关键字段 |
|--------|----------|----------|-------------|
| `workflow_run` | `workflow_name` | `params` | `run_id`, `status`, `steps` |
| `workflow_list` | — | — | 工作流数组（`name`, `description`, `steps_count`） |
| `workflow_create` | `name`, `definition` | `description` | `workflow_id`, `name` |

---

## 八、设计规范

### 8.1 架构规范

**三层严格分离**：

```
控制层（MCP Server）  ←→  执行层（SSH / Git API）  ←→  数据层（SQLite / PostgreSQL）
```

- **一切能力即工具**：每个功能模块暴露为结构化的 MCP Tool，包含清晰的 `name`、`description`、`inputSchema`
- **最小侵入原则**：远程服务器仅需标准 SSH 服务，不安装额外 Agent
- **声明式环境管理**：借鉴 Ansible 设计哲学，环境状态由配置定义，操作具备幂等性
- **SSH 连接池**：使用 `node-ssh` 或 `ssh2` 库，实现连接复用和自动重连，最大连接数默认 10（可配置）

### 8.2 数据库设计规范

| 规范项 | 要求 |
|--------|------|
| 表命名 | 复数形式小写蛇形：`projects`、`agent_instances`、`deployments` |
| 字段命名 | 小写蛇形：`project_id`、`created_at`、`allowed_tools` |
| 必备字段 | 每张表必须包含：`id`（UUID 主键）、`created_at`、`updated_at` |
| 外键命名 | 使用 `_id` 后缀：`project_id`、`agent_id` |
| JSON 字段 | 复杂结构（服务器列表、环境变量）使用 `TEXT` 类型存储 JSON 字符串 |

### 8.3 SSH 安全规范

**危险命令黑名单**（`execute_remote` 工具内置，至少覆盖以下命令）：

```
rm -rf /    mkfs    dd if=    :(){ :|:& };:    chmod 777 /
```

**路径安全**：所有文件操作路径必须校验，禁止路径穿越攻击（如 `../../etc/passwd`）

**超时控制**：

| 项目 | 默认值 | 最大值 |
|------|--------|--------|
| SSH 命令执行超时 | 30 秒 | 300 秒 |
| Push 操作超时 | 5 秒 | — |

**日志记录**：所有 SSH 命令执行必须完整记录（时间、目标服务器、命令、执行结果摘要）

### 8.4 错误处理规范

- 所有异步操作使用 `try-catch` 包裹
- 自定义错误类继承自 `Error`，区分以下类型：

| 错误类 | 触发场景 |
|--------|----------|
| `SSHConnectionError` | SSH 连接失败 |
| `CommandExecutionError` | 命令执行异常 |
| `ValidationError` | 参数校验不通过 |
| `GitOperationError` | Git 操作失败 |
| `DeploymentError` | 部署流程异常 |

- 错误消息必须使用**简体中文**，包含足够的上下文信息
- **致命错误**（数据库连接失败、SSH 密钥无效）：立即终止并报告
- **非致命错误**（单次命令失败）：记录日志并返回错误信息

### 8.5 日志规范

- 使用结构化日志（JSON 格式）
- 必要字段：`timestamp`、`level`、`module`、`message`、`context`
- 日志级别：`DEBUG`（开发调试）/ `INFO`（正常操作）/ `WARN`（可恢复异常）/ `ERROR`（需关注的错误）

### 8.6 Git 操作规范

- 使用 `simple-git` 库封装，不直接执行 shell 命令
- 分支命名强制规范：`feat/ai-{slug}`、`fix/ai-{issue-id}`、`chore/ai-{slug}`
- 所有 Git 操作前必须验证工作区状态，存在未暂存变更时给出明确提示

### 8.7 TypeScript 编码规范

| 规范项 | 要求 |
|--------|------|
| 严格模式 | `strict: true` 必须开启 |
| 类型禁止 | 禁止 `any`，特殊情况用 `unknown` + 显式断言 |
| 接口命名 | PascalCase |
| 常量命名 | UPPER_SNAKE_CASE |
| 函数参数 | 超过 3 个时使用对象参数解构 |

---

## 九、环境变量配置

所有配置通过 `.env` 文件或系统环境变量注入，`.env` 文件**必须加入 `.gitignore`**，提供 `.env.example` 作为模板。

| 变量名 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| `MIXIQ_HOME` | MixIQ 数据目录 | `~/.mixiq` | 否 |
| `MIXIQ_DB_PATH` | 数据库文件路径 | `~/.mixiq/mixiq.db` | 否 |
| `MIXIQ_DB_TYPE` | 数据库类型（`sqlite` / `postgres`） | `sqlite` | 否 |
| `MIXIQ_SSH_KEY_DIR` | SSH 密钥目录 | `~/.ssh` | 否 |
| `MIXIQ_SSH_TIMEOUT` | SSH 连接超时（秒） | `30` | 否 |
| `MIXIQ_MAX_SSH_CONNECTIONS` | SSH 最大连接数 | `10` | 否 |
| `MIXIQ_LOG_LEVEL` | 日志级别 | `info` | 否 |
| `MIXIQ_GIT_DEFAULT_REMOTE` | 默认 Git 远程名称 | `origin` | 否 |
| `MIXIQ_COMMAND_BLACKLIST` | 额外危险命令黑名单（逗号分隔） | — | 否 |

---

## 十、版本验收标准

每个版本发布前必须满足以下**全部**条件：

| 验收项 | 标准 |
|--------|------|
| 功能完整性 | plan.md 中规划的所有任务项已完成并勾选 |
| 单元测试 | 覆盖率 ≥ 70% |
| 集成测试 | 通过率 100% |
| MCP 工具可用性 | 可通过 Claude Code 正常调用并返回预期结果 |
| SSH 远程执行 | 可在测试环境（Docker 容器或 Vagrant 虚拟机）正常完成 |
| 文档同步 | `api-reference.md`、`database-schema.md`、`README.md` 已更新 |
| 安全性 | 无命令注入、路径穿越、密钥泄露等高危漏洞 |
| 版本发布 | Git Tag 已创建并推送，GitHub Release 已发布 |
