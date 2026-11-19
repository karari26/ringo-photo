
import { createClient } from '@supabase/supabase-js'

// Mengambil informasi koneksi dari file .env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Membuat koneksi ke Supabase
export const supabase = createClient(
  supabaseUrl,
  supabaseKey
)
