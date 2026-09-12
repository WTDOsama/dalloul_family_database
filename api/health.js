// ===========================================================================
// /api/health — فحص جاهزية الخادم (لا يكشف أي معلومات حساسة)
// ===========================================================================
import { isServerConfigured } from './_lib/admin.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    service: 'daloul-orphans-db',
    supabase_server_configured: isServerConfigured(),
    time: new Date().toISOString(),
  });
}
