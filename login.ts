/**
 * XHS Login Utility - 小红书主站登录与 Cookie 保存
 * @see README.md
 */
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Page, Browser } from 'puppeteer';
import * as fs from 'fs';

// 从模块导入
import { COOKIES_PATH } from './src/config';
import { delay } from './src/utils';

puppeteerExtra.use(StealthPlugin());

// 登录专用配置
const MAIN_SITE_URL = 'https://www.xiaohongshu.com';
const LOGIN_TIMEOUT_MS = 180_000;

// 主站登录成功的标识 (任意一个匹配即可)
const LOGIN_SUCCESS_INDICATORS = [
  // 主站侧边栏用户相关
  'li.user.side-bar-item',    // 侧边栏用户项
  '.side-bar .user',          // 侧边栏用户
  '.user-side-item',          // 用户侧边项
  // 主站头部用户相关
  '.user-avatar',             // 用户头像
  '.login-btn.logged',        // 已登录状态的按钮
  // 通用已登录标识
  '[class*="avatar"]',        // 任何头像元素
  'a[href*="/user/profile"]', // 个人主页链接
];

// 未登录标识 (如果存在这些，说明需要登录)
const NOT_LOGGED_IN_INDICATORS = [
  '.login-btn:not(.logged)',  // 未登录的登录按钮
  '.qrcode-container',        // 二维码容器
  '.login-container',         // 登录容器
  'div.login-modal',          // 登录弹窗
];

// 昵称选择器 (用于确认登录身份)
const NICKNAME_SELECTORS = [
  '.user-name',
  '.nickname',
  '.user-info .name',
  '.side-bar .user .name',
  '[class*="nickname"]',
  '[class*="user-name"]',
];

// delay 函数已从 src/utils 导入

/** 检测是否已登录 (主站版本) */
async function isLoggedIn(page: Page): Promise<boolean> {
  // 方式1: 检查是否存在未登录标识 (如果有登录弹窗/二维码，说明未登录)
  for (const selector of NOT_LOGGED_IN_INDICATORS) {
    try {
      const element = await page.$(selector);
      if (element) {
        const isVisible = await page.evaluate((el: Element) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none';
        }, element);
        if (isVisible) {
          return false; // 发现登录弹窗，说明未登录
        }
      }
    } catch {}
  }

  // 方式2: 检查登录成功的元素标识
  for (const selector of LOGIN_SUCCESS_INDICATORS) {
    try {
      const element = await page.$(selector);
      if (element) {
        const isVisible = await page.evaluate((el: Element) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }, element);
        if (isVisible) {
          return true; // 发现已登录元素
        }
      }
    } catch {}
  }

  // 方式3: 检查页面是否有用户头像 (img src 包含 avatar 或 user)
  try {
    const hasAvatar = await page.evaluate(() => {
      const imgs = document.querySelectorAll('img');
      for (const img of imgs) {
        const src = img.src || '';
        if (src.includes('avatar') || src.includes('sns-avatar')) {
          const rect = img.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 20) {
            return true;
          }
        }
      }
      return false;
    });
    if (hasAvatar) {
      return true;
    }
  } catch {}

  return false;
}

/**
 * 获取用户昵称 (用于确认登录身份)
 */
async function getNickname(page: Page): Promise<string | null> {
  for (const selector of NICKNAME_SELECTORS) {
    try {
      const element = await page.$(selector);
      if (element) {
        const text = await page.evaluate((el: Element) => el.textContent?.trim(), element);
        if (text && text.length > 0 && text.length < 50) {
          return text;
        }
      }
    } catch {
      // 继续尝试下一个
    }
  }
  
  // 尝试从页面标题获取
  try {
    const title = await page.title();
    if (title && !title.includes('登录') && title.length < 50) {
      return `(from title: ${title})`;
    }
  } catch {}

  return null;
}

/**
 * 格式化剩余时间
 */
function formatRemainingTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   XHS Login - 小红书登录工具           ║');
  console.log('╚════════════════════════════════════════╝');
  console.log();

  console.log('[login] Step 1: 启动浏览器...');
  const browser = await puppeteerExtra.launch({
    headless: false,          // 显示浏览器
    defaultViewport: null,    // 最大化窗口
    args: [
      '--start-maximized',    // 启动时最大化
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  try {
    const page = await browser.newPage();

    // 设置更真实的 User-Agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('[login] Step 2: 导航到小红书主站...');
    await page.goto(MAIN_SITE_URL, { waitUntil: 'networkidle2' });
    await delay(2000);

    // 检查是否已经登录 (可能有旧 Cookie)
    const alreadyLoggedIn = await isLoggedIn(page);
    if (alreadyLoggedIn) {
      console.log('[login] 检测到已登录状态，直接保存 Cookie...');
    } else {
      // 尝试触发登录弹窗 - 点击登录按钮
      console.log('[login] 尝试触发登录弹窗...');
      try {
        const loginBtn = await page.$('.login-btn, [class*="login"], button:has-text("Login")');
        if (loginBtn) {
          await loginBtn.click();
          await delay(1500);
        }
      } catch {
        // 可能已经有登录弹窗
      }
    }

    console.log();
    console.log('╔════════════════════════════════════════╗');
    console.log('║  📱 请使用小红书 APP 扫描二维码登录    ║');
    console.log('║                                        ║');
    console.log('║  🌐 登录站点: www.xiaohongshu.com      ║');
    console.log('║  ⏰ 超时时间: 3 分钟                   ║');
    console.log('║  🔑 Cookie 全站通用 (主站+创作中心)   ║');
    console.log('╚════════════════════════════════════════╝');
    console.log();

    // Step 3: 等待登录成功 (带倒计时)
    console.log('[login] Step 3: 等待扫码登录...');
    console.log('[login] 提示: 如果没看到二维码，请点击页面右上角的"登录"按钮');
    console.log();
    
    const startTime = Date.now();
    let loggedIn = false;
    let lastPrintedSecond = -1;

    while (Date.now() - startTime < LOGIN_TIMEOUT_MS) {
      loggedIn = await isLoggedIn(page);
      if (loggedIn) {
        break;
      }

      // 计算剩余时间
      const elapsed = Date.now() - startTime;
      const remaining = LOGIN_TIMEOUT_MS - elapsed;
      const currentSecond = Math.ceil(remaining / 1000);

      // 每秒更新一次倒计时
      if (currentSecond !== lastPrintedSecond) {
        lastPrintedSecond = currentSecond;
        const timeStr = formatRemainingTime(remaining);
        process.stdout.write(`\r  ⏳ 等待扫码登录... 剩余时间: ${timeStr}   `);
      }

      // 每 1 秒检查一次 (更频繁，体验更好)
      await delay(1000);
    }

    console.log();  // 换行
    console.log();

    if (!loggedIn) {
      throw new Error('登录超时 (3分钟)，请重新运行脚本');
    }

    // Step 4: 等待页面完全加载 + 获取用户信息
    console.log('[login] Step 4: 登录成功！正在获取用户信息...');
    await delay(3000);

    // 尝试获取昵称
    const nickname = await getNickname(page);

    // Step 5: 保存 Cookie
    console.log('[login] Step 5: 保存 Cookie...');
    const cookies = await page.cookies();
    
    // 写入文件
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2), 'utf-8');

    console.log();
    console.log('╔════════════════════════════════════════╗');
    console.log('║   ✅ 登录成功，Cookie 已保存！         ║');
    console.log('╚════════════════════════════════════════╝');
    console.log();
    
    // 显示登录身份确认
    if (nickname) {
      console.log(`  👤 当前账号: ${nickname}`);
    } else {
      console.log('  👤 当前账号: (无法获取昵称，但登录已成功)');
    }
    console.log();
    console.log(`  📁 Cookie 文件: ${COOKIES_PATH}`);
    console.log(`  🔢 Cookie 数量: ${cookies.length} 个`);
    
    // 检查 Cookie 域名
    const domains = [...new Set(cookies.map((c: any) => c.domain))];
    console.log(`  🌐 Cookie 域名: ${domains.join(', ')}`);
    console.log();
    console.log('  ✅ 这组 Cookie 可用于:');
    console.log('     - www.xiaohongshu.com (主站浏览)');
    console.log('     - creator.xiaohongshu.com (创作中心)');
    console.log();
    console.log('  💡 现在可以运行:');
    console.log('     npx tsx index.ts      # 情报搜集');
    console.log('     npx tsx publisher.ts  # 发布笔记');

  } finally {
    console.log();
    console.log('[login] 浏览器将在 3 秒后关闭...');
    await delay(3000);
    await browser.close();
  }
}

// 运行
main().catch((error) => {
  console.error();
  console.error('╔════════════════════════════════════════╗');
  console.error('║   ❌ 登录失败！                        ║');
  console.error('╚════════════════════════════════════════╝');
  console.error('错误信息:', error.message);
  process.exit(1);
});
