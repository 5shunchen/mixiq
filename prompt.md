MixIQ 平台开发指令
1. 项目定位
MixIQ —— 全球首个 AI 原生全链路软件开发平台，通过统一智能体编排能力重构开发流程。
三层能力：
L1 工具层：SSH / 文件传输 / Terminal / 部署，好用的运维平台。
L2 智能层：14+ 系统自带专业角色 AI 团队，7×24 自动化开发测试运维，可按需新建或修改角色。
L3 体验层：远程如本地、全链路透明、进度实时可见。
四大支柱：
智能总工 (Agent Master)：Claude Code / 小龙虾注册接入，管理 14+ 专业角色。
PM 智能调度算法：最优并发、资源分配、风险预警、进度跟踪。
FSP 远程文件协议：跨服务器透明实时操作，如本地开发。
MixIQ-Deploy 部署引擎：K8S 替代方案，单二进制、声明式、轻量、零依赖。
2. 全局约束（不可违背）
禁止提交敏感文件到 Git（.env / 私钥 / Token 等），必须 .gitignore。
禁止 force push main/master。
禁止远程安装 AI 组件（除非配置了 MixIQ-Agent）。
日志禁止泄露密码/密钥/Token。
禁用 any 类型，使用 unknown + 显示断言。
Git 操作必须封装为 simple-git，禁止直接执行 shell 命令。
禁止硬编码 SSH 私钥路径。
FSP 二进制数据必须加密传输。
智能总工注册禁止绕过 Token 验证。
PM 调度器在强依赖场景禁止强行并发。
Claude Code 自动执行命令和计划，不需确认。
必须在 main 分支开发。
全部 TypeScript，Node.js 18+。
MCP 服务器基于 JSON-RPC 2.0。
远程操作基于 SSH，最小侵入。
元数据库开发用 SQLite，生产支持 PostgreSQL。
gh 命令须在仓库目录执行。
文档分不同 MD 文件，放在 docs/。
FSP 必须支持断点续传和增量同步。
MixIQ-Deploy 必须单二进制、零运行时依赖。
3. 项目目录结构（v2.0）
src/ 核心代码：platform 入口、server 入口、gateway、managers、fsp、deploy-engine、agent-master、tools、ssh、db、types、utils。
frontend/ Web 前端（React 页面：Dashboard、AgentTeam、FileExplorer、Terminal、DeployCenter、IssueCenter、Settings）。
docs/ 架构、API、数据库 schema、部署指南、FSP/PM/Deploy/Agent 设计文档。
templates/ 项目模板、工作流模板、14+ 角色 System Prompt 模板。
tests/ 单元测试、集成测试、FSP 性能基准测试。
工程文件：plan.md、package.json、tsconfig.json、.gitignore、.env.example、README。
4. 核心系统设计
4.1 PM 智能调度
并发度公式：C × √(W / D) × (1 - R)（C 基础并发系数，W 工作量，D 工期，R 依赖度）。
14 种角色有严格并发上限矩阵（如 PM、交付经理为单例，前后端开发可多实例）。
调度五阶段：DAG 分析 → 资源评估 → 配额计算 → 任务分配（优先级公式）→ 动态重调度（每 30 分钟）。
防冲突：文件锁 + Git 分支隔离；DDL 串行化；测试环境资源池；部署队列蓝绿隔离。
4.2 FSP 远程文件协议
基于 WebSocket 二进制帧，含魔数、会话 ID、CRC32 校验。
消息类型：目录列表、文件读写、命令执行、Git 状态推送、心跳等。
离线队列（IndexedDB）、断点续传（分块 SHA256）、冲突检测（三方合并）。
4.3 MixIQ-Deploy 部署引擎
单二进制 10MB，原生 runc + overlayfs，无需 Docker Daemon。
YAML 声明式蓝图：服务副本、构建、端口、健康检查、滚动发布。
能力：滚动/蓝绿发布、自动伸缩、服务发现、日志聚合、备份回滚。
4.4 智能总工与角色体系
角色管理：
平台内置 14+ 种专业角色（PM、前端、后端、测试等），非运行时动态生成。
智能总工可根据用户需要新建角色，也可修改已有角色的提示词。
角色默认不关联任何项目，也不关联任何智能总工。
项目关联与代理拉起：
在项目中选取特定角色并与之关联后，智能总工在开发时将自动把这些角色导入自身配置。
PM 调度算法会根据任务需要，自动拉取对应角色的子 agent 进行任务处理。
当取消角色与项目的关联时，对应子 agent 的配置会被移除，不再参与该项目开发。
物理机（Claude Code / 小龙虾）通过 mixiq-agent register 注册到平台（Token、标签、容量），成为可用的智能总工。
5. 开发执行流程（不可跳过）
规划 → 开发 → 审查 → 发布 → 文档 → 闭环。
5.1 规划阶段
优先级判断（P0–P4），依据 plan.md 完成度、未关闭 Issues、四大支柱模块完成情况决定版本。
四大支柱优先：FSP / PM 调度 / 部署引擎 / 智能总工任一完全未开始时，优先启动。
版本路线示例：1.0.0 基础 → 2.0.0 alpha1–beta2 → 2.0.0 正式。
5.2 开发阶段
同步更新 package.json 版本号及代码中常量。
严格依赖顺序：类型/工具/DB/SSH → FSP → PM 调度 → 智能总工 → 部署引擎 → MCP 工具与前端。
测试要求：单元测试覆盖率 ≥ 70%（核心 85%），Jest，FSP 有帧解析/性能基准，Mock SSH/Git/DB。
5.3 代码审查
审查点：架构一致性、错误处理、命令注入防护、FSP 安全、调度正确性、日志脱敏、MCP 合规、.gitignore 完整。未通过必须修复。
5.4 提交规范
Conventional Commits，简体中文，首行 ≤ 72 字符，正文描述变更原因。
新增 scope：fsp、pm、deploy、agent-master、role、frontend。
6.里程碑规划
alpha1：FSP 协议核心（帧定义、Session 管理、文件监听、PTY 终端、前端文件浏览器）。
alpha2：PM 调度引擎（DAG、并发配额、任务调度、风险预警、进度看板）。
beta1：部署引擎（蓝图解析、runc 运行时、路由、健康检查、备份回滚）。
beta2：智能总工与角色体系（注册认证、角色库管理、项目角色关联、消息队列、心跳管理、前端团队页面）。
正式版：端到端全链路集成、性能压力测试、安全审计、文档完善。
7. 数据库新增表
agent_roles：角色元数据（prompt、工具集、并发上限）。
project_agent_teams：项目-角色实例绑定，运行在哪个智能总工，状态及指标。
issues：需求/任务管理，含依赖关系、预估/实际工时、分配信息。
project_events：全事件日志（文件变更、Git 提交、命令执行、部署等）。
service_monitors：运行服务监控（CPU/内存/磁盘、健康检查）。
agent_masters：注册机器（Token 哈希、容量、负载、心跳）。
8. 新增环境变量
MIXIQ_FSP_PORT（8080）、_CHUNK_SIZE（1MB）、_HEARTBEAT（30s）。
MIXIQ_PM_SCHEDULE_INTERVAL（1800s）。
MIXIQ_AGENT_CAPACITY_DEFAULT（10）。
MIXIQ_DEPLOY_DATA_DIR（~/.mixiq/deploy）。
9.最终验收标准
计划任务全部完成；核心模块测试覆盖率 ≥ 85%；集成测试通过率 100%。
性能：100MB 文件 FSP 传输 <3s；延迟 <100ms。
PM 调度依赖检测准确率 100% 无死锁。
部署引擎蓝绿切换零中断，回滚 100 次全成功。
单智能总工支持 10+ 角色并发。
MCP 工具可正常调用；SSH 远程执行正常。
文档齐全；安全性（加密、鉴权、无注入）通过。
Git Tag 和 Release 已发布。
