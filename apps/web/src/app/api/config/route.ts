export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return Response.json({ error: 'Cloud configuration not available' }, { status: 503 });
  }

  return Response.json(
    {
      supabaseUrl,
      anonKey,
    },
    {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    }
  );
}
