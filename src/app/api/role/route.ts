import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { role } = (await req.json()) as { role: string };
  const value = role === 'analyst' ? 'analyst' : 'owner';
  const res = NextResponse.json({ role: value });
  res.cookies.set('role', value, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
  return res;
}
