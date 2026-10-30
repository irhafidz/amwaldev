# Claude Code Bara - Sprint 11 Status

Ticket: `I-11` - Spike sandbox Mayar

Status: **SELESAI** untuk create payment request, pembayaran sandbox, registrasi webhook, dan capture webhook asli. Tidak ada secret mentah yang ditulis ke berkas ini.

## 1. Registered Sandbox Webhook

Satu URL webhook sementara didaftarkan ke Mayar sandbox:

```text
https://webhook.site/65d54ce8-9dee-4f87-8d67-659ad24a6065
```

Registrasi memakai:

```http
POST https://api.mayar.io/hl/v2/webhooks/update
Authorization: Bearer <MAYAR_API_KEY>
Content-Type: application/json

{
  "urlHook": "https://webhook.site/65d54ce8-9dee-4f87-8d67-659ad24a6065"
}
```

Respons registrasi:

```json
{
  "statusCode": 200,
  "messages": "success"
}
```

## 2. Create Payment Request (V1)

Endpoint yang diminta ticket:

```http
POST https://api.mayar.io/hl/v1/payment/create
Authorization: Bearer <MAYAR_API_KEY>
Content-Type: application/json
```

Request body yang dikirim:

```json
{
  "name": "Bara Tester",
  "email": "bara@example.com",
  "amount": 10000,
  "mobile": "081234567890",
  "description": "Donasi Infaq Uji Coba 800926000001",
  "redirectUrl": "https://example.com/finish"
}
```

Order ID v2 yang dipakai: `800926000001` (modul Infaq `80`, bulan `09`, tahun `26`, sub-program `00`, sequence `0001`).

Raw response V1:

```json
{"statusCode":200,"messages":"success","data":{"id":"9bdddc27-3d43-461e-87e2-2921660af602","transaction_id":"54172bda-6ecb-48c1-b252-eee351406441","transactionId":"54172bda-6ecb-48c1-b252-eee351406441","paymentLinkId":"9bdddc27-3d43-461e-87e2-2921660af602","link":"https://amwal-its.myr.lat/invoices/m2t6v5yoz0"}}
```

Catatan respons V1:

- `data.id` dan `data.paymentLinkId` sama.
- `data.transaction_id` dan `data.transactionId` sama.
- `redirectUrl` diterima tetapi tidak di-echo di respons.
- Tidak ada `expiredAt` pada respons V1.

## 3. Payment Sandbox

Mayar menyediakan endpoint sandbox-only:

```text
POST /hl/v2/payments/simulate
```

Namun pada praktiknya, ID transaksi dari payment request V1 (`9bdd...` / `5417...`) tidak dikenali oleh simulation path checkout. Mayar checkout GraphQL mengembalikan `404` untuk ID tersebut. Simulasi yang berhasil memakai payment-link transaction:

1. Buat payment link sandbox:

```http
POST https://api.mayar.io/hl/v2/products/payment-link/create
Authorization: Bearer <MAYAR_API_KEY>
Content-Type: application/json

{
  "name": "Spike Mayar I-11",
  "description": "Spike sandbox payment link",
  "amount": 10000,
  "redirectUrl": "https://example.com/finish"
}
```

Respons:

```json
{
  "statusCode": 200,
  "messages": "success",
  "data": {
    "id": "fb9bbb28-4250-4fc3-937a-bda0fab1074f",
    "name": "Spike Mayar I-11",
    "amount": 10000,
    "type": "generic_link",
    "status": "active",
    "link": "https://amwal-its.myr.lat/pl/Spike-Mayar-I-11/",
    "redirectUrl": "https://example.com/finish"
  }
}
```

2. Buat payment-link transaction melalui GraphQL checkout:

```graphql
mutation createPaymentLinkTransactionPublic($input: PaymentLinkTransactionPublic!) {
  insertPaymentLinkTransactionPublic(input: $input) {
    id
    amount
    status
    paymentMethod
  }
}
```

Variables:

```json
{
  "input": {
    "amount": 10000,
    "email": "bara@example.com",
    "link": "Spike-Mayar-I-11",
    "mobile": "081234567890",
    "name": "Bara Tester",
    "paymentLinkId": "fb9bbb28-4250-4fc3-937a-bda0fab1074f",
    "paymentType": "qris",
    "qty": 1
  }
}
```

Raw response:

```json
{"data":{"insertPaymentLinkTransactionPublic":{"id":"f733e66f-26b8-449c-a607-3e3765dba0d9","amount":10000,"status":"created","paymentMethod":null}}}
```

3. Simulate payment:

```graphql
mutation simulatePayment($paymentLinkTransactionId: ID!) {
  simulatePayment(paymentLinkTransactionId: $paymentLinkTransactionId) {
    status
    message
  }
}
```

Variables:

```json
{
  "paymentLinkTransactionId": "f733e66f-26b8-449c-a607-3e3765dba0d9"
}
```

Raw response:

```json
{"data":{"simulatePayment":{"status":200,"message":"We're processing payment for payment method ID 'pm-a54c54e1-fd8e-41de-ab6f-df33460e89a7' and will send you the result via callback. Please make sure you've set a callback URL in 'Payment Succeeded' section in Callback settings in Xendit Dashboard. If you don't receive the callback within the next 5 minutes, please contact us."}}}
```

## 4. Real Webhook Payload

Mayar mengirim webhook asli ke URL yang terdaftar.

HTTP metadata yang teramati:

```text
POST /
Content-Type: application/json
User-Agent: node-fetch/1.0 (+https://github.com/bitinn/node-fetch)
x-callback-token: <128-char hex token; nilai mentah tidak di-commit>
```

Temuan penting:

- `x-callback-token` **ada** dan panjangnya 128 karakter hex.
- Nilai `x-callback-token` **cocok persis** dengan `MAYAR_WEBHOOK_TOKEN` yang dikonfigurasi di `.env` (dicek tanpa mencetak nilai).
- `data.status` pada payload asli bertipe **string** `"SUCCESS"`, bukan boolean.
- `data.transactionStatus` bernilai `"created"` meskipun event-nya `payment.received`.
- `productId` adalah payment-link product ID, bukan payment request ID dari spike V1.

Raw payload `payment.received`:

```json
{
  "event": "payment.received",
  "data": {
    "id": "f733e66f-26b8-449c-a607-3e3765dba0d9",
    "transactionId": "f733e66f-26b8-449c-a607-3e3765dba0d9",
    "status": "SUCCESS",
    "transactionStatus": "created",
    "createdAt": "2026-09-16T15:57:56.687Z",
    "updatedAt": "2026-09-16T15:57:57.963Z",
    "merchantId": "e198fe1d-a612-441e-892f-5b3adc239c91",
    "merchantName": "Amwal",
    "merchantEmail": "amwal.its@gmail.com",
    "customerId": "0db87383-5cc2-486e-9e7b-fad21ddfb8ca",
    "customerName": "Bara Tester",
    "customerEmail": "bara@example.com",
    "customerMobile": "081234567890",
    "amount": 10000,
    "paymentLinkAmount": 10000,
    "isAdminFeeBorneByCustomer": false,
    "isChannelFeeBorneByCustomer": false,
    "productId": "fb9bbb28-4250-4fc3-937a-bda0fab1074f",
    "productName": "Spike Mayar I-11",
    "productDescription": "Spike sandbox payment link",
    "productType": "generic_link",
    "pixelFbp": null,
    "pixelFbc": null,
    "qty": 1,
    "couponUsed": null,
    "paymentMethod": "QRIS",
    "nettAmount": 10000
  }
}
```

## 5. Implications Untuk Implementasi

- Jangan percaya `data.status === true`; nilai aktual adalah string `"SUCCESS"`.
- Jangan infer settlement hanya dari `status === "SUCCESS"`; tetap re-fetch detail transaksi dari API Mayar seperti desain fail-closed di `PLAN.md` D5.
- Verifikasi `x-callback-token` constant-time terhadap `MAYAR_WEBHOOK_TOKEN` sebagai filter murah.
- `payment.received` asli membawa `transactionId` yang juga dipakai sebagai `paymentLinkTransactionId` pada checkout GraphQL.
- Payment request V1 dan payment link V2 memakai jalur transaksi yang berbeda; adapter harus memperlakukan `providerRef` sesuai respons provider, bukan mengasumsikan `id` V1 bisa disimulasikan lewat endpoint sandbox V2.

## 6. Verifikasi Lokal

Perintah spike:

```powershell
bun run scripts/spike-mayar.ts
```

Hasil: HTTP `200`, respons mentah tercatat di atas, dan token tidak pernah dicetak.

---

## 7. Selasa — I-1 & I-11 Implementation Status

Status: **IMPLEMENTED + TESTED** untuk alur `createPayment()` v2 dan adapter Mayar. Satu keputusan env masih perlu ditindaklanjuti oleh Claude Pro karena `apps/web/src/env/server.ts` belum mendeklarasikan variabel Mayar.

### 7.1 I-1 — order ID v2 atomik di `createPayment()`

- `packages/core/src/payment/service.ts` sekarang memanggil `nextOrderSequence(tx, …)` dan `formatOrderId(…)` **di dalam** transaksi anchor yang sama.
- `formatOrderId()` memakai `SEDEKAH` (`85`) saat `infaq_orders.jenis` dimulai dengan `SEDEKAH_`; Infaq biasa tetap memakai `80`.
- `moduleFromOrderId()` tetap menerima ID v2 **dan** fallback lama `AMW-*` / `INF-*`.
- `isValidOrderId()` sekarang menerima kedua format, sehingga test lama tetap sah dan test v2 baru ikut lolos.

### 7.2 I-11 — `MayarPaymentProvider`

File baru:

```text
packages/core/src/payment/mayar.provider.ts
```

Perilaku adapter:

- `x-callback-token` dibandingkan constant-time dengan `timingSafeEqual`.
- Hanya event `payment.received` yang diproses; event lain mengembalikan `ignored`.
- Re-fetch **selalu** dilakukan ke:

```text
GET https://api.mayar.io/hl/v2/transactions/{transactionId}
Authorization: Bearer <MAYAR_API_KEY>
AbortSignal.timeout(8000)
```

- Timeout/network/5xx mengembalikan `retry` HTTP `504`/`502` dan **tidak pernah** memanggil `applyProviderEvent` dengan `GAGAL`.
- Payload webhook Mayar tidak memuat order ID internal. Event dinormalisasi dengan `providerRef`, lalu `applyProviderEvent()` mencocokkannya ke `transactions.payment_gateway_ref`.
- Nominal hasil re-fetch dibandingkan numerik dengan nominal anchor; mismatch menolak transaksi dan mengembalikan `409`.

### 7.3 Temuan status re-fetch yang mengoreksi asumsi

Spike sebelumnya mencatat payload webhook membawa `data.status === "SUCCESS"`. Uji live endpoint re-fetch menunjukkan bentuk yang berbeda:

```json
{
  "data": {
    "status": "paid",
    "amount": 10000
  }
}
```

Keputusan adapter: status diambil dari hasil re-fetch, dan nilai `"paid"` maupun `"SUCCESS"` dinormalisasi menjadi `LUNAS`. `"created"` tetap `PENDING`. `data.transactionStatus` tidak pernah dipakai sebagai penentu.

### 7.4 Factory wiring dan env gap

`apps/web/src/lib/payment/index.ts` sudah mendukung:

- `MAYAR_SANDBOX`
- `MAYAR_PRODUCTION`

Namun `apps/web/src/env/server.ts` belum memiliki deklarasi `MAYAR_API_KEY`, `MAYAR_WEBHOOK_TOKEN`, dan `MAYAR_API_BASE_URL`. Untuk menjaga kompatibilitas branch tanpa menyentuh file milik Claude Pro, factory membaca variabel Mayar melalui bridge server-only `process.env` dengan fail-fast. **Keputusan yang diperlukan:** Claude Pro menambahkan ketiga variabel itu ke skema env opsional, lalu bridge `process.env` dapat dihapus.

### 7.5 Verification

```text
bun test packages/core
  107 pass, 0 fail

bun run check-types
  3/3 workspace pass

apps/web/tests/orpc/payment-create.test.ts + webhook.test.ts
  10 pass, 0 fail

apps/web/tests/orpc/mayar-webhook.test.ts
  4 pass, 0 fail
```

Tes Mayar mencakup settlement via `payment_gateway_ref`, mismatch nominal, timeout `504` tanpa `GAGAL`, dan penolakan token palsu sebelum database disentuh.
