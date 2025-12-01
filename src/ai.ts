/**
 * AI 智能分析模块
 */
import { AI_CONFIG } from './config';
import { delay } from './utils';
import { NoteInfo } from './types';

/** 调用 AI API */
export async function callAI(prompt: string, systemPrompt?: string): Promise<string> {
  // 检查 API Key 是否配置
  if (!AI_CONFIG.isConfigured) {
    console.log('   🧠 [AI] ⚠️ 未配置 API Key，跳过 AI 分析');
    return '';
  }
  
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: prompt }
  ];

  for (let attempt = 0; attempt <= AI_CONFIG.RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.TIMEOUT);

      const response = await fetch(`${AI_CONFIG.API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_CONFIG.API_KEY}`
        },
        body: JSON.stringify({
          model: AI_CONFIG.MODEL,
          messages,
          stream: false,
          max_tokens: 1000,
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (error: any) {
      const isLastAttempt = attempt === AI_CONFIG.RETRIES;
      if (isLastAttempt) {
        console.log(`   🧠 [AI] ⚠️ 调用失败: ${error.message || '网络错误'}`);
        return '';
      }
      console.log(`   🧠 [AI] 重试 ${attempt + 1}/${AI_CONFIG.RETRIES}...`);
      await delay(2000);
    }
  }
  return '';
}

/** AI 生成智能报告 */
export async function generateAIReport(notes: NoteInfo[]): Promise<string> {
  if (notes.length === 0) {
    return '今日未采集到有效内容。';
  }

  console.log('[AI] 🧠 正在生成智能分析...');

  const noteSummaries = notes.slice(0, 6).map((n, i) => {
    let summary = `【${i + 1}】${n.title}\n`;
    summary += `内容: ${n.content.substring(0, 200)}`;
    if (n.fullContent && n.fullContent.includes('[OCR Content]')) {
      const ocrPart = n.fullContent.split('[OCR Content]')[1]?.substring(0, 200) || '';
      summary += `\n图片文字: ${ocrPart}`;
    }
    return summary;
  }).join('\n\n');

  const prompt = `分析以下 ${notes.length} 篇小红书面试笔记，生成简洁报告：

${noteSummaries}

请用 Markdown 格式输出：
1. **核心面试题** (提取2-3个具体问题)
2. **技术热点** (涉及的技术栈)
3. **复习建议** (1-2条)

控制在 200 字以内，直接输出内容。`;

  try {
    const report = await callAI(prompt);
    if (report) {
      console.log('[AI] 🧠 ✅ 分析完成');
      return report;
    }
  } catch (error: any) {
    console.log(`[AI] 🧠 ⚠️ 分析失败: ${error.message || '未知错误'}`);
  }

  return `*[AI 分析待补充]*\n\n本次采集了 ${notes.length} 篇笔记，请人工查看 \`data/interview_questions.json\` 进行分析。`;
}
