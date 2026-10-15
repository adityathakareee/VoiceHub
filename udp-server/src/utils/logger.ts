export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
}

class UdpLogger {
  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [UDP] ${message}`;
  }

  public info(message: string): void {
    console.log(this.formatMessage(LogLevel.INFO, message));
  }

  public warn(message: string): void {
    console.warn(this.formatMessage(LogLevel.WARN, message));
  }

  public error(message: string, error?: unknown): void {
    const errorMessage = error instanceof Error ? `${message} - ${error.message}` : message;
    console.error(this.formatMessage(LogLevel.ERROR, errorMessage));
    if (error instanceof Error && error.stack && process.env.NODE_ENV !== 'production') {
      console.error(error.stack);
    }
  }

  public debug(message: string): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(this.formatMessage(LogLevel.DEBUG, message));
    }
  }
}

export const logger = new UdpLogger();
