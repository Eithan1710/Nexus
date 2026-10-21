// Supabase Edge Function: nx-reminders (Nexus smart reminders)
//
//   POST {action:'dispatch'}  header x-cron-secret   from pg_cron (job nx-reminders-dispatch, every
//                                                    minute while something is due): sends Web Push
//                                                    for due reminders and records the outcome.
//   POST {action:'test'}      Authorization: user JWT   sends a test notification to the caller's devices.
//   POST {action:'resubscribe', oldEndpoint, subscription}   from the service worker when the browser
//                                                    rotates a push subscription.
//   GET  ?vapid-public-key                            the public key browsers subscribe with.
//
// The VAPID key pair is generated on first use and kept in Vault (nx_vapid); the private key never
// leaves Supabase. Deployed with verify_jwt off because cron authenticates with its own secret.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import webpush from 'npm:web-push@3.6.7'
import { deliveryOutcome, classifyPushError, notificationPayload } from '../_shared/nx-delivery.js'

const cors: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' } })

function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

type Admin = SupabaseClient
type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; failure_count: number }

async function vapidKeys(admin: Admin): Promise<{ publicKey: string; privateKey: string } | null> {
  const { data } = await admin.rpc('nx_get_secret', { secret_name: 'nx_vapid' })
  if (data) return JSON.parse(data as string)
  const fresh = webpush.generateVAPIDKeys()
  const { data: stored, error } = await admin.rpc('nx_init_secret', { secret_name: 'nx_vapid', secret_value: JSON.stringify(fresh) })
  if (error || !stored) return null
  return JSON.parse(stored as string)
}

async function setupPush(admin: Admin) {
  const keys = await vapidKeys(admin)
  if (!keys) return false
  webpush.setVapidDetails('https://eithan1710.github.io/Nexus/', keys.publicKey, keys.privateKey)
  return true
}

async function push(admin: Admin, sub: Sub, payload: unknown, ttl: number) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: ttl, urgency: 'high' })
    await admin.from('nx_push_subscriptions').update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq('id', sub.id)
    return { ok: true }
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    const kind = classifyPushError(status)
    console.warn('push failed', status, (e as Error).message)
    if (kind === 'gone') await admin.from('nx_push_subscriptions').delete().eq('id', sub.id)
    else await admin.from('nx_push_subscriptions').update({ last_failure_at: new Date().toISOString(), failure_count: sub.failure_count + 1 }).eq('id', sub.id)
    return { ok: false, kind, status }
  }
}

async function dispatch(admin: Admin) {
  const { data: due, error } = await admin.rpc('nx_claim_due_reminders', { max_rows: 100 })
  if (error) return json({ error: error.message }, 500)
  if (!due?.length) return json({ ok: true, claimed: 0 })
  if (!(await setupPush(admin))) return json({ error: 'no vapid keys' }, 500)

  const userIds = [...new Set(due.map((r: { user_id: string }) => r.user_id))]
  const topicIds = [...new Set(due.map((r: { topic_id: string | null }) => r.topic_id).filter(Boolean))]
  const [{ data: subs }, { data: topics }] = await Promise.all([
    admin.from('nx_push_subscriptions').select('id, user_id, endpoint, p256dh, auth, failure_count').in('user_id', userIds),
    topicIds.length ? admin.from('nx_topics').select('id, name').in('id', topicIds) : Promise.resolve({ data: [] }),
  ])
  const topicName = new Map((topics ?? []).map((t: { id: string; name: string }) => [t.id, t.name]))

  const summary = { claimed: due.length, sent: 0, retry: 0, failed: 0 }
  await Promise.all(
    due.map(async (r: Record<string, any>) => {
      const now = Date.now()
      const payload = notificationPayload(r, topicName.get(r.topic_id), now)
      const mine = (subs ?? []).filter((s: Sub) => s.user_id === r.user_id)
      const results = await Promise.all(mine.map((s: Sub) => push(admin, s, payload, 6 * 3600)))
      const patch = deliveryOutcome(r, results, now)
      // Only finish the claim we hold: if the user edited the reminder meanwhile it was re-armed
      // and must not be overwritten.
      const { error: upErr } = await admin
        .from('nx_reminders')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', r.id)
        .eq('delivery_status', 'sending')
        .eq('due_at', r.due_at)
      if (upErr) console.error('finalize failed', r.id, upErr.message)
      if (results.some((x: { ok: boolean }) => x.ok)) summary.sent++
      else if (patch.delivery_status === 'retry') summary.retry++
      else summary.failed++
    }),
  )
  return json({ ok: true, ...summary })
}

async function userFrom(admin: Admin, req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await admin.auth.getUser(token)
  return data.user ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  if (req.method === 'GET') {
    if (!new URL(req.url).searchParams.has('vapid-public-key')) return json({ error: 'not found' }, 404)
    const keys = await vapidKeys(admin)
    return keys ? json({ publicKey: keys.publicKey }) : json({ error: 'unavailable' }, 503)
  }
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const body = await req.json().catch(() => ({}))

  if (req.headers.has('x-cron-secret')) {
    const { data: secret } = await admin.rpc('nx_get_secret', { secret_name: 'nx_cron_secret' })
    if (!safeEqual(req.headers.get('x-cron-secret') ?? '', (secret as string) ?? '')) return json({ error: 'forbidden' }, 403)
    return dispatch(admin)
  }

  if (body.action === 'test') {
    const user = await userFrom(admin, req)
    if (!user) return json({ error: 'unauthorized' }, 401)
    if (!(await setupPush(admin))) return json({ error: 'no vapid keys' }, 500)
    let q = admin.from('nx_push_subscriptions').select('id, user_id, endpoint, p256dh, auth, failure_count').eq('user_id', user.id)
    if (typeof body.endpoint === 'string') q = q.eq('endpoint', body.endpoint)
    const { data: subs } = await q
    const payload = { title: 'ההתראות פועלות ✓', body: 'כך תיראה תזכורת מ״הידע שלי״.', tag: 'nx-test', url: '#/reminders' }
    const results = await Promise.all((subs ?? []).map((s: Sub) => push(admin, s, payload, 600)))
    return json({ devices: results.length, sent: results.filter((r) => r.ok).length, errors: results.filter((r) => !r.ok).map((r) => r.status ?? null) })
  }

  if (body.action === 'resubscribe') {
    // The old endpoint is an unguessable capability URL known only to that browser.
    const sub = body.subscription
    if (typeof body.oldEndpoint !== 'string' || !sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth || !/^https:\/\//.test(sub.endpoint)) return json({ error: 'bad request' }, 400)
    const { data: old } = await admin.from('nx_push_subscriptions').select('id').eq('endpoint', body.oldEndpoint).maybeSingle()
    if (!old) return json({ error: 'not found' }, 404)
    const { error } = await admin.from('nx_push_subscriptions').update({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, updated_at: new Date().toISOString(), failure_count: 0 }).eq('id', old.id)
    return error ? json({ error: error.message }, 500) : json({ ok: true })
  }

  return json({ error: 'bad request' }, 400)
})
