'use client';

import { useEffect, useRef, useState } from 'react';

export function LeadForm({ apiUrl, apiKey }: { apiUrl: string; apiKey: string }) {
  const renderedAt = useRef(0);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error' | 'limit'>('idle');
  useEffect(() => {
    renderedAt.current = Date.now();
  }, []);
  const disabled = !apiUrl || !apiKey;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState('sending');
    try {
      const res = await fetch(`${apiUrl}/api/v1/contact/public/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _apiKey: apiKey,
          name: String(form.get('name') ?? ''),
          email: String(form.get('email') ?? ''),
          phone: String(form.get('phone') ?? '') || undefined,
          message: String(form.get('message') ?? ''),
          pageUrl: window.location.href,
          source: 'contact-form',
          company_website: String(form.get('company_website') ?? ''),
          renderedAt: renderedAt.current,
        }),
      });
      setState(res.ok ? 'sent' : res.status === 429 ? 'limit' : 'error');
    } catch {
      setState('error');
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-4">
      <label className="grid gap-1 text-sm">
        Name
        <input name="name" required className="border-border rounded-md border px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm">
        Email
        <input name="email" type="email" required className="border-border rounded-md border px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm">
        Phone (optional)
        <input name="phone" className="border-border rounded-md border px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm">
        Your project
        <textarea name="message" rows={5} className="border-border rounded-md border px-3 py-2" />
      </label>
      <input name="company_website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <button
        type="submit"
        disabled={disabled || state === 'sending'}
        className="bg-primary text-primary-contrast rounded-md px-5 py-3 disabled:opacity-60"
      >
        {state === 'sending' ? 'Sending…' : 'Send message'}
      </button>
      <p aria-live="polite" className="text-muted text-sm">
        {disabled && 'The form is available on the live site.'}
        {state === 'sent' && 'Thank you — we will reply soon.'}
        {state === 'error' && 'Something went wrong. Please call or email us instead.'}
        {state === 'limit' && 'We cannot take more messages online right now. Please call or email us.'}
      </p>
    </form>
  );
}
