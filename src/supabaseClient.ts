/**
 * supabaseClient.ts
 * 
 * Inicializa el cliente de Supabase para el backend (Node.js)
 * usando la Service Role Key. ⚠️ ¡Nunca uses esta clave en el frontend!
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment variables.');
  process.exit(1);
}

// Creamos una instancia de cliente Supabase para el backend
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false,
  },
});

export default supabase;
