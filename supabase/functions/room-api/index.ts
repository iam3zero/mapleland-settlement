import { createSupabaseDatabase } from '../../../server/supabaseDatabase.js'
import { createRoomHandler } from '../../../server/roomHandler.js'

// Service key is available only inside Supabase's Edge runtime.
const database = createSupabaseDatabase(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
const handler = createRoomHandler(database, {
  allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean),
  rateLimitSecret: Deno.env.get('RATE_LIMIT_SECRET'),
})
Deno.serve(handler)
