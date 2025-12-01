/**
 * 日志模块 - 替代 console.log
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export class Logger {
  private level: LogLevel = LogLevel.INFO;
  private prefix: string;

  constructor(prefix: string = '') {
    this.prefix = prefix;
    // 从环境变量读取日志级别
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLevel && LogLevel[envLevel as keyof typeof LogLevel] !== undefined) {
      this.level = LogLevel[envLevel as keyof typeof LogLevel];
    }
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (level <= this.level) {
      const timestamp = new Date().toISOString().slice(11, 19);
      const levelStr = LogLevel[level].padEnd(5);
      const fullMessage = `[${timestamp}] [${levelStr}]${this.prefix ? ` [${this.prefix}]` : ''} ${message}`;
      
      switch (level) {
        case LogLevel.ERROR:
          console.error(fullMessage, ...args);
          break;
        case LogLevel.WARN:
          console.warn(fullMessage, ...args);
          break;
        default:
          console.log(fullMessage, ...args);
      }
    }
  }

  error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }
}

// 默认日志实例
export const logger = new Logger();
