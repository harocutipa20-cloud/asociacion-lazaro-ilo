const json = (response, status, payload) => response.status(status).json(payload);

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'Método no permitido.' });
  }

  try {
    const source = typeof request.body === 'string' ? JSON.parse(request.body) : (request.body || {});
    const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
    const donor = {
      name: clean(source.name, 120),
      email: clean(source.email, 160).toLowerCase(),
      amount: clean(source.amount, 40),
      purpose: clean(source.purpose, 120),
      message: clean(source.message, 1000)
    };

    if (!donor.name || !/^\S+@\S+\.\S+$/.test(donor.email) || !donor.amount || !donor.purpose) {
      return json(response, 400, { error: 'Completa los campos obligatorios con información válida.' });
    }

    const { SUPABASE_URL, SUPABASE_SECRET_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL, DONATION_NOTIFICATION_EMAIL } = process.env;
    const required = { SUPABASE_URL, SUPABASE_SECRET_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL, DONATION_NOTIFICATION_EMAIL };
    const missing = Object.entries(required).filter(([, value]) => !value || !value.trim()).map(([key]) => key);

    if (missing.length) {
      console.error('Missing donation configuration:', missing.join(', '));
      return json(response, 503, { error: `El formulario está en configuración. Falta: ${missing.join(', ')}.` });
    }

    const database = await fetch(`${SUPABASE_URL}/rest/v1/donation_requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        donor_name: donor.name,
        donor_email: donor.email,
        amount: donor.amount,
        purpose: donor.purpose,
        message: donor.message
      })
    });

    if (!database.ok) {
      console.error('Supabase error:', await database.text());
      return json(response, 502, { error: 'No fue posible registrar la solicitud. Inténtalo nuevamente más tarde.' });
    }

    try {
      const emailResult = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: RESEND_FROM_EMAIL,
          to: [DONATION_NOTIFICATION_EMAIL],
          reply_to: donor.email,
          subject: `Nueva intención de donación: ${donor.amount}`,
          text: `Nombre: ${donor.name}\nCorreo: ${donor.email}\nMonto aproximado: ${donor.amount}\nDestino: ${donor.purpose}\nMensaje: ${donor.message || 'Sin mensaje'}`
        })
      });
      if (!emailResult.ok) console.error('Resend error:', await emailResult.text());
    } catch (emailError) {
      console.error('Resend request failed:', emailError);
    }

    return json(response, 201, { ok: true });
  } catch (error) {
    console.error('Donation handler failed:', error);
    return json(response, 500, { error: 'No fue posible procesar la solicitud. Inténtalo nuevamente más tarde.' });
  }
}
