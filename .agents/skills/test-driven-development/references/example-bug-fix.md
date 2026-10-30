# Worked Example: Bug Fix

**Bug:** Empty email accepted

**RED**

```typescript
test('rejects empty email', async () => {
  const result = await submitForm({ email: '' });
  expect(result.error).toBe('Email required');
});
```

**Verify RED**

```bash
$ pnpm nx run <project>:test
FAIL: expected 'Email required', got undefined
```

**GREEN**

```typescript
function submitForm(data: FormData) {
  if (!data.email?.trim()) {
    return { error: 'Email required' };
  }
  // ...
}
```

**Verify GREEN**

```bash
$ pnpm nx run <project>:test
PASS
```

**REFACTOR**
Extract validation for multiple fields if needed.
