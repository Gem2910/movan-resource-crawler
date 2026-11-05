const axios = require('axios');
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.RESOURCE_SPREADSHEET_ID || '1jDLncM9bgA7ofvtUbaAkU3SDP60dFtO4dPxAowB7azw';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

// Khởi tạo Google Sheets API từ biến môi trường trên Vercel
function getGoogleSheetsClient() {
  let credentials;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch (e) {
      console.error('Lỗi parse GOOGLE_SERVICE_ACCOUNT_JSON:', e.message);
    }
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

// Báo cáo Telegram
async function notifyTelegram(msg) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_ADMIN_CHAT_ID,
      text: msg,
      parse_mode: 'HTML'
    });
  } catch (err) {
    console.error('[Telegram Notify Error]:', err.message);
  }
}

// Kiểm tra link còn sống hay link chết (Validate URL Health)
async function isLinkAlive(url) {
  if (!url || !url.startsWith('http')) return false;

  // Giữ lại các link đặc biệt như Discord, Telegram, Notion, HuggingFace, GitHub
  if (/discord\.(gg|com)|t\.me|telegram\.org|notion\.(so|site)|facebook\.com|threads\.net/i.test(url)) {
    return true;
  }

  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      timeout: 4500,
      maxRedirects: 5,
      validateStatus: (status) => status < 500
    });

    if (res.status === 404 || res.status === 410) return false;
    return true;
  } catch (err) {
    const code = err.code || '';
    const msg = (err.message || '').toLowerCase();

    if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || msg.includes('getaddrinfo enotfound') || msg.includes('econnrefused')) {
      return false;
    }
    if (code === 'ETIMEDOUT' || code === 'ECONNABORTED' || msg.includes('timeout')) {
      return true;
    }
    return false;
  }
}

// Lọc link sống theo luồng song song
async function filterAliveLinks(items, concurrency = 15) {
  const validItems = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const checks = await Promise.all(
      chunk.map(async (item) => {
        const alive = await isLinkAlive(item.link);
        return { item, alive };
      })
    );
    for (const res of checks) {
      if (res.alive) validItems.push(res.item);
    }
  }
  return validItems;
}

// 1. Quét Thiết Kế Đồ Họa
async function crawlDesign() {
  const items = [];
  try {
    const res = await axios.get('https://raw.githubusercontent.com/bradtraversy/design-resources-for-developers/master/readme.md', { timeout: 8000 });
    const lines = res.data.split('\n');
    let currentCategory = 'UI Graphics';

    for (const line of lines) {
      if (line.startsWith('## ')) currentCategory = line.replace('## ', '').trim();
      const match = line.match(/\|\s*\[(.*?)\]\((https?:\/\/.*?)\)\s*\|\s*(.*?)\s*\|/);
      if (match) {
        items.push({
          title: match[1].trim(),
          category: currentCategory,
          tab: '🎨 Thiết Kế Đồ Họa',
          description: match[3].replace(/&nbsp;/g, ' ').trim(),
          type: 'Miễn Phí (Free / Open)',
          link: match[2].trim()
        });
      }
    }
  } catch (e) {}
  return items;
}

// 2. Quét Free API Keys
async function crawlApis() {
  const items = [];
  try {
    const res = await axios.get('https://raw.githubusercontent.com/public-apis/public-apis/master/README.md', { timeout: 8000 });
    const lines = res.data.split('\n');
    let currentCategory = 'General';

    for (const line of lines) {
      if (line.startsWith('### ')) currentCategory = line.replace('### ', '').trim();
      const match = line.match(/\|\s*\[(.*?)\]\((https?:\/\/.*?)\)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|/);
      if (match) {
        const authType = match[4].trim().replace(/`/g, '') || 'No Auth';
        const titleStr = match[1].trim();
        const descStr = match[3].trim();
        const isTool = /mcp|cli|sdk|extension|plugin|library|utility|tool|tools|platform|generator|compiler|formatter|linter|debugger|gui|docker|framework|scraper/i.test(titleStr) ||
                       (!/api|apis|rest|graphql|endpoint/i.test(titleStr) && /mcp|cli|sdk|extension|plugin|utility|tool|tools|generator|formatter|linter|debugger|gui|docker/i.test(descStr));

        items.push({
          title: titleStr,
          category: currentCategory,
          tab: isTool ? '🛠️ Developer Tools' : '🔑 Free API Keys',
          description: descStr,
          type: isTool ? 'Free Tool' : (authType === 'No' ? 'Free (Không cần Key)' : `Free Key (${authType})`),
          link: match[2].trim()
        });
      }
    }
  } catch (e) {}
  return items;
}

// 3. Quét Prompt AI
async function crawlPrompts() {
  const items = [];
  try {
    const res = await axios.get('https://raw.githubusercontent.com/f/awesome-chatgpt-prompts/main/prompts.csv', { timeout: 8000 });
    const lines = res.data.split('\n');
    for (let i = 1; i < Math.min(lines.length, 100); i++) {
      const line = lines[i];
      if (!line) continue;
      const comma = line.indexOf(',');
      if (comma !== -1) {
        const act = line.substring(0, comma).replace(/(^"|"$)/g, '').trim();
        const prompt = line.substring(comma + 1).replace(/(^"|"$)/g, '').trim();
        if (act && prompt) {
          items.push({
            title: `AI Prompt: ${act}`,
            category: 'Prompt AI Chuyên Sâu',
            tab: '🤖 Prompt AI & Cheatsheet',
            description: prompt.length > 200 ? prompt.substring(0, 197) + '...' : prompt,
            type: 'Mẫu Prompt Miễn Phí',
            link: `https://github.com/f/awesome-chatgpt-prompts#${encodeURIComponent(act.toLowerCase().replace(/\s+/g, '-'))}`
          });
        }
      }
    }
  } catch (e) {}
  return items;
}

// 4. Quét Từ Khóa MXH / Google News
async function crawlSocialKeywords() {
  const items = [];
  const searchKeywords = [
    { cat: 'Thiết Kế Đồ Họa', q: '\"kho tài nguyên\" OR \"mockup\" OR \"font việt hóa\"', tab: '🎨 Thiết Kế Đồ Họa' },
    { cat: 'Prompt AI', q: '\"prompt ai\" OR \"midjourney\"', tab: '🤖 Prompt AI & Cheatsheet' },
    { cat: 'Khóa Học', q: '\"khóa học miễn phí\" OR \"tài liệu lập trình\"', tab: '📚 Tài Liệu & Khóa Học' },
    { cat: 'Free API / AI', q: '\"free api\" OR \"api miễn phí\"', tab: '🔑 Free API Keys' }
  ];

  for (const kw of searchKeywords) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(kw.q)}&hl=vi&gl=VN&ceid=VN:vi`;
      const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 6000 });
      const rawMatches = res.data.match(/<item>[\s\S]*?<\/item>/g) || [];

      rawMatches.slice(0, 5).forEach(item => {
        const title = item.match(/<title>(.*?)<\/title>/)?.[1] || '';
        const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
        const source = item.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || 'Cộng đồng';

        if (title && link) {
          items.push({
            title: title.replace(/&amp;/g, '&').replace(/&quot;/g, '"'),
            category: kw.cat,
            tab: '🌐 Tài Nguyên Threads & MXH',
            description: `Tài nguyên chia sẻ từ ${source}`,
            type: 'Chia Sẻ Cộng Đồng',
            link: link.trim()
          });
        }
      });
    } catch (e) {}
  }
  return items;
}

// Handler chính cho Vercel Serverless Function
module.exports = async function handler(req, res) {
  console.log(`[Vercel Cron] Bắt đầu chạy quét tài nguyên: ${new Date().toISOString()}`);

  try {
    const sheets = getGoogleSheetsClient();

    // 1. Quét tài nguyên đa nguồn
    const [designItems, apiItems, promptItems, socialItems] = await Promise.all([
      crawlDesign(),
      crawlApis(),
      crawlPrompts(),
      crawlSocialKeywords()
    ]);

    const allItems = [...designItems, ...apiItems, ...promptItems, ...socialItems];

    // 2. Đọc toàn bộ link hiện có trên Sheet để tránh trùng lặp
    const existingLinks = new Set();
    const tabs = ['🎨 Thiết Kế Đồ Họa', '🔑 Free API Keys', '🛠️ Developer Tools', '🤖 Prompt AI & Cheatsheet', '🌐 Tài Nguyên Threads & MXH'];

    for (const tab of tabs) {
      try {
        const sheetRes = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${tab}!F:F`
        });
        const rows = sheetRes.data?.values || [];
        rows.forEach(r => {
          if (r[0]) existingLinks.add(r[0].toLowerCase().trim());
        });
      } catch (err) {}
    }

    // 3. Lọc lấy tài nguyên mới
    const newItems = allItems.filter(item => {
      const l = (item.link || '').toLowerCase().trim();
      return l && !existingLinks.has(l);
    });

    console.log(`[Vercel] Tổng quét: ${allItems.length} | Link mới chưa có trên Sheet: ${newItems.length}`);

    if (newItems.length === 0) {
      return res.status(200).json({ success: true, message: 'Đã hoàn tất, không có link mới cần cập nhật.' });
    }

    // 4. Lọc link sống / chết (giới hạn tối đa 40 link mỗi lần chạy trên Vercel để tránh timeout)
    const itemsToCheck = newItems.slice(0, 40);
    const aliveItems = await filterAliveLinks(itemsToCheck, 10);

    // 5. Ghi vào Google Sheet
    const tabGroups = {};
    aliveItems.forEach(item => {
      if (!tabGroups[item.tab]) tabGroups[item.tab] = [];
      tabGroups[item.tab].push(item);
    });

    const nowVN = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    let totalAdded = 0;

    for (const [tabTitle, list] of Object.entries(tabGroups)) {
      try {
        const countRes = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${tabTitle}!A:A`
        });
        const currentRows = countRes.data?.values?.length || 1;
        let startStt = currentRows;

        const rows = list.map((item, idx) => [
          startStt + idx,
          item.title,
          item.category,
          item.description,
          item.type,
          item.link,
          nowVN,
          '🟢 HOẠT ĐỘNG'
        ]);

        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${tabTitle}!A:H`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: rows }
        });
        totalAdded += rows.length;
      } catch (e) {
        console.error(`Ghi tab ${tabTitle} lỗi:`, e.message);
      }
    }

    // 6. Thông báo Telegram
    if (totalAdded > 0) {
      await notifyTelegram(
        `🎁 <b>[Vercel Cron] Cập Nhật Kho Tài Nguyên</b>\n\n` +
        `✅ Đã tự động lọc link chết và nạp thêm <b>+${totalAdded} tài nguyên mới</b> lên Google Sheet!\n` +
        `📅 Thời gian: ${nowVN}\n\n` +
        `👉 <a href="https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit">Bấm vào đây để mở Google Sheet</a>`
      );
    }

    return res.status(200).json({
      success: true,
      added: totalAdded,
      checked: itemsToCheck.length,
      aliveCount: aliveItems.length
    });
  } catch (error) {
    console.error('[Vercel Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
