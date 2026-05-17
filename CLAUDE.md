# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**MixIQ** is an AI-native agent development and operations platform that unifies the following capabilities through the MCP protocol, enabling full-stack development and operations through conversation with Claude Code:

| Capability Domain | Core Features |
|-------------------|---------------|
| Agent Management | Instance lifecycle, skill binding, context management, auditing |
| Repository Management | Repository association, commits/pushes, PR creation and review |
| Branch Management | Branch creation, merging, conflict resolution |
| Project Management | Project initialization, switching, workspace management |
| Environment Management | Deployment, rollback, health checks, log queries |
| Task Orchestration | Workflow parsing, conditional logic, parallel scheduling |

---

## Technology Stack

- **Language**: TypeScript (strict mode enabled, no `any` type)
- **Runtime**: Node.js 18+
- **Database**: SQLite (development) / PostgreSQL (production)
- **Protocol**: MCP (Model Context Protocol) based on JSON-RPC 2.0
- **Remote Access**: SSH (node-ssh or ssh2 library)
- **Git Operations**: simple-git library (no direct shell commands)
- **Testing**: Jest

---

## Architecture

### Three-Layer Strict Separation

```
Control Layer (MCP Server)  ←→  Execution Layer (SSH / Git API)  ←→  Data Layer (SQLite / PostgreSQL)
```

### Directory Structure

```
mixiq/
├── src/
│   ├── server.ts                      # MCP server main entry
│   ├── gateway/
│   │   ├── mcp-gateway.ts             # MCP tool registration and routing
│   │   └── tool-registry.ts           # Tool registry
│   ├── managers/
│   │   ├── project-manager.ts         # Project management
│   │   ├── agent-manager.ts           # Agent management
│   │   ├── git-manager.ts             # Git repository and branch management
│   │   ├── env-manager.ts             # Deployment and environment management
│   │   └── orchestrator.ts            # Task orchestration engine
│   ├── tools/
│   │   ├── project-tools.ts           # Project management MCP tools
│   │   ├── agent-tools.ts             # Agent management MCP tools
│   │   ├── git-tools.ts               # Git operations MCP tools
│   │   ├── env-tools.ts               # Environment management MCP tools
│   │   ├── execute-tools.ts           # Remote execution MCP tools
│   │   └── orchestrator-tools.ts      # Task orchestration MCP tools
│   ├── ssh/
│   │   ├── ssh-connection.ts          # SSH connection pool management
│   │   └── ssh-executor.ts            # SSH command executor
│   ├── db/
│   │   ├── database.ts                # Database initialization and connection
│   │   ├── migrations/                # Database migration files
│   │   └── models/                    # Data model definitions
│   ├── types/
│   │   └── index.ts                   # Global TypeScript type definitions
│   └── utils/
│       ├── logger.ts                  # Logging utility
│       ├── validator.ts               # Parameter validation utility
│       └── security.ts                # Security utility (command filtering, masking)
├── docs/
│   ├── architecture.md                # Architecture design document
│   ├── api-reference.md               # MCP tool API reference
│   ├── database-schema.md             # Database schema documentation
│   ├── deployment-guide.md            # Deployment guide
│   └── module-*.md                    # Module-specific design documents
├── templates/
│   ├── projects/                      # Project templates
│   └── workflows/                     # Workflow templates (YAML)
├── tests/
│   ├── unit/                          # Unit tests
│   └── integration/                   # Integration tests
├── plan.md                            # Task planning file (core project document)
├── package.json
├── tsconfig.json
├── .gitignore
└── .env.example
```

### Module Development Order (Dependency Chain)

```
Infrastructure (types → utils → db → ssh)
    ↓
Managers (project-manager → git-manager → env-manager → agent-manager → orchestrator)
    ↓
MCP Tools (implement tool definitions after each manager is complete)
    ↓
Gateway Integration (register all tools in mcp-gateway.ts)
```

---

## Common Commands

### Build and Run

```bash
# Build TypeScript
npm run build

# Start MCP server
npm start

# Development mode with hot reload
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run specific test file
npm test -- tests/unit/filename.test.ts

# Run tests with coverage
npm run test:coverage
```

### Linting and Formatting

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

---

## Versioning and Release Process

### Versioning Strategy

Follow SemVer (MAJOR.MINOR.PATCH):

- **MAJOR**: Breaking changes (MCP tool signatures, database schema, config format)
- **MINOR**: New features (new managers, MCP tools, workflow templates)
- **PATCH**: Bug fixes, performance optimizations, logging improvements, docs

### Release Workflow

1. Update version in `package.json` and `src/server.ts`
2. Create Git tag with new version number and push to GitHub
3. Create GitHub Release with:
   - New features list
   - Fixed issues (with issue numbers)
   - Upgrade notes
   - Rollback plan

---

## Coding Standards

### MCP Tool Specification

- Naming format: `{domain}_{action}`, lowercase + underscore (verb last)
- Example: `project_init`, `git_branch_create`, `env_deploy`
- Description in Simplified Chinese
- Return value must be structured JSON with `success` (boolean) and `data` or `error`
- All tools must catch exceptions and return structured errors (**never throw unhandled exceptions**)

### Git Operations

- Use `simple-git` library exclusively - **never execute git shell commands directly**
- Branch naming: `feat/ai-{slug}`, `fix/ai-{issue-id}`, `chore/ai-{slug}`
- Always validate workspace status before Git operations
- **Never force push to main/master branch**

### SSH Security

- Blacklist dangerous commands: `rm -rf /`, `mkfs`, `dd if=`, fork bombs, `chmod 777 /`
- Validate all file paths to prevent path traversal attacks
- Default command timeout: 30 seconds (max 300 seconds)
- Push operation timeout: 5 seconds
- Log all SSH command executions (time, target server, command, result summary)

### Database Design

- Table names: plural lowercase snake_case (e.g., `projects`, `agent_instances`, `deployments`)
- Field names: lowercase snake_case
- Required fields: `id` (UUID primary key), `created_at`, `updated_at`
- Foreign keys: `_id` suffix (e.g., `project_id`, `agent_id`)
- JSON fields: stored as TEXT type

### Error Handling

- All async operations wrapped in `try-catch`
- Custom error classes: `SSHConnectionError`, `CommandExecutionError`, `ValidationError`, `GitOperationError`, `DeploymentError`
- Error messages in Simplified Chinese with context

### TypeScript

- Strict mode **must** be enabled
- No `any` type - use `unknown` + explicit assertion for edge cases
- Interfaces: PascalCase
- Constants: UPPER_SNAKE_CASE
- Function parameters > 3: use object destructuring

---

## Configuration and Environment Variables

All configuration through `.env` or system environment variables. `.env` **must** be in `.gitignore`. Provide `.env.example` as template.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MIXIQ_HOME` | MixIQ data directory | `~/.mixiq` | No |
| `MIXIQ_DB_PATH` | Database file path | `~/.mixiq/mixiq.db` | No |
| `MIXIQ_DB_TYPE` | Database type (`sqlite` / `postgres`) | `sqlite` | No |
| `MIXIQ_SSH_KEY_DIR` | SSH key directory | `~/.ssh` | No |
| `MIXIQ_SSH_TIMEOUT` | SSH connection timeout (seconds) | `30` | No |
| `MIXIQ_MAX_SSH_CONNECTIONS` | Max SSH connections | `10` | No |
| `MIXIQ_LOG_LEVEL` | Log level | `info` | No |
| `MIXIQ_GIT_DEFAULT_REMOTE` | Default Git remote name | `origin` | No |
| `MIXIQ_COMMAND_BLACKLIST` | Additional dangerous commands (comma-separated) | — | No |

---

## Non-Negotiable Global Constraints

⛔ **Never commit** `.env`, SSH private keys, API keys, database passwords to Git (use `.gitignore`)
⛔ **Never force push** to main/master branch
⛔ **Never install AI components** on remote servers (unless MixIQ-Agent explicitly configured)
⛔ **Never log** passwords, keys, tokens or any sensitive information
⛔ **Never use `any` type** (use `unknown` + explicit type assertion for special cases)
⛔ **Never execute shell commands** for Git operations (must use `simple-git` library)
⛔ **Never hardcode SSH private key paths** (must use environment variables or config files)

✅ Claude Code is authorized to automatically execute commands and plans without approval
✅ Development must happen on the main branch for new versions
✅ All code in TypeScript, Node.js 18+ environment
✅ MCP server implementation must follow MCP protocol spec (JSON-RPC 2.0)
✅ Remote server operations based on SSH protocol
✅ gh CLI commands must execute from within the repository directory

---

## Development Workflow

Always follow this complete closed-loop process for every task execution:

```
Planning → Development → Review → Release → Documentation → Closure
```

### Planning Phase (Always first)

1. Check `plan.md` for all completed tasks - if complete, immediately end with summary report
2. Check for open GitHub Issues: `gh issue list --state open --limit 5 --search "sort:created-desc"`
3. Priority: Missing core modules first (project, git, env, agent, orchestrator)
4. Update `plan.md` with version target and tasks with acceptance criteria

### Review Checklist (Before Release)

- [ ] Code quality and architecture consistency
- [ ] Complete error handling (all async operations wrapped in try-catch)
- [ ] SSH command injection protection (blacklist coverage, path traversal validation)
- [ ] Log completeness (no sensitive information leakage)
- [ ] MCP protocol compliance (JSON-RPC 2.0)
- [ ] `.gitignore` covers all sensitive files

### Documentation Updates After Release

| Document | Trigger | Content |
|----------|---------|---------|
| `plan.md` | After each release | Update progress, check off completed tasks |
| `README.md` | After each release | Project intro, quick start, core features, architecture, usage examples |
| `docs/api-reference.md` | New/modified MCP tools | Tool description, parameter schema, return format |
| `docs/database-schema.md` | Schema changes | Sync latest table structure |

### Closure

Close resolved Issues with reply containing:
- Which version resolves the issue
- New version download URL (GitHub Release link)
- Reminder to user for verification

---

## Commit Convention (Conventional Commits)

**Format:**
```
<type>(<scope>): <Simplified Chinese subject> (first line ≤ 72 chars)

<body (blank line after subject, Simplified Chinese, describe changes and reasons)>
```

**Types allowed:** `feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore` / `revert`

**Scopes allowed:** `gateway`, `project`, `agent`, `git`, `env`, `orchestrator`, `ssh`, `db`, `tools`, `docs`, `test`, `types`, `utils`

**Commit Checklist:**
- [ ] No missing files (type definitions, test files, etc.)
- [ ] No forbidden files (node_modules, .env, *.db)
- [ ] No "Written by Claude" or AI generation markers
- [ ] No "Signed-off-by" or "Co-authored-by: claude"
- [ ] Strictly follows .gitignore rules
