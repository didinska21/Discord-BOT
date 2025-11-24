require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const cliProgress = require('cli-progress');
const readline = require('readline');

const token = process.env.USER_TOKEN;
const channelId = process.env.CHANNEL_ID;

// ============================================
// KONFIGURASI DELAY (dalam milidetik)
// ============================================
const DELETE_DELAY = 1000; // 1 detik per pesan - ubah angka ini untuk mengatur delay hapus pesan
                            // Contoh: 1500 = 1.5 detik, 2000 = 2 detik
// ============================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function tanyaInput(pertanyaan) {
  return new Promise(resolve => rl.question(pertanyaan, resolve));
}

// ============================================
// FUNGSI HAPUS PESAN (DIPAKAI KEDUA MODE)
// ============================================
async function hapusBatchPesan(messages) {
  console.log(`\n[🗑️] Memulai penghapusan ${messages.length} pesan...\n`);
  
  const progressBar = new cliProgress.SingleBar({
    format: '🗑️  Progress: [{bar}] {percentage}% | {value}/{total} pesan | ETA: {eta}s',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true
  });
  
  progressBar.start(messages.length, 0);
  
  let berhasilHapus = 0;
  let gagalHapus = 0;
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    try {
      await axios.delete(
        `https://discord.com/api/v9/channels/${channelId}/messages/${msg.id}`,
        {
          headers: {
            Authorization: token,
            'User-Agent': 'Mozilla/5.0'
          }
        }
      );
      
      berhasilHapus++;
      progressBar.update(i + 1);
      
      // Delay setiap hapus pesan (ubah DELETE_DELAY di atas untuk mengatur)
      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELETE_DELAY));
      }
      
    } catch (err) {
      gagalHapus++;
      console.log(`\n[!] Gagal hapus pesan ${i + 1}: ${err.response?.status || err.message}`);
      
      // Jika rate limit, tunggu lebih lama
      if (err.response?.status === 429) {
        const retryAfter = err.response.data?.retry_after || 5;
        console.log(`[⏳] Rate limit! Menunggu ${retryAfter} detik...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      }
    }
  }
  
  progressBar.stop();
  
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║        ✅ SELESAI!                     ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`\n[✓] Berhasil dihapus: ${berhasilHapus} pesan`);
  console.log(`[✗] Gagal dihapus: ${gagalHapus} pesan`);
  console.log(`[⏱️] Total waktu: ~${Math.ceil((messages.length * DELETE_DELAY) / 1000)} detik\n`);
}

// ============================================
// MODE 1: HAPUS PESAN - MODE CEPAT (SEARCH API)
// ============================================
async function modeHapusCepat() {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║   ⚡ MODE CEPAT (Search API)           ║");
  console.log("╚════════════════════════════════════════╝\n");
  console.log("[ℹ️] Mode ini menggunakan Discord Search API (unofficial)");
  console.log("[ℹ️] Lebih cepat, langsung filter pesan Anda saja\n");
  
  // Ambil user ID
  let userId = null;
  let username = null;
  try {
    const meResponse = await axios.get('https://discord.com/api/v9/users/@me', {
      headers: {
        Authorization: token,
        'User-Agent': 'Mozilla/5.0'
      }
    });
    userId = meResponse.data.id;
    username = meResponse.data.username;
    console.log(`[👤] User: ${username}#${meResponse.data.discriminator || '0'}\n`);
  } catch (err) {
    console.error("[!] Error mendapatkan user info:", err.response?.status, err.response?.data || err.message);
    rl.close();
    return;
  }
  
  console.log("[🔍] Mencari pesan Anda menggunakan Search API...\n");
  
  let allMessages = [];
  let offset = 0;
  let totalResults = null;
  
  try {
    while (true) {
      const response = await axios.get(
        `https://discord.com/api/v9/channels/${channelId}/messages/search`,
        {
          headers: {
            Authorization: token,
            'User-Agent': 'Mozilla/5.0'
          },
          params: {
            author_id: userId,
            offset: offset
          }
        }
      );
      
      if (totalResults === null) {
        totalResults = response.data.total_results;
        console.log(`[📊] Total pesan Anda ditemukan: ${totalResults}\n`);
      }
      
      const messages = response.data.messages;
      if (!messages || messages.length === 0) break;
      
      // Flatten messages (karena search API return array of arrays)
      const flatMessages = messages.flat().filter(msg => msg.author.id === userId);
      allMessages.push(...flatMessages);
      
      process.stdout.write(`\r[📥] Progress: ${allMessages.length}/${totalResults} pesan`);
      
      offset += 25; // Search API return 25 results per page
      
      if (allMessages.length >= totalResults) break;
      
      // Delay agar tidak kena rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (err) {
    console.error("\n\n[!] Error saat search pesan:", err.response?.status, err.response?.data || err.message);
    console.log("[!] Mungkin Search API tidak tersedia, coba gunakan Mode Aman.");
    rl.close();
    return;
  }
  
  // Urutkan dari yang terlama ke terbaru
  allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  console.log(`\n\n[✓] Total pesan berhasil diambil: ${allMessages.length} pesan`);
  
  if (allMessages.length === 0) {
    console.log("[!] Tidak ada pesan untuk dihapus.");
    rl.close();
    return;
  }
  
  console.log(`[📅] Pesan tertua: ${new Date(allMessages[0].timestamp).toLocaleString('id-ID')}`);
  console.log(`[📅] Pesan terbaru: ${new Date(allMessages[allMessages.length - 1].timestamp).toLocaleString('id-ID')}\n`);
  
  // Input jumlah pesan yang mau dihapus
  const input = await tanyaInput(`\n💬 Hapus pesan dari awal, ketik jumlah (1 - ${allMessages.length}): `);
  const jumlahHapus = parseInt(input);
  
  if (isNaN(jumlahHapus) || jumlahHapus < 1) {
    console.log("[!] Input tidak valid. Harus angka minimal 1.");
    rl.close();
    return;
  }
  
  const actualHapus = Math.min(jumlahHapus, allMessages.length);
  const messagesToDelete = allMessages.slice(0, actualHapus);
  
  console.log(`\n[⚠️] Akan menghapus ${actualHapus} pesan dari yang terlama.`);
  
  if (jumlahHapus > allMessages.length) {
    console.log(`[ℹ️] Anda meminta ${jumlahHapus} pesan, tapi hanya ada ${allMessages.length}. Akan hapus semua.`);
  }
  
  const konfirmasi = await tanyaInput(`\n❓ Lanjutkan? (y/n): `);
  
  if (konfirmasi.toLowerCase() !== 'y') {
    console.log("[!] Dibatalkan.");
    rl.close();
    return;
  }
  
  await hapusBatchPesan(messagesToDelete);
  rl.close();
}

// ============================================
// MODE 2: HAPUS PESAN LAMA - MODE AMAN (FETCH MANUAL)
// ============================================
async function modeHapusAman() {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║   🛡️  MODE AMAN (Fetch Manual)         ║");
  console.log("╚════════════════════════════════════════╝\n");
  console.log("[ℹ️] Mode ini fetch semua pesan lalu filter manual");
  console.log("[ℹ️] Lebih lambat tapi lebih stabil\n");
  
  // Ambil user ID dari token (untuk filter)
  let userId = null;
  try {
    const meResponse = await axios.get('https://discord.com/api/v9/users/@me', {
      headers: {
        Authorization: token,
        'User-Agent': 'Mozilla/5.0'
      }
    });
    userId = meResponse.data.id;
    console.log(`[👤] User: ${meResponse.data.username}#${meResponse.data.discriminator || '0'}\n`);
  } catch (err) {
    console.error("[!] Error mendapatkan user info:", err.response?.status, err.response?.data || err.message);
    rl.close();
    return;
  }
  
  console.log("[📊] Mengambil data pesan dari server...\n");
  
  // Ambil semua pesan user dari channel
  let allMessages = [];
  let lastMessageId = null;
  let fetchCount = 0;
  const MAX_BATCHES = 100; // Batasi maksimal 100 batch (10,000 pesan) untuk mencegah loop tak terbatas
  
  try {
    while (fetchCount < MAX_BATCHES) {
      const params = { limit: 100 };
      if (lastMessageId) params.before = lastMessageId;
      
      const response = await axios.get(
        `https://discord.com/api/v9/channels/${channelId}/messages`,
        {
          headers: {
            Authorization: token,
            'User-Agent': 'Mozilla/5.0'
          },
          params
        }
      );
      
      const messages = response.data;
      if (messages.length === 0) break;
      
      // Filter hanya pesan milik user
      const userMessages = messages.filter(msg => msg.author.id === userId);
      allMessages.push(...userMessages);
      
      fetchCount++;
      process.stdout.write(`\r[📥] Batch ${fetchCount}/${MAX_BATCHES} | Pesan Anda: ${allMessages.length} | Total difetch: ${fetchCount * 100}`);
      
      lastMessageId = messages[messages.length - 1].id;
      
      // Delay agar tidak kena rate limit saat fetch
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (fetchCount >= MAX_BATCHES) {
      console.log(`\n[⚠️] Mencapai batas maksimal fetch (${MAX_BATCHES} batch). Jika pesan Anda lebih banyak, jalankan script lagi setelah hapus batch ini.`);
    }
  } catch (err) {
    console.error("\n\n[!] Error saat fetch pesan:", err.response?.status, err.response?.data || err.message);
    rl.close();
    return;
  }
  
  // Urutkan dari yang terlama ke terbaru (ascending by timestamp)
  allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  console.log(`\n\n[✓] Total pesan Anda di channel ini: ${allMessages.length} pesan`);
  
  if (allMessages.length === 0) {
    console.log("[!] Tidak ada pesan untuk dihapus.");
    rl.close();
    return;
  }
  
  console.log(`[📅] Pesan tertua: ${new Date(allMessages[0].timestamp).toLocaleString('id-ID')}`);
  console.log(`[📅] Pesan terbaru: ${new Date(allMessages[allMessages.length - 1].timestamp).toLocaleString('id-ID')}\n`);
  
  // Input jumlah pesan yang mau dihapus
  const input = await tanyaInput(`\n💬 Hapus pesan dari awal, ketik jumlah (1 - ${allMessages.length}): `);
  const jumlahHapus = parseInt(input);
  
  if (isNaN(jumlahHapus) || jumlahHapus < 1) {
    console.log("[!] Input tidak valid. Harus angka minimal 1.");
    rl.close();
    return;
  }
  
  const actualHapus = Math.min(jumlahHapus, allMessages.length);
  const messagesToDelete = allMessages.slice(0, actualHapus);
  
  console.log(`\n[⚠️] Akan menghapus ${actualHapus} pesan dari yang terlama.`);
  
  if (jumlahHapus > allMessages.length) {
    console.log(`[ℹ️] Anda meminta ${jumlahHapus} pesan, tapi hanya ada ${allMessages.length}. Akan hapus semua.`);
  }
  
  const konfirmasi = await tanyaInput(`\n❓ Lanjutkan? (y/n): `);
  
  if (konfirmasi.toLowerCase() !== 'y') {
    console.log("[!] Dibatalkan.");
    rl.close();
    return;
  }
  
  await hapusBatchPesan(messagesToDelete);
  rl.close();
}

// ============================================
// MENU UTAMA
// ============================================
async function menuUtama() {
  console.clear();
  console.log("╔════════════════════════════════════════╗");
  console.log("║   DISCORD MESSAGE DELETER v2.0         ║");
  console.log("╚════════════════════════════════════════╝\n");
  console.log("Pilih Mode Hapus Pesan:\n");
  console.log("  [1] ⚡ Mode Cepat (Search API - Recommended)");
  console.log("      → Langsung filter pesan Anda saja");
  console.log("      → Lebih cepat tapi unofficial API\n");
  console.log("  [2] 🛡️  Mode Aman (Fetch Manual)");
  console.log("      → Fetch semua pesan lalu filter");
  console.log("      → Lebih lambat tapi stabil\n");
  console.log("  [0] Keluar\n");
  
  const pilihan = await tanyaInput("Pilih [1/2/0]: ");
  
  switch(pilihan.trim()) {
    case '1':
      await modeHapusCepat();
      break;
    case '2':
      await modeHapusAman();
      break;
    case '0':
      console.log("\n[👋] Keluar...\n");
      rl.close();
      process.exit(0);
      break;
    default:
      console.log("\n[!] Pilihan tidak valid!\n");
      rl.close();
      process.exit(1);
  }
}

// Jalankan menu
menuUtama();
