import 'fake-indexeddb/auto'
import { vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: null, hasSupabaseConfig: false }))
