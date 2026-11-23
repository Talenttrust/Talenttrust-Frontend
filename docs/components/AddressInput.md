# AddressInput

Validated Stellar address input field with clipboard paste, one-click wallet fill (`Use my wallet`), StrKey checksum validation on blur, and accessible error announcements.

## File Locations

- Component: `src/components/forms/AddressInput.tsx`
- Address validation library: `src/lib/stellar/address.ts`
- Tests: `src/components/forms/AddressInput.test.tsx`

## Props (`AddressInputProps`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `label` | `string` | Yes | — | Visible `<label>` text |
| `value` | `string` | Yes | — | Controlled input value |
| `onChange` | `(value: string) => void` | Yes | — | Called with normalized value (`normalizeAddress`) on change, paste, or wallet fill |
| `id` | `string` | No | Auto-generated | Input element `id` |
| `allow` | `AddressKind[]` | No | `['account']` | Allowed Stellar address prefixes (`'account'` for `G...`, `'contract'` for `C...`) |
| `placeholder` | `string` | No | — | Input placeholder text |
| `description` | `string` | No | — | Helper text linked via `aria-describedby` |
| `walletAddress` | `string \| null` | No | — | When present, renders a **Use my wallet** button |
| `error` | `string \| null` | No | — | External validation error (e.g. cross-field duplicate client/freelancer check) |

## Ref Handle (`AddressInputHandle`)

`AddressInput` uses `forwardRef` to expose:

```ts
export interface AddressInputHandle {
  validate: () => boolean;
  focus: () => void;
}
```
