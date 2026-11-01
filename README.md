# Kartu Kata

Aplikasi flashcard dan kuis kosakata berbasis React. Kata bisa dimasukkan manual atau diimpor sekaligus dari Excel (.xlsx), CSV, atau teks yang disalin dari spreadsheet. Semua data tersimpan di peramban (localStorage), tanpa server.

## Menjalankan

Butuh Node.js 22.12 atau lebih baru.

```bash
npm install
npm run dev       # server pengembangan
npm test          # tes unit (node:test, tanpa dependensi tambahan)
npm run lint      # ESLint
npm run build     # hasil build ke dist/
npm run preview   # coba hasil build
```

Hasil build memakai `HashRouter` dan `base: './'`, jadi folder `dist/` bisa diunggah ke hosting statis mana pun tanpa pengaturan rewrite.

### Layanan gratis (tanpa API key, tanpa token)

Semua bantuan otomatis memakai layanan publik yang gratis dan tidak butuh akun:

| Fungsi | Layanan |
| --- | --- |
| Pilihan Romaji ke Kanji (Jepang) | Google Input Tools. Jika tidak terjangkau, kamus offline kecil + konversi kana |
| Arti kata | Google Translate (endpoint publik), cadangan MyMemory |
| Contoh kalimat (semua bahasa) | Tatoeba, kalimat asli dalam bahasa kata. Khusus Inggris ada cadangan dictionaryapi.dev |

Semua bersifat opsional: form tetap bisa diisi manual. Untuk mengganti endpoint Google Translate, isi `VITE_GOOGLE_TRANSLATE_BASE_URL` di `.env`.

## Fitur

- **Kata**: tambah, ubah, hapus, cari, filter kategori, ekspor ke Excel. Kata kembar dicegah.
- **Bahasa kata**: tiap bahasa punya modul sendiri di `src/languages/` (cara mengetik, huruf khusus, suara, sumber contoh kalimat). Bahasa dipilih manual; huruf Latin tidak lagi ditebak sebagai Jepang.
- **Jepang (IME)**: pilih Word language = Japanese, ketik romaji (mis. `nihon`) lalu pilih kandidat 日本 / にほん / 二本 / ニホン. Spasi atau panah untuk pindah, Enter atau angka 1-9 untuk memilih, Esc menutup. Romaji yang tersisa menjadi hiragana saat kolom ditinggalkan. Jawaban ketik di Kuis memakai IME yang sama.
- **Contoh kalimat**: ditulis dalam bahasa kata yang dipilih (Tatoeba), lengkap dengan terjemahannya di keterangan. Arti dan contoh yang sudah tersimpan tidak pernah ditimpa oleh Kartu belajar atau Kuis.
- **Huruf khusus**: tombol ñ, ü, ß, é, ł, dll. untuk Spanyol, Jerman, Prancis, Italia, Belanda, Portugis, dan Polandia.
- **Impor massal**: unggah .xlsx atau .csv, atau tempel dari Excel/Google Sheets. Ada pratinjau sebelum disimpan yang menampilkan baris bermasalah dan duplikat. Template Excel bisa diunduh.
- **Kartu belajar**: balik kartu, tandai Hafal atau Belum hafal, filter kategori, acak, balik arah, ulangi yang belum hafal. Pintasan keyboard: Spasi, panah kiri, panah kanan.
- **Kuis**: pilihan ganda atau ketik jawaban, arah Inggris ke Indonesia, sebaliknya, atau campur. Jawaban ketik tidak peka huruf besar/kecil, aksen, dan tanda baca. Arti dengan koma atau kurung diterima sebagian, dan salah ketik satu huruf pada kata panjang masih dihitung. Kata yang belum hafal diprioritaskan. Ada ulangi yang salah.
- **Kemajuan**: tiap kata punya tingkat 0 sampai 3. Jawaban benar menaikkan satu tingkat, jawaban salah mengembalikan ke 0.

## Format file impor

Baris pertama berisi judul kolom, urutan bebas. Nama kolom yang dikenali (huruf besar/kecil tidak berpengaruh):

| Isi | Nama kolom |
| --- | --- |
| Kata (wajib) | Kata, Word, Term, English, Inggris, Vocabulary |
| Arti (wajib) | Arti, Meaning, Translation, Terjemahan, Indonesia, Definition |
| Contoh | Contoh, Example, Sentence |
| Kategori | Kategori, Category, Topic, Tag, Unit, Bab |

Tanpa baris judul, kolom dibaca berurutan: Kata, Arti, Contoh, Kategori. Batas: 5 MB dan 5.000 baris per impor. Format .xls lama perlu disimpan ulang sebagai .xlsx. CSV boleh memakai pemisah koma, titik koma, atau tab (terdeteksi otomatis).

## Struktur folder

Dikelompokkan per fitur. Logika murni (tanpa React) dipisah dari komponen supaya mudah dites.

```
src/
  main.jsx                 titik masuk
  app/App.jsx              router dan provider
  components/              UI bersama (Button, Fields, EmptyState, ...)
  hooks/                   hook bersama (useVocabulary)
  lib/                     utilitas murni: text, csv, xlsx, random, id, speech, download
  styles/                  token warna (terang/gelap), reset, gaya UI bersama
  pages/                   satu file per rute, tipis, merangkai fitur
  languages/               satu file per bahasa (en, id, ja, es, ...), profile.js, index.js
    japanese/              IME romaji ke kana/kanji + kamus offline
  features/
    vocabulary/            model kata, reducer, penyimpanan, provider, form dan daftar
    import/                parser baris, rencana impor, pembaca file, pratinjau
    flashcards/            deck, state sesi, komponen kartu
    quiz/                  pembuat soal, penilai jawaban, state sesi, komponen kuis
```

Tes unit berada di samping kodenya (`*.test.js`). Halaman Impor, Kartu, dan Kuis dimuat lazy, dan pembaca Excel baru diunduh saat file .xlsx dipilih.

## Catatan teknis

- Pembacaan .xlsx memakai paket `read-excel-file`. Penulisan .xlsx (template dan ekspor) memakai penulis kecil di `src/lib/xlsx.js` tanpa dependensi.
- Data disimpan di `localStorage` dengan kunci `vocab-app:v1`. Isinya divalidasi saat dimuat. Jika penyimpanan diblokir, aplikasi tetap jalan dan menampilkan peringatan.
# vocab-app
