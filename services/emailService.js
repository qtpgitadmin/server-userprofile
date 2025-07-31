import AWS from 'aws-sdk';

class EmailService {
  constructor() {
    // Configure AWS SES
    this.ses = new AWS.SES({
      region: process.env.AWS_REGION || 'ap-south-1'
    });
  }

  async sendVerificationCode(recipientEmail, verificationCode, requesterEmail, userId) {
    try {
      console.log('Sending verification code via AWS SES:', {
        recipientEmail,
        verificationCode,
        requesterEmail,
        userId
      });

      const params = {
        Source: process.env.FROM_EMAIL || 'noreply@dintak.com',
        Destination: {
          ToAddresses: [recipientEmail]
        },
        Message: {
          Subject: {
            Data: 'Verification Code Request',
            Charset: 'UTF-8'
          },
          Body: {
            Html: {
              Data: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #333; margin-bottom: 10px;">Verification Code Request</h1>
                    <div style="height: 3px; background: linear-gradient(90deg, #007bff, #0056b3); margin: 0 auto; width: 100px;"></div>
                  </div>
                  
                  <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; margin-bottom: 25px;">
                    <p style="margin: 0 0 15px 0; font-size: 16px; color: #333;">Hello,</p>
                    <p style="margin: 0 0 15px 0; font-size: 16px; color: #333;">
                      A verification code has been requested by user <strong style="color: #007bff;">${userId}</strong> (${requesterEmail}).
                    </p>
                  </div>

                  <div style="text-align: center; margin: 30px 0;">
                    <p style="margin: 0 0 15px 0; font-size: 18px; color: #333; font-weight: bold;">Your verification code is:</p>
                    <div style="background: linear-gradient(135deg, #007bff, #0056b3); padding: 25px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 15px rgba(0, 123, 255, 0.3);">
                      <div style="color: white; font-size: 36px; font-weight: bold; letter-spacing: 8px; font-family: 'Courier New', monospace;">${verificationCode}</div>
                    </div>
                  </div>

                  <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 25px 0;">
                    <h3 style="color: #856404; margin: 0 0 15px 0; font-size: 16px;">⚠️ Important Security Information:</h3>
                    <ul style="margin: 0; padding-left: 20px; color: #856404;">
                      <li style="margin-bottom: 8px;">This code will expire in <strong>10 minutes</strong></li>
                      <li style="margin-bottom: 8px;">You have a maximum of <strong>3 attempts</strong> to verify</li>
                      <li style="margin-bottom: 8px;">Do not share this code with anyone</li>
                      <li>If you didn't expect this verification, please ignore this email</li>
                    </ul>
                  </div>

                  <div style="text-align: center; margin: 30px 0;">
                    <p style="color: #666; font-size: 14px; margin: 0;">
                      Need help? Contact our support team at 
                      <a href="mailto:support@dintak.com" style="color: #007bff; text-decoration: none;">support@dintak.com</a>
                    </p>
                  </div>

                  <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                  <div style="text-align: center;">
                    <p style="color: #999; font-size: 12px; margin: 0;">
                      This is an automated message from the Dintak Verification System.<br>
                      Please do not reply to this email.
                    </p>
                    <p style="color: #999; font-size: 11px; margin: 10px 0 0 0;">
                      © ${new Date().getFullYear()} Dintak. All rights reserved.
                    </p>
                  </div>
                </div>
              `,
              Charset: 'UTF-8'
            },
            Text: {
              Data: `
Verification Code Request

Hello,

A verification code has been requested by user ${userId} (${requesterEmail}).

Your verification code is: ${verificationCode}

Important:
- This code will expire in 10 minutes
- You have maximum 3 attempts to verify
- Do not share this code with anyone

If you didn't expect this verification, please ignore this email.

This is an automated message. Please do not reply to this email.
              `,
              Charset: 'UTF-8'
            }
          }
        }
      };

      console.log('SES sendEmail params:', JSON.stringify(params, null, 2));
      const result = await this.ses.sendEmail(params).promise();
      console.log('Verification email sent via AWS SES:', result.MessageId);
      
      return { 
        success: true, 
        messageId: result.MessageId,
        provider: 'AWS SES'
      };
    } catch (error) {
      console.error('Error sending verification email via AWS SES:', error);
      return { 
        success: false, 
        error: error.message,
        provider: 'AWS SES'
      };
    }
  }

  async testConnection() {
    try {
      // Test SES connection by getting send quota
      const quota = await this.ses.getSendQuota().promise();
      console.log('AWS SES is ready. Send quota:', quota);
      return true;
    } catch (error) {
      console.error('AWS SES connection failed:', error);
      return false;
    }
  }
}

export default new EmailService();