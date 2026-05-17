# MixIQ 开发规划

## 版本路线图
- v0.1.0: 基础远程执行 + 简单项目管理 ✅
- v0.2.0: Git 与分支管理 ✅
- v0.3.0: 环境管理与部署 ✅
- v0.4.0: 智能体管理 ✅
- v1.0.0: 任务编排与模板 ✅

## 当前版本目标
### 项目已完成 🎉
所有规划版本已全部完成！

## 已完成版本
### v1.0.0 - 任务编排与模板 ✅
- Orchestrator 编排引擎（工作流解析、步骤执行、条件判断、并行调度）
- 6个内置工作流模板（project-init, feature-branch, code-review, deploy-env, rollback-env, full-cicd）
- 8种步骤类型支持（shell, git, deploy, tool, condition, parallel, loop, wait）
- 步骤重试机制和超时控制
- 工作流参数注入和上下文传递
- 8个编排 MCP 工具（workflow_list, workflow_create, workflow_get, workflow_delete, workflow_run, workflow_run_status, workflow_run_cancel, workflow_run_list）
- 93个 Orchestrator 单元测试，覆盖率 95.4%
- 78个编排工具单元测试，覆盖率 95.4%
- 总计 857 个测试全部通过

### v0.4.0 - 智能体管理 ✅
- AgentManager 类（生命周期、上下文管理、工具绑定、审计日志）
- 9个智能体 MCP 工具（agent_create, agent_list, agent_info, agent_switch, agent_delete, agent_set_context, agent_get_context, agent_get_tools, agent_get_history）
- 41个 AgentManager 单元测试，覆盖率 80%+
- 86个 AgentTools 单元测试
- 总计 686 个测试全部通过

### v0.3.0 - 环境管理与部署 ✅
- EnvManager 类（环境 CRUD、部署、回滚、日志获取、健康检查）
- 8个环境 MCP 工具（env_list, env_create, env_info, env_deploy, env_rollback, env_deployment_history, env_get_logs, env_health_check）
- 56个 EnvManager 单元测试，覆盖率 90.84%
- 108个 EnvTools 单元测试，覆盖率 95.12%
- 总计 559 个测试全部通过

### v0.2.0 - Git 与分支管理 ✅
- GitManager 类（18个核心方法：initRepo, cloneRepo, getStatus, 分支操作, 提交, 推送, 拉取, PR创建与审查等）
- 9个 Git MCP 工具（git_init, git_clone, git_status, git_branch_create, git_branch_list, git_checkout, git_commit_and_push, git_create_pr, git_review_pr）
- 54个 GitManager 单元测试，覆盖率 94.46%
- 71个 GitTools 单元测试，覆盖率 95.55%
- 12个 Git 集成测试，真实仓库验证
- 总计 395 个测试全部通过

### v0.1.0 - 基础设施与核心框架 ✅
- 29个核心接口/类型定义
- 工具模块（logger, validator, security）
- 数据库模块（SQLite, CRUD, 事务）
- SSH连接池与命令执行器
- 项目管理器
- MCP网关与服务器
- 249个单元测试，核心模块覆盖率>90%
- 9个集成测试，真实服务器验证
- GitHub Release: https://github.com/5shunchen/mixiq/releases/tag/v0.1.0
