import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'

/**
 * ブラウザ用 Supabase クライアント。
 *
 * `@supabase/ssr` は使わない。アプリはローカルファーストで全ての読み取りが
 * IndexedDB 由来になるため、サーバ側でセッションを復元する必要がない。
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let client: SupabaseClient<Database> | null = null

export function getSupabase(): SupabaseClient<Database> {
  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を .env.local に設定してください',
    )
  }
  client ??= createClient<Database>(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  return client
}

/** 設定が揃っているか（未設定ならオフライン専用モードで動かす） */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}
