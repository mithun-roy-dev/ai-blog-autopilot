import * as fs from 'fs';
import * as path from 'path';

// Logs directory: unified root logs/
const LOGS_DIR = path.resolve(__dirname, '../../../logs');
const ERROR_LOG = path.join(LOGS_DIR, 'error_log.txt');
const DEBUG_LOG = path.join(LOGS_DIR, 'debug_log.txt');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function timestamp(): string {
    return new Date().toISOString();
}

function formatLine(level: string, context: string, message: string, extra?: any): string {
    const ts = timestamp();
    let line = `[${ts}] [${level}] [${context}] ${message}`;
    if (extra !== undefined) {
        try {
            line += ' | ' + (typeof extra === 'string' ? extra : JSON.stringify(extra, null, 0));
        } catch {
            line += ' | [Unserializable data]';
        }
    }
    return line + '\n';
}

function writeToFile(filePath: string, content: string) {
    try {
        fs.appendFileSync(filePath, content, 'utf8');
    } catch (err) {
        // Fallback: just console.error if file write fails
        console.error('[Logger] Failed to write to log file:', err);
    }
}

export const Logger = {
    /**
     * Log a debug message. Writes to debug_log.txt and also console.log.
     */
    debug(context: string, message: string, extra?: any) {
        const line = formatLine('DEBUG', context, message, extra);
        console.log(line.trim());
        writeToFile(DEBUG_LOG, line);
    },

    /**
     * Log an info message. Writes to debug_log.txt and also console.log.
     */
    info(context: string, message: string, extra?: any) {
        const line = formatLine('INFO', context, message, extra);
        console.log(line.trim());
        writeToFile(DEBUG_LOG, line);
    },

    /**
     * Log a warning. Writes to both debug_log.txt and error_log.txt.
     */
    warn(context: string, message: string, extra?: any) {
        const line = formatLine('WARN', context, message, extra);
        console.warn(line.trim());
        writeToFile(DEBUG_LOG, line);
        writeToFile(ERROR_LOG, line);
    },

    /**
     * Log an error. Writes to both debug_log.txt and error_log.txt.
     */
    error(context: string, message: string, error?: any) {
        const errorDetail = error instanceof Error
            ? { message: error.message, stack: error.stack }
            : error;
        const line = formatLine('ERROR', context, message, errorDetail);
        console.error(line.trim());
        writeToFile(DEBUG_LOG, line);
        writeToFile(ERROR_LOG, line);
    },

    /**
     * Log the start of a job step (debug level).
     */
    stepStart(jobId: string, stepId: string) {
        Logger.info(`Job:${jobId}`, `▶️ Step started: ${stepId}`);
    },

    /**
     * Log the successful completion of a job step.
     */
    stepDone(jobId: string, stepId: string, durationMs?: number) {
        const dur = durationMs !== undefined ? ` (${durationMs}ms)` : '';
        Logger.info(`Job:${jobId}`, `✅ Step completed: ${stepId}${dur}`);
    },

    /**
     * Log a step failure.
     */
    stepFail(jobId: string, stepId: string, error: any) {
        Logger.error(`Job:${jobId}`, `❌ Step failed: ${stepId}`, error);
    },

    /**
     * Return the paths for reference.
     */
    paths() {
        return { errorLog: ERROR_LOG, debugLog: DEBUG_LOG, logsDir: LOGS_DIR };
    }
};
