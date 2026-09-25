/**
 * MLC · Webinar "Come scegliere i colori giusti nelle tue presentazioni"
 * Vercel Serverless Function — iscrizione + ActiveCampaign
 *
 * ENV VARS da configurare su Vercel (Production + Preview):
 *   AC_API_URL      es. https://mlcpresentations.api-us1.com
 *   AC_API_KEY      chiave API ActiveCampaign
 *   AC_LIST_NAME    WEBINARS
 *   ALLOWED_ORIGIN  https://webinar-colori-mlc.vercel.app
 *   SETUP_TOKEN     stringa a caso, serve solo per /api/webinar-handler?setup=1&token=...
 *
 * Tag applicati:
 *   [registered] 2026_10_06_Colors_ITA
 *   [registered] 2026_10_06_Colors_ENG
 *
 * NOTA: la logica del tag è delete + re-add. NON semplificarla: ActiveCampaign
 * è idempotente sul POST contactTag, quindi al secondo invio l'automation con
 * trigger "Tag is added" non ripartirebbe.
 */

const AC_URL = (process.env.AC_API_URL || '').replace(/\/+$/, '');
const AC_KEY = process.env.AC_API_KEY || '';
const LIST_NAME = process.env.AC_LIST_NAME || 'WEBINARS';

const TAGS = {
  ITA: '[registered] 2026_10_06_Colors_ITA',
  ENG: '[registered] 2026_10_06_Colors_ENG'
};

async function ac(path, options = {}) {
  const res = await fetch(`${AC_URL}/api/3${path}`, {
    ...options,
    headers: {
      'Api-Token': AC_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (e) { body = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`AC ${res.status} on ${path}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

/* ---------- lookup / creazione lista e tag ---------- */

async function resolveListId(name) {
  const data = await ac(`/lists?filters[name]=${encodeURIComponent(name)}`);
  const found = (data.lists || []).find(l => l.name === name);
  if (found) return found.id;
  const created = await ac('/lists', {
    method: 'POST',
    body: JSON.stringify({ list: { name, stringid: name.toLowerCase().replace(/\s+/g, '-'), sender_url: 'https://mlcpresentations.com', sender_reminder: 'Ti sei iscritto a un webinar MLC.' } })
  });
  return created.list.id;
}

async function resolveTagId(name) {
  const data = await ac(`/tags?search=${encodeURIComponent(name)}`);
  const found = (data.tags || []).find(t => t.tag === name);
  if (found) return found.id;
  const created = await ac('/tags', {
    method: 'POST',
    body: JSON.stringify({ tag: { tag: name, tagType: 'contact', description: 'Webinar colori 06/10/2026' } })
  });
  return created.tag.id;
}

/* ---------- handler ---------- */

module.exports = async (req, res) => {
  const origin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // --- setup one-shot: crea/risolve lista e tag, poi riporta gli id ---
  if (req.method === 'GET' && req.query.setup === '1') {
    if (!process.env.SETUP_TOKEN || req.query.token !== process.env.SETUP_TOKEN) {
      return res.status(403).json({ error: 'forbidden' });
    }
    try {
      const listId = await resolveListId(LIST_NAME);
      const tagIta = await resolveTagId(TAGS.ITA);
      const tagEng = await resolveTagId(TAGS.ENG);
      return res.status(200).json({ ok: true, listId, tagIta, tagEng });
    } catch (e) {
      return res.status(500).json({ error: e.message, detail: e.body });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  if (!AC_URL || !AC_KEY) {
    return res.status(500).json({ error: 'ActiveCampaign non configurato' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const firstName = (body.firstName || '').trim();
    const lastName = (body.lastName || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const role = (body.role || '').trim();
    const company = (body.company || '').trim();
    const lang = body.lang === 'ENG' ? 'ENG' : 'ITA';

    if (!firstName || !lastName || !role || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'dati mancanti o non validi' });
    }

    // 1. upsert contatto
    const sync = await ac('/contact/sync', {
      method: 'POST',
      body: JSON.stringify({
        contact: { email, firstName, lastName, fieldValues: [] }
      })
    });
    const contactId = sync.contact.id;

    // 2. lista WEBINARS
    const listId = await resolveListId(LIST_NAME);
    await ac('/contactLists', {
      method: 'POST',
      body: JSON.stringify({ contactList: { list: listId, contact: contactId, status: 1 } })
    });

    // 3. tag: delete + re-add per ri-triggerare l'automation
    const tagName = TAGS[lang];
    const tagId = await resolveTagId(tagName);

    const existing = await ac(`/contacts/${contactId}/contactTags`);
    const match = (existing.contactTags || []).find(ct => String(ct.tag) === String(tagId));
    if (match) {
      await ac(`/contactTags/${match.id}`, { method: 'DELETE' });
    }
    await ac('/contactTags', {
      method: 'POST',
      body: JSON.stringify({ contactTag: { contact: contactId, tag: tagId } })
    });

    return res.status(200).json({ ok: true, contactId, tag: tagName, role, company });
  } catch (e) {
    console.error('webinar-handler', e.message, e.body);
    return res.status(500).json({ error: 'registration failed' });
  }
};
