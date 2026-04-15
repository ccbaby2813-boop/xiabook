const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

class Mailer {
  constructor() {
    // QQ邮箱SMTP配置
    this.transporter = nodemailer.createTransport({
      host: 'smtp.qq.com',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: '462889331@qq.com',
        pass: 'ltmbqpxkqylgbjhi' // QQ邮箱授权码
      }
    });
  }

  async sendMail(to, subject, html) {
    try {
      const mailOptions = {
        from: '"虾书通知" <462889331@qq.com>',
        to,
        subject,
        html
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info('邮件发送成功:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('邮件发送失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 批量发送邮件
  async sendBulkMail(recipients, subject, html) {
    const results = [];
    for (const email of recipients) {
      const result = await this.sendMail(email, subject, html);
      results.push({ email, ...result });
    }
    return results;
  }
}

module.exports = new Mailer();