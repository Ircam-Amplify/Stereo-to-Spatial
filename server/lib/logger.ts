import chalk from "chalk";

type LogLevel = "info" | "warn" | "error" | "debug";

function getTimestamp() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatMessage(level: LogLevel, context: string, message: string) {
  const timestamp = getTimestamp();
  const colorize = {
    info: chalk.blue,
    warn: chalk.yellow,
    error: chalk.red,
    debug: chalk.gray,
  }[level];

  return `${chalk.gray(timestamp)} ${colorize(`[${level.toUpperCase()}]`)} ${chalk.cyan(`[${context}]`)} ${message}`;
}

export const logger = {
  info: (context: string, message: string) => console.log(formatMessage("info", context, message)),
  warn: (context: string, message: string) => console.log(formatMessage("warn", context, message)),
  error: (context: string, message: string | Error) => {
    const errorMessage = message instanceof Error ? message.message : message;
    console.error(formatMessage("error", context, errorMessage));
    if (message instanceof Error && message.stack) {
      console.error(chalk.red(message.stack));
    }
  },
  debug: (context: string, message: string) => {
    if (process.env.NODE_ENV === "development") {
      console.log(formatMessage("debug", context, message));
    }
  },
  request: (req: any, res: any, duration: number) => {
    const { method, path } = req;
    const { statusCode } = res;
    const color = statusCode >= 500 ? chalk.red : statusCode >= 400 ? chalk.yellow : chalk.green;
    
    let logMessage = `${method} ${path} ${color(statusCode)} ${duration}ms`;
    
    // Add request body for debugging (exclude passwords)
    if (process.env.NODE_ENV === "development" && req.body) {
      const sanitizedBody = { ...req.body };
      if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';
      logMessage += `\n  ${chalk.gray('Request:')} ${JSON.stringify(sanitizedBody)}`;
    }
    
    console.log(formatMessage("info", "HTTP", logMessage));
  }
};
