#!/usr/bin/env node

const DEFAULT_PROJECT_REF = 'jpqyqvpzbgxfushpsyij';
const DEFAULT_EMAIL = 'zhaowork74@gmail.com';
const DEFAULT_REDIRECT_TO = 'https://walnut-a.github.io/live-tab-mirror/';

const SERVICE_KEY_ENV_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_KEY'
];

function printHelp() {
  console.log(`Live Tab Mirror manual login code

Usage:
  npm run auth:code
  npm run auth:code -- --check
  npm run auth:code -- --json

Options:
  --email <email>          Login email. Defaults to ${DEFAULT_EMAIL}.
  --project-ref <ref>      Supabase project ref. Defaults to ${DEFAULT_PROJECT_REF}.
  --supabase-url <url>     Supabase project URL. Defaults to https://<project-ref>.supabase.co.
  --redirect-to <url>      Redirect URL stored on the generated link.
  --show-link              Also print the generated magic link.
  --json                   Print JSON output.
  --check                  Validate config and admin key lookup without generating a code.
  -h, --help               Show this help.

Auth:
  Set one of these local-only environment variables:
    SUPABASE_SERVICE_ROLE_KEY
    SUPABASE_SECRET_KEY
    SUPABASE_ACCESS_TOKEN

The service key or access token must stay on this machine. Do not put it in frontend env files.`);
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

function inferProjectRefFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    const [projectRef, supabase, topLevelDomain] = hostname.split('.');
    if (projectRef && supabase === 'supabase' && topLevelDomain === 'co') {
      return projectRef;
    }
  } catch {
    return '';
  }

  return '';
}

function readOptions(args) {
  const projectRefFromFlag =
    readFlagValue(args, '--project-ref') ||
    readEnv('SUPABASE_PROJECT_REF') ||
    readEnv('VITE_SUPABASE_PROJECT_REF');
  const supabaseUrlFromFlag =
    readFlagValue(args, '--supabase-url') ||
    readEnv('SUPABASE_URL') ||
    readEnv('VITE_SUPABASE_URL');
  const projectRef =
    projectRefFromFlag ||
    inferProjectRefFromUrl(supabaseUrlFromFlag) ||
    DEFAULT_PROJECT_REF;
  const supabaseUrl = supabaseUrlFromFlag || `https://${projectRef}.supabase.co`;
  const email = normalizeEmail(readFlagValue(args, '--email') || readEnv('SUPABASE_ALLOWED_EMAIL') || DEFAULT_EMAIL);

  return {
    check: args.includes('--check'),
    email,
    json: args.includes('--json'),
    projectRef,
    redirectTo: readFlagValue(args, '--redirect-to') || readEnv('SUPABASE_REDIRECT_TO') || DEFAULT_REDIRECT_TO,
    showLink: args.includes('--show-link'),
    supabaseUrl
  };
}

function assertAllowedEmail(email) {
  if (email !== DEFAULT_EMAIL) {
    throw new Error(`这里只允许给 ${DEFAULT_EMAIL} 生成登录验证码。当前输入是 ${email}。`);
  }
}

async function readServiceKey(projectRef) {
  for (const envName of SERVICE_KEY_ENV_NAMES) {
    const key = readEnv(envName);
    if (key) {
      return {
        key,
        source: envName
      };
    }
  }

  const accessToken = readEnv('SUPABASE_ACCESS_TOKEN');
  if (!accessToken) {
    throw new Error(
      `缺少 Supabase 管理凭据。请在本机 shell 设置 ${SERVICE_KEY_ENV_NAMES.join(' / ')} 或 SUPABASE_ACCESS_TOKEN。`
    );
  }

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys?reveal=true`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`读取 Supabase 项目密钥失败：HTTP ${response.status} ${body.slice(0, 300)}`);
  }

  const keys = JSON.parse(body);
  if (!Array.isArray(keys)) {
    throw new Error('Supabase Management API 返回了无法识别的密钥列表。');
  }

  const serviceRoleKey =
    keys.find((key) => key.name === 'service_role') ??
    keys.find((key) => key.type === 'secret') ??
    keys.find((key) => key.name === 'default' && key.type === 'secret');

  if (!serviceRoleKey?.api_key) {
    throw new Error('没有在 Supabase 项目里找到 service_role 或 secret key。');
  }

  return {
    key: serviceRoleKey.api_key,
    source: `SUPABASE_ACCESS_TOKEN -> ${serviceRoleKey.name}/${serviceRoleKey.type}`
  };
}

function pickGeneratedCode(data) {
  const properties = data?.properties ?? {};
  return properties.email_otp ?? properties.emailOtp ?? properties.token ?? '';
}

function pickActionLink(data) {
  const properties = data?.properties ?? {};
  return properties.action_link ?? properties.actionLink ?? data?.action_link ?? '';
}

async function generateCode(options, serviceKey) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(options.supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: options.email,
    options: {
      redirectTo: options.redirectTo
    }
  });

  if (error) {
    throw error;
  }

  const code = pickGeneratedCode(data);
  if (!code) {
    throw new Error('Supabase 没有返回 email_otp，无法生成可输入的验证码。');
  }

  return {
    actionLink: pickActionLink(data),
    code
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    return;
  }

  const options = readOptions(args);
  assertAllowedEmail(options.email);

  await import('@supabase/supabase-js');
  const serviceKey = await readServiceKey(options.projectRef);

  if (options.check) {
    const checkResult = {
      email: options.email,
      keySource: serviceKey.source,
      projectRef: options.projectRef,
      redirectTo: options.redirectTo,
      supabaseUrl: options.supabaseUrl
    };

    if (options.json) {
      console.log(JSON.stringify({ ok: true, ...checkResult }, null, 2));
    } else {
      console.log('配置检查通过，可以生成登录验证码。');
      console.log(`邮箱: ${checkResult.email}`);
      console.log(`项目: ${checkResult.projectRef}`);
      console.log(`Supabase URL: ${checkResult.supabaseUrl}`);
      console.log(`密钥来源: ${checkResult.keySource}`);
    }
    return;
  }

  const generated = await generateCode(options, serviceKey.key);
  const result = {
    code: generated.code,
    email: options.email,
    generatedAt: new Date().toISOString(),
    keySource: serviceKey.source,
    redirectTo: options.redirectTo,
    supabaseUrl: options.supabaseUrl,
    ...(options.showLink ? { actionLink: generated.actionLink } : {})
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('Live Tab Mirror 登录验证码');
  console.log(`邮箱: ${result.email}`);
  console.log(`验证码: ${result.code}`);
  console.log('打开扩展或手机网页，把这个验证码填进「验证码」即可。');
  console.log('验证码一次性有效，过期时间以 Supabase Auth 当前配置为准。');

  if (options.showLink && generated.actionLink) {
    console.log(`Magic link: ${generated.actionLink}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`生成登录验证码失败：${message}`);
  process.exitCode = 1;
});
