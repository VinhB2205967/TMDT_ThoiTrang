const nodemailer = require('nodemailer');

let cachedTransporter = null;

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const raw = String(value).trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function getMailConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = toBool(process.env.SMTP_SECURE, port === 465);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const fromEmail = String(process.env.SMTP_FROM_EMAIL || user || '').trim();
  const fromName = String(process.env.SMTP_FROM_NAME || 'Fashion Store').trim();

  return {
    host,
    port,
    secure,
    user,
    pass,
    fromEmail,
    fromName,
    isReady: Boolean(host && port && user && pass && fromEmail)
  };
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const config = getMailConfig();
  if (!config.isReady) {
    cachedTransporter = nodemailer.createTransport({ jsonTransport: true });
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });

  return cachedTransporter;
}

function buildResetPasswordEmail({ userName, resetLink, minutes }) {
  const safeName = userName || 'báº¡n';
  const expireMinutes = Number(minutes || 15);
  const html = `
  <div style="font-family:Arial,sans-serif;background:#f6f8ff;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #e9eefc;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#4f46e5,#6366f1);padding:20px 24px;color:#fff;">
        <h2 style="margin:0;font-size:22px;">YÃªu cáº§u Ä‘áº·t láº¡i máº­t kháº©u</h2>
      </div>
      <div style="padding:24px;color:#1f2937;line-height:1.6;">
        <p style="margin-top:0;">Xin chÃ o <strong>${safeName}</strong>,</p>
        <p>Báº¡n vá»«a yÃªu cáº§u Ä‘áº·t láº¡i máº­t kháº©u cho tÃ i khoáº£n Fashion Store.</p>
        <p>Nháº¥n nÃºt bÃªn dÆ°á»›i Ä‘á»ƒ táº¡o máº­t kháº©u má»›i:</p>
        <p style="text-align:center;margin:24px 0;">
          <a href="${resetLink}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;">Äáº·t láº¡i máº­t kháº©u</a>
        </p>
        <p style="margin-bottom:8px;">LiÃªn káº¿t sáº½ háº¿t háº¡n sau <strong>${expireMinutes} phÃºt</strong>.</p>
        <p style="margin-top:0;color:#6b7280;font-size:13px;word-break:break-all;">Náº¿u nÃºt khÃ´ng hoáº¡t Ä‘á»™ng, hÃ£y sao chÃ©p link sau vÃ o trÃ¬nh duyá»‡t:<br>${resetLink}</p>
      </div>
    </div>
  </div>`;

  const text = [
    `Xin chÃ o ${safeName},`,
    'Báº¡n vá»«a yÃªu cáº§u Ä‘áº·t láº¡i máº­t kháº©u cho tÃ i khoáº£n Fashion Store.',
    `Vui lÃ²ng truy cáº­p link sau Ä‘á»ƒ Ä‘áº·t láº¡i máº­t kháº©u: ${resetLink}`,
    `LiÃªn káº¿t sáº½ háº¿t háº¡n sau ${expireMinutes} phÃºt.`
  ].join('\n');

  return { html, text };
}

async function sendResetPasswordEmail({ toEmail, userName, resetLink, minutes = 15 }) {
  const content = buildResetPasswordEmail({ userName, resetLink, minutes });
  return sendMail({
    to: toEmail,
    subject: 'Äáº·t láº¡i máº­t kháº©u - Fashion Store',
    text: content.text,
    html: content.html
  });
}

async function sendMail({ to, subject, text, html }) {
  const config = getMailConfig();
  const transporter = getTransporter();

  const info = await transporter.sendMail({
    from: config.fromEmail ? `"${config.fromName}" <${config.fromEmail}>` : undefined,
    to,
    subject,
    text,
    html
  });

  if (!config.isReady) {
    console.log('SMTP chÆ°a cáº¥u hÃ¬nh Ä‘áº§y Ä‘á»§. Ná»™i dung email reset Ä‘Ã£ Ä‘Æ°á»£c táº¡o (jsonTransport).');
    if (info && info.message) {
      console.log(String(info.message));
    }
  }

  return info;
}

module.exports = {
  getMailConfig,
  sendMail,
  sendResetPasswordEmail,
  buildResetPasswordEmail
};

