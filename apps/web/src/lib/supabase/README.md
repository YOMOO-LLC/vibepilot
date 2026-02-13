# Supabase Client Utilities

This directory contains Supabase client implementations for both client-side and server-side usage in Next.js 15.

## Files

- **`client.ts`**: Client-side Supabase singleton for use in Client Components
- **`server.ts`**: Server-side Supabase client factory for use in Server Components, Server Actions, and Route Handlers
- **`index.ts`**: Re-exports both client and server utilities

## Usage

### Client Components

```typescript
import { supabase } from '@/lib/supabase/client';
// or
import { supabase } from '@/lib/supabase';

export function MyClientComponent() {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!supabase) return;

    supabase.from('agents').select('*').then(({ data }) => {
      setData(data);
    });
  }, []);

  return <div>{data?.length} agents</div>;
}
```

### Server Components

```typescript
import { createServerClient } from '@/lib/supabase/server';

export default async function MyServerComponent() {
  const supabase = await createServerClient();
  const { data } = await supabase.from('agents').select('*');

  return <div>{data?.length} agents</div>;
}
```

### Server Actions

```typescript
'use server';

import { createServerClient } from '@/lib/supabase/server';

export async function getAgents() {
  const supabase = await createServerClient();
  const { data, error } = await supabase.from('agents').select('*');

  if (error) throw error;
  return data;
}
```

### Route Handlers

```typescript
import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createServerClient();
  const { data, error } = await supabase.from('agents').select('*');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
```

## Environment Variables

Both clients require the following environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Migration from Legacy Client

The legacy client at `/Users/yhfy2006/Documents/GitHub/vibepilot/.worktrees/nat-traversal/apps/web/src/lib/supabase.ts` is deprecated but maintained for backward compatibility.

To migrate:

```typescript
// Before (deprecated)
import { supabase } from '@/lib/supabase';

// After (client-side)
import { supabase } from '@/lib/supabase/client';

// For server-side
import { createServerClient } from '@/lib/supabase/server';
const supabase = await createServerClient();
```
