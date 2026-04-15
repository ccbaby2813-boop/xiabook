#!/usr/bin/env node

/**
 * 日志分析脚本
 * 分析 logs 目录下的日志文件，统计错误和警告
 */

const fs = require('fs');
const path = require('path');

class LogAnalyzer {
    constructor() {
        this.logDirs = [
            '/home/admin/.openclaw/logs',
            path.join(__dirname, '../logs')
        ];
        this.patterns = {
            error: /\b(ERROR|ERR|FATAL|Exception|Error:|失败|异常)\b/gi,
            warn: /\b(WARN|WARNING|警告)\b/gi,
            timestamp: /\[(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/
        };
    }

    /**
     * 获取所有日志文件
     */
    getLogFiles() {
        const files = [];
        for (const dir of this.logDirs) {
            if (fs.existsSync(dir)) {
                const list = fs.readdirSync(dir)
                    .filter(f => f.endsWith('.log'))
                    .map(f => path.join(dir, f));
                files.push(...list);
            }
        }
        return files;
    }

    /**
     * 分析单个日志文件
     */
    analyzeFile(filePath) {
        const result = {
            file: path.basename(filePath),
            path: filePath,
            errors: 0,
            warnings: 0,
            errorLines: [],
            warnLines: [],
            size: 0
        };

        try {
            const stats = fs.statSync(filePath);
            result.size = stats.size;

            // 只读取最后 10000 行
            const content = this.readLastLines(filePath, 10000);
            const lines = content.split('\n');

            for (const line of lines) {
                // 统计错误
                const errorMatch = line.match(this.patterns.error);
                if (errorMatch) {
                    result.errors++;
                    if (result.errorLines.length < 20) {
                        result.errorLines.push(line.substring(0, 200));
                    }
                }

                // 统计警告
                const warnMatch = line.match(this.patterns.warn);
                if (warnMatch) {
                    result.warnings++;
                    if (result.warnLines.length < 10) {
                        result.warnLines.push(line.substring(0, 200));
                    }
                }
            }
        } catch (err) {
            result.error = err.message;
        }

        return result;
    }

    /**
     * 读取文件最后 N 行
     */
    readLastLines(filePath, maxLines) {
        const fd = fs.openSync(filePath, 'r');
        const stats = fs.fstatSync(fd);
        const bufferSize = 1024;
        const buffer = Buffer.alloc(bufferSize);
        let lines = [];
        let position = stats.size;
        let lineBuffer = '';

        while (position > 0 && lines.length < maxLines) {
            const readSize = Math.min(bufferSize, position);
            position -= readSize;
            fs.readSync(fd, buffer, 0, readSize, position);
            const chunk = buffer.toString('utf8', 0, readSize);
            lineBuffer = chunk + lineBuffer;
            lines = lineBuffer.split('\n');
        }

        fs.closeSync(fd);
        return lines.slice(-maxLines).join('\n');
    }

    /**
     * 按错误类型分类
     */
    categorizeErrors(results) {
        const categories = {};
        for (const r of results) {
            for (const line of r.errorLines) {
                // 提取错误类型
                const typeMatch = line.match(/Error:\s*(\w+)/i) || 
                                  line.match(/(\w+Error)/i) ||
                                  line.match(/(\w+Exception)/i);
                if (typeMatch) {
                    const type = typeMatch[1];
                    categories[type] = (categories[type] || 0) + 1;
                } else {
                    categories['Other'] = (categories['Other'] || 0) + 1;
                }
            }
        }
        return categories;
    }

    /**
     * 执行分析
     */
    analyze() {
        console.log('开始日志分析...\n');

        const files = this.getLogFiles();
        console.log(`找到 ${files.length} 个日志文件\n`);

        const results = files.map(f => this.analyzeFile(f));
        
        // 汇总
        const summary = {
            total_errors: results.reduce((sum, r) => sum + r.errors, 0),
            total_warnings: results.reduce((sum, r) => sum + r.warnings, 0),
            files_analyzed: files.length,
            total_size: results.reduce((sum, r) => sum + r.size, 0)
        };

        // 按错误类型分类
        const errorsByType = this.categorizeErrors(results);

        // 最近的错误
        const recentErrors = results
            .flatMap(r => r.errorLines.map(l => ({ file: r.file, line: l })))
            .slice(0, 10);

        const report = {
            timestamp: new Date().toISOString(),
            summary,
            errors_by_type: errorsByType,
            files: results.map(r => ({
                file: r.file,
                errors: r.errors,
                warnings: r.warnings,
                size_mb: (r.size / 1024 / 1024).toFixed(2)
            })),
            recent_errors: recentErrors
        };

        // 输出报告
        console.log('========== 分析报告 ==========');
        console.log(`总错误数: ${summary.total_errors}`);
        console.log(`总警告数: ${summary.total_warnings}`);
        console.log(`分析文件: ${summary.files_analyzed} 个`);
        console.log(`总大小: ${(summary.total_size / 1024 / 1024).toFixed(2)} MB\n`);

        if (Object.keys(errorsByType).length > 0) {
            console.log('错误类型分布:');
            for (const [type, count] of Object.entries(errorsByType).sort((a, b) => b[1] - a[1])) {
                console.log(`  ${type}: ${count}`);
            }
        }

        if (recentErrors.length > 0) {
            console.log('\n最近错误 (前5条):');
            recentErrors.slice(0, 5).forEach((e, i) => {
                console.log(`  [${i + 1}] ${e.file}: ${e.line.substring(0, 100)}...`);
            });
        }

        return report;
    }
}

// 执行
if (require.main === module) {
    const analyzer = new LogAnalyzer();
    const report = analyzer.analyze();
    console.log('\n========== JSON 报告 ==========');
    console.log(JSON.stringify(report, null, 2));
}

module.exports = LogAnalyzer;