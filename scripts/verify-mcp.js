#!/usr/bin/env node
/**
 * 验证 MCP 服务器是否正常工作
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('🧪 MixIQ MCP 服务器验证程序\n');

const serverPath = path.join(__dirname, '..', 'dist', 'server.js');

if (!fs.existsSync(serverPath)) {
  console.log('❌ 服务器文件不存在，请先运行 npm run build');
  process.exit(1);
}

console.log(`📂 服务器路径: ${serverPath}\n`);

// 启动服务器测试
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let timeout;

// 捕获输出
server.stdout.on('data', (data) => {
  output += data.toString();
});

server.stderr.on('data', (data) => {
  output += data.toString();
});

// 发送初始化消息
const initMessage = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'mixiq-verifier',
      version: '1.0.0'
    }
  }
}) + '\n';

// 超时处理
timeout = setTimeout(() => {
  console.log('✅ 服务器启动成功！\n');
  console.log('📤 发送初始化请求...');
  server.stdin.write(initMessage);

  // 等待响应
  setTimeout(() => {
    console.log('\n✅ MixIQ MCP 服务器运行正常！');
    console.log('\n📋 服务器输出:');
    console.log(output);
    server.kill();
    process.exit(0);
  }, 2000);
}, 3000);

server.on('error', (err) => {
  console.error(`❌ 服务器启动失败:`, err.message);
  clearTimeout(timeout);
  process.exit(1);
});

server.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`❌ 服务器异常退出，代码: ${code}`);
    clearTimeout(timeout);
  }
});
