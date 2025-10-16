import AWS from 'aws-sdk';

class JobEmailService {
  constructor() {
    // Configure AWS SES
    this.ses = new AWS.SES({
      region: process.env.AWS_REGION || 'ap-south-1'
    });
  }

  /**
   * Send an email with optional attachment using AWS SES.
   * @param {string} toEmail - Recipient email address.
   * @param {string} fromEmail - Sender email address.
   * @param {string} subject - Email subject.
   * @param {string} body - Email body (HTML).
   * @param {Object} [attachment] - Optional attachment object: { filename, content (Buffer), contentType }
   */
  async sendEmailWithAttachment(toEmail, fromEmail, subject, body, attachment) {
    try {
      // If no attachment, use SES sendEmail (simple)
      if (!attachment) {
        const params = {
          Source: fromEmail,
          Destination: { ToAddresses: [toEmail] },
          Message: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: body, Charset: 'UTF-8' },
              Text: { Data: body.replace(/<[^>]+>/g, ''), Charset: 'UTF-8' }
            }
          }
        };
        const result = await this.ses.sendEmail(params).promise();
        return { success: true, messageId: result.MessageId, provider: 'AWS SES' };
      }

      // With attachment: use sendRawEmail
      const boundary = `----=_Part_${Date.now()}`;
      let rawMessage = [
        `From: ${fromEmail}`,
        `To: ${toEmail}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: 7bit',
        '',
        body,
        '',
        `--${boundary}`,
        `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        '',
        attachment.content.toString('base64'),
        '',
        `--${boundary}--`
      ].join('\r\n');

      const params = {
        RawMessage: { Data: Buffer.from(rawMessage) }
      };

      const result = await this.ses.sendRawEmail(params).promise();
      return { success: true, messageId: result.MessageId, provider: 'AWS SES' };
    } catch (error) {
      console.error('Error sending job email via AWS SES:', error);
      return { success: false, error: error.message, provider: 'AWS SES' };
    }
  }
}