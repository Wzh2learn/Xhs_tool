/**
 * OCR 图片识别模块
 */
import { Page } from 'puppeteer';
import Tesseract from 'tesseract.js';
import { OCR_CONFIG } from './config';
import { delay, withTimeout } from './utils';

/** 从图片 URL 提取文字 (OCR) */
export async function extractTextFromImage(imageUrl: string): Promise<string> {
  try {
    console.log(`   👁️ [OCR] 识别图片: ${imageUrl.substring(0, 50)}...`);
    
    const ocrPromise = Tesseract.recognize(imageUrl, OCR_CONFIG.LANG, {
      logger: () => {}
    });
    
    const result = await withTimeout(ocrPromise, OCR_CONFIG.TIMEOUT, null);
    
    if (!result) {
      console.log(`   👁️ [OCR] ⏱️ 超时 (>${OCR_CONFIG.TIMEOUT/1000}s)，跳过此图`);
      return '';
    }
    
    const text = result.data.text.trim();
    if (text.length > 10) {
      console.log(`   👁️ [OCR] ✅ 识别到 ${text.length} 字`);
      return text;
    }
    return '';
  } catch (error: any) {
    console.log(`   👁️ [OCR] ⚠️ 识别失败: ${error.message || '未知错误'}`);
    return '';
  }
}

/** 从笔记图片中提取 OCR 内容 (截图方式) */
export async function extractOCRFromImages(page: Page): Promise<string> {
  console.log('   👁️ [OCR] 开始图片文字识别...');
  
  try {
    const imageElement = await page.$('.note-slider img, .carousel-image img, .swiper-slide img, [class*="media"] img');
    
    if (!imageElement) {
      console.log('   👁️ [OCR] 未找到图片元素');
      return '';
    }
    
    console.log('   👁️ [OCR] 找到图片，截图识别中...');
    
    const screenshotBuffer = await imageElement.screenshot({ encoding: 'binary' });
    
    if (!screenshotBuffer || screenshotBuffer.length === 0) {
      console.log('   👁️ [OCR] 截图失败');
      return '';
    }
    
    const ocrPromise = Tesseract.recognize(
      Buffer.from(screenshotBuffer),
      OCR_CONFIG.LANG,
      { logger: () => {} }
    );
    
    const result = await withTimeout(ocrPromise, OCR_CONFIG.TIMEOUT, null);
    
    if (!result) {
      console.log(`   👁️ [OCR] ⏱️ 超时 (>${OCR_CONFIG.TIMEOUT/1000}s)，跳过`);
      return '';
    }
    
    const text = result.data.text.trim();
    if (text.length > 10) {
      console.log(`   👁️ [OCR] ✅ 识别到 ${text.length} 字`);
      return '\n\n[OCR Content]\n' + text;
    }
    
    console.log('   👁️ [OCR] 识别文字太少，跳过');
    return '';
    
  } catch (error: any) {
    console.log(`   👁️ [OCR] ⚠️ 识别失败 (非致命): ${error.message || '未知错误'}`);
    return '';
  }
}

/** 模拟真人翻看图片 (多级选择器回退) */
export async function humanViewImages(page: Page): Promise<void> {
  console.log('   🖐️ [ViewImages] 模拟翻看图片...');
  
  try {
    const nextButtonSelectors = [
      '.carousel-next',
      '.swiper-button-next',
      '.note-slider-next',
      '.image-viewer-next',
      '.slider-arrow-right',
      '[aria-label="下一张"]',
      '[aria-label="next"]',
      '[aria-label="Next"]',
      'button[aria-label*="next" i]',
      'button[aria-label*="下一" i]',
      'button:has(svg[class*="right"])',
      'button:has(svg[class*="arrow"])',
      '[class*="next"]:has(svg)',
      '[class*="next"]',
      '[class*="arrow-right"]',
    ];
    
    let nextButton = null;
    let foundSelector = '';
    
    for (const sel of nextButtonSelectors) {
      try {
        nextButton = await page.$(sel);
        if (nextButton) {
          const isVisible = await nextButton.isVisible();
          if (isVisible) {
            foundSelector = sel;
            break;
          }
          nextButton = null;
        }
      } catch {
        continue;
      }
    }
    
    if (!nextButton) {
      console.log('   🖐️ [ViewImages] 无法翻页 (可能是单图笔记)，跳过');
      
      const imageArea = await page.$('.note-slider, .carousel, .swiper-container, [class*="media"]');
      if (imageArea) {
        await delay(1000 + Math.random() * 500);
        console.log('   🖐️ [ViewImages] 在图片区域停留 1s');
      }
      return;
    }
    
    console.log(`   🖐️ [ViewImages] 找到翻页按钮: ${foundSelector}`);
    
    const viewCount = 2 + Math.floor(Math.random() * 3);
    console.log(`   🖐️ [ViewImages] 将翻看 ${viewCount} 张图片`);
    
    let successClicks = 0;
    for (let i = 0; i < viewCount; i++) {
      try {
        await nextButton.click();
        successClicks++;
        const viewTime = 1000 + Math.random() * 1000;
        await delay(viewTime);
        console.log(`   🖐️ [ViewImages] 看第 ${i + 2} 张图 (${Math.round(viewTime/1000)}s)`);
      } catch {
        console.log(`   🖐️ [ViewImages] 已到最后一张 (共翻了 ${successClicks} 张)`);
        break;
      }
    }
    
  } catch (error: any) {
    console.log(`   🖐️ [ViewImages] 翻图失败 (非致命): ${error.message || ''}`);
  }
}
