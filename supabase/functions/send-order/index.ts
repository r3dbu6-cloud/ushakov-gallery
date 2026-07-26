import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const TO_EMAIL = 'slavaushy@gmail.com';
const CC_EMAIL = 'olegkaraev@gmail.com';
const FROM_EMAIL = 'gallery@slavaushakov.gallery';
const EMAIL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => HTML_ESCAPE_MAP[character]);
}

function isValidEmail(value: string) {
  const localPart = value.split('@')[0] || '';
  return (
    value.length <= 254 &&
    localPart.length <= 64 &&
    !localPart.startsWith('.') &&
    !localPart.endsWith('.') &&
    !localPart.includes('..') &&
    EMAIL_PATTERN.test(value)
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
    const painting_id = Number.isInteger(body.painting_id) ? body.painting_id : null;
    const painting_title = typeof body.painting_title === 'string' ? body.painting_title.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!name) {
      return new Response(JSON.stringify({ error: 'name is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!isValidEmail(contact)) {
      return new Response(JSON.stringify({ error: 'valid email is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 1. Save to Supabase
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: order, error: dbError } = await sb
      .from('orders')
      .insert({ name, contact, painting_id: painting_id || null, painting_title: painting_title || null, message: message || null })
      .select()
      .single();

    if (dbError) throw new Error('DB error: ' + dbError.message);
    console.log('Order saved:', order.id);

    // 2. Send email via Resend
    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set, skipping email');
      return new Response(JSON.stringify({ success: true, order_id: order.id, email: 'skipped' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const safeName = escapeHtml(name);
    const safeContact = escapeHtml(contact);
    const safePaintingTitle = escapeHtml(painting_title);
    const safeMessage = escapeHtml(message);

    const emailHtml = `
      <h2>Новая заявка с сайта галереи</h2>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;font-weight:bold;background:#f5f0e8">Имя</td><td style="padding:8px">${safeName}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;background:#f5f0e8">Email</td><td style="padding:8px">${safeContact}</td></tr>
        ${painting_title ? `<tr><td style="padding:8px;font-weight:bold;background:#f5f0e8">Работа</td><td style="padding:8px">${safePaintingTitle}</td></tr>` : ''}
        ${message ? `<tr><td style="padding:8px;font-weight:bold;background:#f5f0e8">Сообщение</td><td style="padding:8px">${safeMessage}</td></tr>` : ''}
        <tr><td style="padding:8px;font-weight:bold;background:#f5f0e8">ID заявки</td><td style="padding:8px">#${order.id}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;background:#f5f0e8">Дата</td><td style="padding:8px">${new Date().toLocaleString('ru-RU')}</td></tr>
      </table>
      <p style="margin-top:16px;color:#8b6f47;font-size:13px">Ответить: <a href="mailto:${safeContact}">${safeContact}</a></p>
    `;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        cc: [CC_EMAIL],
        subject: `Заявка #${order.id}: ${painting_title || 'Общий запрос'} — ${name}`,
        html: emailHtml,
      })
    });

    const resendData = await resendRes.json();
    console.log('Resend status:', resendRes.status, JSON.stringify(resendData));

    if (!resendRes.ok) {
      // Email failed but order is saved — return success with warning
      return new Response(JSON.stringify({ success: true, order_id: order.id, email_error: resendData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, order_id: order.id, email_id: resendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('send-order error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
