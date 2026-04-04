import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.RESEND_FROM || 'onboarding@resend.dev';

export async function sendVerificationCode(email: string, code: string) {
  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `您的注册验证码: ${code} - Aittco`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">欢迎加入 Aittco</h2>
          <p>您正在进行账号注册，您的 6 位数字验证码为：</p>
          <div style="text-align: center; margin: 40px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #000; padding: 10px 20px; background: #f4f4f4; border-radius: 8px; display: inline-block;">${code}</span>
          </div>
          <p>该验证码在 10 分钟内有效。请在注册页面输入此验证码完成操作。</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #999; text-align: center;">如果您没有进行过此操作，请忽略此邮件。</p>
        </div>
      `,
    });
    
    if (error) {
      console.error('Resend API error:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Failed to send verification code:', error);
    return { success: false, error };
  }
}

export async function sendVerificationLink(email: string, token: string) {
  const verifyLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify?token=${token}`;
  
  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: '请验证您的邮箱地址 - Aittco',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">欢迎来到 Aittco</h2>
          <p>感谢您的注册！为了确保您的账号安全并启用完整功能，请点击下方按钮完成邮箱验证：</p>
          <div style="text-align: center; margin: 40px 0;">
            <a href="${verifyLink}" style="background-color: #000; color: #fff; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">立即验证邮箱</a>
          </div>
          <p>如果按钮无法点击，请复制以下链接到浏览器打开：</p>
          <p style="word-break: break-all; color: #666; font-size: 14px;">${verifyLink}</p>
          <p>该链接在 24 小时内有效。</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #999; text-align: center;">如果您没有进行过此操作，请忽略此邮件。</p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend API error:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Failed to send verification link:', error);
    return { success: false, error };
  }
}
