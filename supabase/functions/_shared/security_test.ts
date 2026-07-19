import { assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { redactProviderMessage, safeReturnPath } from './security.ts';

Deno.test('safeReturnPath accepts only same-app relative paths', () => {
  assertEquals(safeReturnPath('/connections?connected=facebook#status'), '/connections?connected=facebook#status');
  assertEquals(safeReturnPath('https://evil.example/steal'), '/social');
  assertEquals(safeReturnPath('//evil.example/steal'), '/social');
  assertEquals(safeReturnPath('/\\evil.example/steal'), '/social');
});

Deno.test('redactProviderMessage removes provider credentials from URLs and text', () => {
  const configuredSecret = 'configured-provider-secret';
  const message = redactProviderMessage(
    `Request failed: https://api.telegram.org/bot123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ123456/sendMessage?access_token=instagram-secret authorization=Bearer-secret ${configuredSecret}`,
    'Provider request failed.',
    [configuredSecret],
  );

  assertFalse(message.includes('ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'));
  assertFalse(message.includes('instagram-secret'));
  assertFalse(message.includes('Bearer-secret'));
  assertFalse(message.includes(configuredSecret));
  assertEquals(message.includes('bot[REDACTED]'), true);
  assertEquals(message.includes('access_token=[REDACTED]'), true);
});

Deno.test('redactProviderMessage bounds persisted provider errors', () => {
  assertEquals(redactProviderMessage('x'.repeat(2000)).length, 1000);
});
