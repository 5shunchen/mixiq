#!/usr/bin/env node
/**
 * MixIQ - Claude Code MCP 服务器自动安装脚本
 * 自动将 MixIQ 添加到 Claude Code 的 MCP 配置中
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🚀 MixIQ - Claude Code MCP 服务器安装程序\n');

// 确定配置文件路径
const homedir = os.homedir();
const claudeConfigDir = path.join(homedir, '.claude', 'mcp');
const claudeConfigFile = path.join(claudeConfigDir, 'config.json');
const mixiqPath = path.resolve(__dirname, '..');

console.log(`📂 项目路径: ${mixiqPath}`);
console.log(`📂 Claude 配置目录: ${claudeConfigDir}`);
console.log(`📄 配置文件: ${claudeConfigFile}\n`);

// 确保配置目录存在
if (!fs.existsSync(claudeConfigDir)) {
  console.log('📁 创建 Claude 配置目录...');
  fs.mkdirSync(claudeConfigDir, { recursive: true });
}

// 读取或创建配置文件
let config = { mcpServers: {} };
if (fs.existsSync(claudeConfigFile)) {
  try {
    config = JSON.parse(fs.readFileSync(claudeConfigFile, 'utf8'));
    console.log('✅ 读取现有配置文件\n');
  } catch (e) {
    console.log('⚠️  配置文件格式错误，将创建新配置\n');
  }
}

// 检查是否已安装
if (config.mcpServers && config.mcpServers.mixiq) {
  console.log('⚠️  MixIQ 已在 Claude Code 配置中');
  console.log(`   当前配置: ${JSON.stringify(config.mcpServers.mixiq, null, 2)}`);
  console.log('\n❓ 是否覆盖？(y/N): ');

  process.stdin.once('data', (data) => {
    const answer = data.toString().trim().toLowerCase();
    if (answer === 'y' || answer === 'yes') {
      install();
    } else {
      console.log('\n✅ 安装已取消（保留现有配置）');
      process.exit(0);
    }
  });
} else {
  install();
}

function install() {
  // 添加 MixIQ 配置
  config.mcpServers = config.mcpServers || {};
  config.mcpServers.mixiq = {
    command: 'node',
    args: [path.join(mixiqPath, 'dist', 'server.js')],
    env: process.env.NODE_ENV === 'production' ? {} : {
      NODE_ENV: 'development'
    }
  };

  // 写入配置文件
  try {
    fs.writeFileSync(claudeConfigFile, JSON.stringify(config, null, 2));
    console.log('✅ 配置文件已更新');
    console.log(`📍 配置文件路径: ${claudeConfigFile}\n`);
  } catch (e) {
    console.error(`❌ 写入配置文件失败: ${e.message}`);
    process.exit(1);
  }

  // 验证构建
  const serverPath = path.join(mixiqPath, 'dist', 'server.js');
  if (!fs.existsSync(serverPath)) {
    console.log('🔨 构建项目...');
    const { execSync } = require('child_process');
    try {
      execSync('npm run build', { cwd: mixiqPath, stdio: 'inherit' });
      console.log('✅ 构建完成\n');
    } catch (e) {
      console.error('❌ 构建失败，请手动运行 npm run build');
      process.exit(1);
    }
  }

  console.log('🎉 MixIQ MCP 服务器安装成功！\n');
  console.log('📋 安装配置:');
  console.log('   {');
  console.log('     "mcpServers": {');
  console.log('       "mixiq": {');
  console.log('         "command": "node",');
  console.log(`         "args": ["${path.join(mixiqPath, 'dist', 'server.js')}"]`);
  console.log('       }');
  console.log('     }');
  console.log('   }\n');

  console.log('👉 下一步操作:');
  console.log('   1. 重启 Claude Code');
  console.log('   2. 输入 /mcp 验证服务器已连接');
  console.log('   3. 开始使用 MixIQ 的 37 个开发运维工具！\n');

  console.log('📚 更多信息: https://github.com/5shunchen/mixiq\n');
  process.exit(0);
}
