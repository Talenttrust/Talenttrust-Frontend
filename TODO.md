# Wallet CSV/JSON Export Implementation

## Steps

- [x] Create TODO.md
- [x] 1. Create `src/lib/exportWallet.ts` - export module with csvEscape, walletItemsToCsv, walletItemsToJson, triggerDownload, downloadWalletCsv, downloadWalletJson
- [x] 2. Edit `src/components/wallet/WalletBulkToolbar.tsx` - split `onExport` into `onExportCsv` and `onExportJson`, add two buttons
- [ ] 3. Edit `src/app/wallet/page.tsx` - add CSV/JSON export handlers, update toolbar props
- [ ] 4. Create `src/lib/__tests__/exportWallet.test.ts` - comprehensive tests
- [ ] 5. Edit `src/components/wallet/__tests__/WalletBulkToolbar.test.tsx` - update tests for new callbacks
- [ ] 6. Edit `src/app/wallet/__tests__/page.test.tsx` - update export tests
- [ ] 7. Run `npm run lint`, `npm test`, `npm run build`
