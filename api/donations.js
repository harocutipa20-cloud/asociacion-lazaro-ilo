export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método no permitido.' });
  }

  const { name, email, amount, purpose, message = '' } = request.body || {};
  const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const donor = { name: clean(name, 120), email: clean(email, 160).toLowerCase(), amount: clean(amount, 40), purpose: clean(purpose, 120), message: clean(message, 1000) };

  if (!donor.name || !/^\S+@\S+\.\S+$/.test(donor.email) || !donor.amount || !donor.purpose) {
    return response.status(400).json({ error: 'Completa los campos obligatorios con información válida.' });
  }

  const { SUPABASE_URL, SUPABASE_SECRET_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL, DONATION_NOTIFICATION_EMAIL } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !RESEND_API_KEY || !RESEND_FROM_EMAIL || !DONATION_NOTIFICATION_EMAIL) {
    return response.status(503).json({ error: 'El formulario está en configuración. Inténtalo nuevamente más tarde.' });
  }

  const database = await fetch(`${SUPABASE_URL}/rest/v1/donation_requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}`, Prefer: 'return=minimal' },
    body: JSON.stringify({ donor_name: donor.name, donor_email: donor.email, amount: donor.amount, purpose: donor.purpose, message: donor.message })
  });

  if (!database.ok) {
    console.error('Supabase error', await database.text());
    return response.status(500).json({ error: 'No fue posible registrar la solicitud.' });
  }

  const emailResult = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to: [DONATION_NOTIFICATION_EMAIL], reply_to: donor.email, subject: `Nueva intención de donación: ${donor.amount}`, text: `Nombre: ${donor.name}\nCorreo: ${donor.email}\nMonto aproximado: ${donor.amount}\nDestino: ${donor.purpose}\nMensaje: ${donor.message || 'Sin mensaje'}` })
  });

  if (!emailResult.ok) console.error('Resend error', await emailResult.text());
  return response.status(201).json({ ok: true });
}
