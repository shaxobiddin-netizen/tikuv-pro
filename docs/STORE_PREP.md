# TIKUV PRO — mobil ilovani do‘konlarga tayyorlash bo‘yicha yo‘riqnoma

Ushbu hujjat TIKUV PRO loyihasini **Google Play** va **Apple App Store**ga nashr qilish uchun kerakli
barcha qadamlarni, materiallarni va imzo ko‘rsatmalarini o‘z ichiga oladi.

> **Muhim:** loyiha hozircha do‘konlarga joylanmagan. Build tayyor bo‘lishi — “nashr qilindi”
> degani EMAS. Nashr faqat sizning Play Console / App Store Connect akkauntingiz orqali,
> do‘kon tekshiruvidan o‘tgach amalga oshadi.

---

## 1. Loyihani mobil ilovaga aylantirish (Capacitor)

Web ilova Capacitor orqali Android/iOS loyihasiga aylanadi. Barcha versiyalar (web, PWA,
Android, iOS) **bitta backend** va **bitta SQLite bazaga** ulanadi.

```bash
# 1) Paketlarni o'rnatish (package.json da @capacitor/* dependensiyalari belgilangan)
npm install

# 2) Platforma loyihalarini yaratish (faqat bir marta)
npx cap add android
npx cap add ios        # faqat macOS da ishlaydi

# 3) Web fayllarni native loyihalarga ko'chirish (har safar web o'zgarganda)
npx cap sync
```

### Server manzili (mobil ilova uchun)

Mobil ilova `capacitor://localhost` dan ochiladi, shuning uchun API ga murojaatda server
manzili kerak:

1. Serverni tarmoqda ochiq ishga tushiring: `npm start` (standart `http://PORT:3000`).
2. Ilovada **Profil → Server manzili** bo‘limiga kompyuteringizning tarmoq IP manzilini kiriting,
   masalan `http://192.168.1.10:3000`.
   (Boshlang‘ich qiymat `public/js/api.js` dagi `NATIVE_DEFAULT_URL` dan olinadi — uni
   o‘z lokal tarmog‘ingizga moslab o‘zgartiring.)
3. Telefon va server bir xil Wi-Fi tarmoqda bo‘lishi shart. Internetga chiqish uchun
   serverni VPS/oblakda joylashtiring va HTTPS orqali oching.

Server CORS sozlamasi `capacitor://localhost` va mahalliy tarmoq manzillarini (192.168.x.x va h.k.)
avtomatik qabul qiladi (`server/index.js` dagi `CORS_ORIGIN`).

### Splash screen va ikonkalarni generatsiya qilish

```bash
npm install @capacitor/assets --save-dev
npx capacitor-assets generate --iconBackgroundColor '#0f766e' --iconBackgroundColorDark '#0f766e' --splashBackgroundColor '#0f766e' --splashBackgroundColorDark '#134e4a'
```

Ikonka manbai: `public/icons/icon-512.png` (yoki o‘zingizning 1024×1024 PNG ingiz).
Bu buyruq barcha o‘lchamdagi Android/iOS ikonkalarini va splash screenlarni avtomatik yaratadi.

---

## 2. Google Play Store (Android)

### 2.1. Talab qilinadigan dasturlar
- Android Studio (SDK Platform, Build-Tools o‘rnatilgan).
- JDK 17+.

### 2.2. Debug build (sinov)
```bash
npx cap open android          # Android Studio ochiladi
# Android Studio da: Build → Build Bundle(s)/APK(s) → Build APK(s)
# yoki terminalda:
cd android && ./gradlew assembleDebug
```
APK: `android/app/build/outputs/apk/debug/app-debug.apk` — faqat sinov uchun, nashr qilib bo‘lmaydi.

### 2.3. Release build va imzolash (nashr uchun)
1. **Kalitlar ombori (keystore) yarating** (bir marta, kalitni yo‘qotmang!):
   ```bash
   keytool -genkey -v -keystore tikuv-pro.keystore -alias tikuvpro -keyalg RSA -keysize 2048 -validity 10950
   ```
2. `android/app/build.gradle` faylida signingConfigs qo‘shing (Capacitor loyihasida
   `android/app/build.gradle`):
   ```gradle
   android {
       signingConfigs {
           release {
               storeFile file('../../tikuv-pro.keystore')
               storePassword System.getenv('TP_STORE_PASSWORD')
               keyAlias 'tikuvpro'
               keyPassword System.getenv('TP_KEY_PASSWORD')
           }
       }
       buildTypes {
           release {
               signingConfig signingConfigs.release
               minifyEnabled false
           }
       }
   }
   ```
3. **AAB** (Google Play talab qiladi) yig‘ing:
   ```bash
   cd android
   TP_STORE_PASSWORD='***' TP_KEY_PASSWORD='***' ./gradlew bundleRelease
   ```
   Tayyor fayl: `android/app/build/outputs/bundle/release/app-release.aab`

### 2.4. Play Console ga joylash
1. https://play.google.com/console da ishlab chiquvchi akkaunt oching (bir martalik 25$ to‘lov).
2. **Ilova yaratish → Qadam 1: Ilova haqida** — nom, standart til (o‘zbek), bepul/pulli.
3. **Qadam 2: Ilova kontenti** — ekran suratlari (2 minimum, 8 tavsiya), ikonka (512×512 PNG),
   banner (1024×500), qisqa tavsif.
4. **Qadam 3: Tegishlilik** — yosh chegarasi (kamida “Barcha yoshlar”), yangiliklar/ilova haqida.
5. **Qadam 4: Ruxsatlar** — quyidagi “Maxfiylik va ruxsatlar” bo‘limidan nusxa oling.
6. Production → Yangi nashr → AAB yuklang → nashr qiling.
   Tekshiruv 3–7 kun davom etadi.

---

## 3. Apple App Store (iOS) — faqat macOS + Xcode

### 3.1. Talablar
- Mac kompyuter, Xcode (Mac App Store).
- Apple Developer akkaunti (99$/yil): https://developer.apple.com.

### 3.2. Loyihani sozlash
```bash
npx cap open ios        # Xcode ochiladi
```
1. Xcode da **Signing & Capabilities** tabida o‘z Apple ID (Personal Team yoki Organization) ni tanlang,
   “Automatically manage signing” yoqing.
2. `ios/App/App/Info.plist` da kamera/galereya izohlari Capacitor tomonidan avtomatik qo‘shiladi;
   kerak bo‘lsa qo‘lda o‘zbekchalashtiring:
   - `NSCameraUsageDescription` — “Buyurtmaga rasm biriktirish uchun”
   - `NSPhotoLibraryUsageDescription` — “Buyurtmaga rasm tanlash uchun”

### 3.3. Arxivlash va imzolash
1. Xcode da: **Product → Archive** (loyihani `Any iOS Device` tanlangan holatda arxivlang).
2. **Organizer** oynasida arxivni tanlab **Distribute App → App Store Connect → Upload**.
3. Ilova avtomatik imzolanadi va App Store Connectga yuklanadi.

### 3.4. App Store Connect
1. https://appstoreconnect.apple.com da ilova yaratiladi (SKU: `uz.tikuvpro.app`).
2. **App Information** — nom, tavsif, kalit so‘zlar, marketing URL.
3. **Screenshots**: 6.7" va 6.5" iPhone uchun (iPad versiya sifatida ham topshirilsa, 12.9" ham).
4. **Privacy Policy URL**: o‘zingizning domeningizda joylang (`public/privacy.html` mazmunidan
   foydalaning).
5. **App Review ma'lumotlari**: demo akkaunt `shaxobiddinumarovadmin / 20132011Sh`.
6. **Export Compliance** — standart shifrlash (scrypt/HMAC) → “No” javoblari.
7. Tekshiruvga yuboring (1–3 kun, ko‘pincha 24 soat).

---

## 4. Do‘konlar uchun tayyorlangan materiallar

| Material | Holat |
|---|---|
| Ilova nomi | **TIKUV PRO** |
| Paket ID | `uz.tikuvpro.app` (capacitor.config.json) |
| Ikonka | `public/icons/` (icon-512.png — 1024×1024 sifatida, @capacitor/assets bilan barcha o‘lchamlar) |
| Splash screen | `capacitor.config.json` → SplashScreen plagini (fon #0f766e), @capacitor/assets generatsiya qiladi |
| Qisqa tavsif (80 belgi) | Tikuvchilik ishlab chiqarishini boshqaring |
| To‘liq tavsif | Quyida |
| Maxfiylik siyosati | `public/privacy.html` (serverda `/privacy` sahifasi sifatida ham ochiladi) |
| Skrinshotlar | Ilova ishga tushirilib, har bir roldan 2–3 ta surat olinadi (quyidagi yo‘riqnoma) |
| Ruxsatlar tavsifi | Quyida |

### To‘liq tavsif (do‘konlar uchun, tahrirlab oling)

```
TIKUV PRO — tikuvchilik ustaxonasi va atelye uchun ishlab chiqarish boshqaruv tizimi.

• MIJOZLAR: buyurtma bering, holatini real vaqtda kuzatib boring — ish yakunlanishi bilan
  «Tayyor» xabari avtomatik keladi.
• XODIMLAR: o‘zingizga biriktirilgan vazifalarni ko‘ring, ishni boshlang, bajarilgan
  mahsulotlar sonini kiriting, muammo haqida xabardor qiling.
• ADMINISTRATOR: buyurtmalar, xodimlar, vazifalar va materiallarni bir joydan boshqaring —
  buyurtmalar xodimlarga avtomatik taqsimlanadi, ish mijozga avtomatik yuboriladi.

Barcha ma'lumotlar bitta serverda saqlanadi — telefon, planshet va kompyuterda bir xil
ko‘rinadi. Internet vaqtinchalik uzilganda ilova so‘nggi holatni ko‘rsatadi.
```

### Ruxsatlar va ularning tavsifi (do‘kon “Data safety” / “App permissions”)

| Ruxsat | Sabab |
|---|---|
| INTERNET / NETWORK | Server bilan ma'lumotlarni sinxronlash |
| CAMERA | Buyurtmaga rasm biriktirish (faqat foydalanuvchi rasm yuklaganda) |
| PHOTOS / READ_MEDIA_IMAGES | Galereyadan rasm tanlash |
| POST_NOTIFICATIONS (Android 13+) | Push bildirishnomalar (vazifa, buyurtma holati) |

### Skrinshotlar uchun tavsiya qilingan sahnalar
1. Kirish ekrani.
2. Admin: boshqaruv paneli (statistika kartalari).
3. Admin: vazifa biriktirish oynasi.
4. Xodim: “Mening vazifalarim” ro‘yxati.
5. Xodim: vazifa batafsil (jarayon tarixi).
6. Mijoz: buyurtmalar ro‘yxati + yangi buyurtma formasi.

> Skrinshotlarni har bir ekran o‘lchamiga (Android: 16:9; iOS: 6.7"/6.5") moslab oling.

---

## 5. Push-bildirishnomalar (ixtiyoriy, tashqi xizmat talab qilinadi)

Ilova kodi push qabul qilishga tayyor (`public/js/app.js` → `setupPush`, faqat native ilovada
yoqiladi). Push **server-to-server** yuboriladi:

1. Firebase Console da loyiha yarating, `google-services.json` ni `android/app/` ga qo‘ying.
2. iOS uchun APNs kalitini App Store Connect va Firebase da sozlang.
3. `@capacitor/push-notifications` o‘rnatilgan — serverda vazifa/buyurtma voqealarida
   FCM orqali yuborish uchun alohida skript yozing (loyihada ichki bildirishnoma tizimi
   allaqachon ishlaydi; push FCM/APNs talab qiladi — tashqi akkaunt).

**Push FCM/APNs kalitsiz ishlamaydi — buni tashqi xizmatga bog‘liq funksiya deb hisoblang.**

---

## 6. Sinov va nashrga tayyorlash checklisti

- [ ] `npm test` (API) va `npm run test:ui` (frontend) xatosiz o‘tadi.
- [ ] Android debug APK real qurilmada sinovdan o‘tkazildi (3 rol ham).
- [ ] iOS TestFlight orqali sinovchi guruhiga berildi.
- [ ] Server HTTPS (do‘kon talabi) orqali ochiq va barqaror.
- [ ] Privacy Policy sahifasi ochiq internetda joylashgan.
- [ ] Do‘kon roliklarida barcha ruxsatlar to‘g‘ri ko‘rsatilgan.
- [ ] Ilova versiya kodi/kodi yangilangan (`android/app/build.gradle` → versionCode,
      `ios` da CFBundleVersion).
