# TIKUV PRO

Tikuvchilik ishlab chiqarishini boshqarish tizimi — **admin**, **xodim** va **mijoz** rollari
bitta tizimda: buyurtmalar, vazifalar, materiallar va bildirishnomalar.

## Tezkor boshlash

Talab: **Node.js >= 22.5** (tashqi paketlarsiz ishlaydi — `node:http`, `node:sqlite`, `node:crypto`).

```bash
npm start          # http://localhost:3000
```

Test hisoblar (birinchi ishga tushirishda avtomatik yaratiladi):

| Rol | Login | Parol |
|---|---|---|
| Admin | `shaxobiddinumarovadmin` | `20132011Sh` |
| Xodim | `hosilaeshmuminova` | `20132011Sh` |
| Mijoz | `901234567` | `Mijoz123!` |

Bu hisoblar faqat **birinchi** ishga tushirishda (`data/tikuvpro.db` bo'sh bo'lganda) yaratiladi
va login sahifasida **ko'rsatilmaydi** — xodim/admin hisoblari tashqaridan bilinmaydi.

Ma'lumotlar `data/tikuvpro.db` (SQLite) da saqlanadi; sessiya kaliti `data/secret.key` da.

## Testlar

```bash
npm test           # 60 ta API testi: auth, avto-ro'yxat, ruxsatlar, vazifa sikli, avto-taqsimlash, mijozga yetkazish
npm run test:ui    # 25 ta frontend testi (mini-DOM da uchala rol oqimi)
```

## Arxitektura

```
server/            Backend (nol dependensiya)
  index.js         HTTP server: statik fayllar + API + CORS + xavfsizlik sarlavhalari
  api.js           REST endpointlar (har biri rol himoyalangan)
  db.js            SQLite sxema va seed ma'lumotlar
  auth.js          scrypt parol xeshi + HMAC sessiya tokeni
public/            Frontend SPA (hash-router, o‘zbek tilida)
  js/views/        auth, employee (9 bo‘lim), admin, customer ko'rinishlari
  manifest.webmanifest, sw.js, offline.html, icons/   PWA
capacitor.config.json          Android/iOS (Capacitor 6) sozlamasi
docs/STORE_PREP.md             Do‘konlarga nashr qilish to‘liq yo‘riqnomasi
scripts/                       smoke-test.js (API) va ui-harness.js (frontend)
```

### Rollar va ruxsatlar (backend darajasida majburiy)

- **Mijoz** — faqat o‘z buyurtmalari; buyurtmasi eng kam yuklangan faol xodimga
  **avtomatik biriktiriladi** (quyida). Mijozlar **avtomatik tizimga yoziladi**: telefon raqami
  (8–15 raqamli login) va parol bilan birinchi marta kirganda `customer` hisobi yaratiladi va
  keyingi kirishlarda shu hisob saqlanadi (ismni Profil bo‘limidan yozish mumkin).
  Ro‘yxatdan o‘tish/qo‘shilish **faqat mijoz** rolini yaratadi — `role` maydoni server
  tomonidan e'tiborga olinmaydi, shuningdek mavjud admin/xodim loginini egallab bo‘lmaydi.
- **Xodim** — faqat o‘ziga biriktirilgan vazifalar; boshqa xodimlarning shaxsiy ma'lumotlari,
  korxona moliyaviy hisobotlari va mijozlarning barcha buyurtmalari **ko‘rinmaydi**.
  Amallar: vazifani qabul qilish → ishni boshlash → bajarilgan son kiritish →
  izoh (muammo/kechikish) → yakunlash. Yakunlangan ish **admin tasdig‘isiz darhol mijozga
  yuboriladi** (buyurtma «Tayyor» bo‘ladi).
- **Admin** — xodimlar CRUD, vazifa biriktirish/qayta taqsimlash, buyurtmalar holati va narxi,
  materiallar, mijozlar ro‘yxati. Tasdiqlash/qaytarish bosqichi yo‘q — ish oqimi to‘liq
  avtomatik (quyida).

### Vazifa holatlari

```
assigned → accepted → in_progress → approved (yakunlandi — mijozga yuborildi)

Barcha vazifalar yakunlangach buyurtma holati avtomatik 'ready' (Tayyor) bo‘ladi.
```

### Buyurtmalarni avtomatik taqsimlash

Mijoz (yoki admin mijoz nomidan) buyurtma yaratganda tizim **eng kam yuklangan faol xodimga**
(ochiq vazifalari eng kam bo‘lgan xodim; tenglikda — kichik id) avtomatik vazifa ochadi va
buyurtma holatini `in_progress` ga o‘tkazadi:

- xodimga «Yangi vazifa» bildirishnomasi boradi, vazifa tarixida tizim yozuvi paydo bo‘ladi;
- mijozga «Xodim biriktirildi» xabari yuboriladi;
- xodim ishni **yakunlashi bilan** vazifa `approved` bo‘ladi va mijozga «Buyurtmangiz tayyor»
  xabari boradi; buyurtmadagi barcha vazifalar yakunlansa — buyurtma `ready` holatiga o‘tadi;
- faol xodim bo‘lmasa — buyurtma `new` holatida qoladi va adminga «Xodim biriktirilmadi»
  ogohlantirishi boradi (keyin «Vazifalar» bo‘limida qo‘lda biriktirish yoki qayta taqsimlash mumkin).

## Web, PWA va mobil

- **Web-sayt** — kompyuter va telefon brauzerida responsive ishlaydi.
- **PWA** — `manifest.webmanifest` + service worker: bosh ekranga o‘rnatish, oflayn sahifa,
  internet qaytganda avtomatik yangilanish. HTTPS talab (lokal `localhost` istisno).
- **Android/iOS** — Capacitor 6 (`capacitor.config.json`). Native loyihalar:
  ```bash
  npm install && npx cap add android && npx cap add ios && npx cap sync
  ```
  Mobil ilovada server manzilini **Profil → Server manzili** dan sozlang
  (standart: `public/js/api.js` dagi `NATIVE_DEFAULT_URL`).
  To‘liq imzo/skrenshot/nashr qo‘llanmasi: **`docs/STORE_PREP.md`**.

Barcha versiyalar bir xil server va bazaga ulanadi — bir qurilmada yaratilgan buyurtma
boshqasida darhol ko‘rinadi.

## Xavfsizlik

- Parollar scrypt bilan xeshlanadi; sessiya tokeni HMAC-SHA256 bilan imzolanadi (httpOnly cookie
  + native uchun Bearer).
- Barcha SQL so‘rovlar parameterlangan; XSS uchun DOM API (textContent) ishlatiladi.
- Login urinishlari cheklangan (10 ta xato / 5 daqiqa / IP).
- Xavfsizlik sarlavhalari: nosniff, frame-deny, referrer-policy.
- Fayl yuklash faqat JPEG/PNG/WebP, 3 MB gacha; yo‘l bosish (path traversal) himoyalangan.
- Login sahifasida hisob-ma'lumotlari ko‘rsatilmaydi; admin/xodim hisoblari faqat
  administrator tomonidan yaratiladi. Parolni almashtirish: `scripts/update-admin.js`,
  yangi xodim: `scripts/add-employee.js` yoki admin paneli.

## Ish unumdorligi (optimizatsiya)

- **Statik fayllar xotirada keshlanadi** (mtime/size bo'yicha avtomatik yangilanadi) — disk I/O kamayadi.
- **ETag + Last-Modified + 304** — brauzer o'zgarmagan faylni qayta yuklamaydi.
- **gzip siqish** `node:zlib` bilan: matnli fayllar ~72% kichrayadi (masalan `admin.js` 20 KB → 4.9 KB).
- **SQLite WAL rejimi + busy_timeout** — o'qish/yozish parallellashadi, bloklanish xatolari kamayadi.
- Service worker app-shell'ni keshlaydi — takroriy ochilish tarmoqsiz darhol ishlaydi.
- 1.9 MB `public/` (asosan PWA ikonkalari) — matn qismi gzip bilan atigi ~17 KB.

## Qabul qilish mezonlari holati (18-bo‘lim)

| Mezon | Holat |
|---|---|
| 3 rol bitta tizimda | ✅ |
| Har rol o‘z panelini ko‘radi | ✅ |
| Ruxsatlar backend orqali tekshiriladi | ✅ (testlarda isbotlangan) |
| Ma'lumotlar umumiy serverda | ✅ (SQLite) |
| Web kompyuter + telefon | ✅ (responsive) |
| PWA imkoniyatlari | ✅ (manifest, SW, offline, install) |
| Android/iOS loyiha tuzilmasi | ✅ (Capacitor config + yo‘riqnoma) |
| Barcha versiyalar bitta bazaga | ✅ |
| Asosiy funksiyalar sinovdan o‘tdi | ✅ (60 API + 25 UI test) |

**Tashqi xizmatga bog‘liq funksiyalar (hali ishga tushmagan):**
- **Push-bildirishnomalar** — FCM/APNs akkauntlari talab qilinadi (ichki bildirishnoma tizimi ishlaydi).
- **Do‘konlarga avtomatik nashr** — imzo/kalitlar faqat sizning akkauntingizda; qo‘lda nashr
  qadamlari `docs/STORE_PREP.md` da.
- **HTTPS domen** — production uchun sizning sertifikatingiz kerak.

Ilova **do‘konlarga hali joylanmagan** — “nashr qilindi” deb e'lon qilinmaydi, garchi
nashrga tayyor build yo‘riqnomasi to‘liq bo‘lsa ham.
