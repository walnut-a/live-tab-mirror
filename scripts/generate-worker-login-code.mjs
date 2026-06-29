#!/usr/bin/env node

const DEFAULT_EMAIL = 'zhaowork74@gmail.com';

function printHelp() {
  console.log(`Live Tab Mirror Cloudflare Worker login code

Usage:
  npm run auth:worker-code
  npm run auth:worker-code -- --json

Options:
  --email <email>      Login email. Defaults to ${DEFAULT_EMAIL}.
  --api-url <url>      Worker API URL. Defaults to WORKER_API_URL or VITE_WORKER_API_URL.
  --json               Print JSON output.
  -h, --help           Show this help.

Auth:
  Set WORKER_ADMIN_CODE_SECRET in this local shell. It must match the Worker secret
  ADMIN_CODE_SECRET. Do not put this secret in frontend env files.`);
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function readEnv(name) {
  return process.env[name]?.trim() ?? '';
}

function readFlagValue(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) {
    return args[index + 1];
  }

  return '';
}

function getApiUrl(args) {
  const apiUrl = readFlagValue(args, '--api-url') || readEnv('WORKER_API_URL') || readEnv('VITE_WORKER_API_URL');
  if (!apiUrl) {
    throw new Error('缺少 Worker API URL。请设置 WORKER_API_URL 或传入 --api-url。');
  }
  return apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    return;
  }

  const email = normalizeEmail(readFlagValue(args, '--email') || readEnv('WORKER_ALLOWED_EMAIL') || DEFAULT_EMAIL);
  if (email !== DEFAULT_EMAIL) {
    throw new Error(`这里只允许给 ${DEFAULT_EMAIL} 生成登录验证码。当前输入是 ${email}。`);
  }

  const adminSecret = readEnv('WORKER_ADMIN_CODE_SECRET') || readEnv('ADMIN_CODE_SECRET');
  if (!adminSecret) {
    throw new Error('缺少 WORKER_ADMIN_CODE_SECRET。');
  }

  const response = await fetch(new URL('/admin/login-code', getApiUrl(args)), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': adminSecret
    },
    body: JSON.stringify({ email })
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body && typeof body.error === 'string' ? body.error : response.statusText;
    throw new Error(message);
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  console.log('Live Tab Mirror Worker 登录验证码');
  console.log(`邮箱: ${body.email}`);
  console.log(`验证码: ${body.code}`);
  console.log(`过期时间: ${body.expiresAt}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`生成 Worker 登录验证码失败：${message}`);
  process.exitCode = 1;
});
