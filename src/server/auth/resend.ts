import { Resend } from 'resend';

const fromEmail = process.env.RESEND_FROM || 'onboarding@resend.dev';

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  return new Resend(apiKey);
}

export async function sendVerificationCode(email: string, code: string) {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.warn('RESEND_API_KEY is missing, skip sending verification code email.');
      return { success: false, error: 'RESEND_API_KEY is missing' };
    }

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `鎮ㄧ殑娉ㄥ唽楠岃瘉鐮? ${code} - Aittco`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">娆㈣繋鍔犲叆 Aittco</h2>
          <p>鎮ㄦ鍦ㄨ繘琛岃处鍙锋敞鍐岋紝鎮ㄧ殑 6 浣嶆暟瀛楅獙璇佺爜涓猴細</p>
          <div style="text-align: center; margin: 40px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #000; padding: 10px 20px; background: #f4f4f4; border-radius: 8px; display: inline-block;">${code}</span>
          </div>
          <p>璇ラ獙璇佺爜鍦?10 鍒嗛挓鍐呮湁鏁堛€傝鍦ㄦ敞鍐岄〉闈㈣緭鍏ユ楠岃瘉鐮佸畬鎴愭搷浣溿€?/p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #999; text-align: center;">濡傛灉鎮ㄦ病鏈夎繘琛岃繃姝ゆ搷浣滐紝璇峰拷鐣ユ閭欢銆?/p>
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
    const resend = getResendClient();
    if (!resend) {
      console.warn('RESEND_API_KEY is missing, skip sending verification link email.');
      return { success: false, error: 'RESEND_API_KEY is missing' };
    }

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: '璇烽獙璇佹偍鐨勯偖绠卞湴鍧€ - Aittco',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">娆㈣繋鏉ュ埌 Aittco</h2>
          <p>鎰熻阿鎮ㄧ殑娉ㄥ唽锛佷负浜嗙‘淇濇偍鐨勮处鍙峰畨鍏ㄥ苟鍚敤瀹屾暣鍔熻兘锛岃鐐瑰嚮涓嬫柟鎸夐挳瀹屾垚閭楠岃瘉锛?/p>
          <div style="text-align: center; margin: 40px 0;">
            <a href="${verifyLink}" style="background-color: #000; color: #fff; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">绔嬪嵆楠岃瘉閭</a>
          </div>
          <p>濡傛灉鎸夐挳鏃犳硶鐐瑰嚮锛岃澶嶅埗浠ヤ笅閾炬帴鍒版祻瑙堝櫒鎵撳紑锛?/p>
          <p style="word-break: break-all; color: #666; font-size: 14px;">${verifyLink}</p>
          <p>璇ラ摼鎺ュ湪 24 灏忔椂鍐呮湁鏁堛€?/p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #999; text-align: center;">濡傛灉鎮ㄦ病鏈夎繘琛岃繃姝ゆ搷浣滐紝璇峰拷鐣ユ閭欢銆?/p>
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

