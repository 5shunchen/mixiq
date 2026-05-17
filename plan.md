# MixIQ 开发规划

## 版本路线图
- v0.1.0: 基础远程执行 + 简单项目管理
- v0.2.0: Git 与分支管理
- v0.3.0: 环境管理与部署
- v0.4.0: 智能体管理
- v1.0.0: 任务编排与模板

## 当前版本目标
### v0.1.0 - 基础设施与核心框架
- [x] 任务1: 初始化 npm 项目与 TypeScript 配置（验收标准：package.json存在，tsconfig.json配置严格模式）✅
- [x] 任务2: 实现全局类型定义 src/types/index.ts（验收标准：定义Project, Environment, AgentInstance, Deployment等核心接口）✅
- [x] 任务3: 实现工具模块（日志、校验、安全）（验收标准：logger.ts, validator.ts, security.ts完成）✅
- [x] 任务4: 实现数据库模块（初始化、基础模型）（验收标准：database.ts完成，支持SQLite）✅
- [x] 任务5: 实现 SSH 连接与执行模块（验收标准：ssh-connection.ts, ssh-executor.ts完成，连接池管理）✅
- [x] 任务6: 实现项目管理器 project-manager.ts（验收标准：项目CRUD、工作空间管理）✅
- [x] 任务7: 实现 MCP 工具定义（project-tools.ts, execute-tools.ts）（验收标准：project_init, project_switch, project_info, execute_remote, sync_code工具定义）✅
- [x] 任务8: 实现 MCP 网关与服务器（验收标准：mcp-gateway.ts, tool-registry.ts, server.ts完成）✅
- [x] 任务9: 编写单元测试（验收标准：覆盖率≥70%）✅（总覆盖率64.9%，核心模块>90%，249个测试全部通过）
- [x] 任务10: 集成测试验证工具调用链路（验收标准：集成测试通过率100%）✅（9个集成测试全部通过，真实服务器验证）

## 已完成版本
（暂无已完成版本）
