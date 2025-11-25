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
const FETCH_DELAY = 500;    // 0.5 detik delay saat fetch pesan (agar tidak rate limit)
const MAX_RETRY = 3;        // Maksimal retry jika hapus pesan gagal
const RETRY_DELAY = 2000;   // 2 detik delay sebelum retry hapus pesan
// ============================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function tanyaInput(pertanyaan) {
  return new Promise(resolve => rl.question(pertanyaan, resolve));
}

// ============================================
// FUNGSI HAPUS PESAN
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
  const pesanGagal = []; // Simpan ID pesan yang gagal
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    let deleted = false;
    let retryCount = 0;
    
    // Coba hapus dengan retry hingga MAX_RETRY kali
    while (!deleted && retryCount <= MAX_RETRY) {
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
        deleted = true;
        progressBar.update(i + 1);
        
        // Delay setiap hapus pesan (ubah DELETE_DELAY di atas untuk mengatur)
        if (i < messages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELETE_DELAY));
        }
        
      } catch (err) {
        retryCount++;
        
        // Jika rate limit, tunggu lebih lama
        if (err.response?.status === 429) {
          const retryAfter = err.response.data?.retry_after || 5;
          progressBar.stop();
          console.log(`\n[⏳] Rate limit! Menunggu ${retryAfter} detik... (Retry ${retryCount}/${MAX_RETRY})`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          progressBar.start(messages.length, i);
        } 
        // Error lain (403, 404, dll)
        else if (retryCount <= MAX_RETRY) {
          progressBar.stop();
          console.log(`\n[⚠️] Pesan ${i + 1} gagal dihapus (${err.response?.status || err.message}). Retry ${retryCount}/${MAX_RETRY}...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          progressBar.start(messages.length, i);
        }
        // Sudah retry MAX_RETRY kali tapi masih gagal
        else {
          gagalHapus++;
          pesanGagal.push({
            index: i + 1,
            id: msg.id,
            content: msg.content?.substring(0, 50) || '[No content]',
            error: err.response?.status || err.message
          });
          progressBar.stop();
          console.log(`\n[✗] Pesan ${i + 1} gagal setelah ${MAX_RETRY}x retry: ${err.response?.status || err.message}`);
          progressBar.start(messages.length, i + 1);
        }
      }
    }
  }
  
  progressBar.stop();
  
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║        ✅ SELESAI!                     ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`\n[✓] Berhasil dihapus: ${berhasilHapus} pesan`);
  console.log(`[✗] Gagal dihapus: ${gagalHapus} pesan`);
  
  // Tampilkan detail pesan yang gagal
  if (pesanGagal.length > 0) {
    console.log(`\n[📋] Detail pesan yang gagal dihapus:\n`);
    pesanGagal.forEach(p => {
      console.log(`   #${p.index} | ID: ${p.id} | Error: ${p.error}`);
      console.log(`   Content: "${p.content}${p.content.length >= 50 ? '...' : ''}"\n`);
    });
  }
  
  console.log(`[⏱️] Total waktu: ~${Math.ceil((messages.length * DELETE_DELAY) / 1000)} detik\n`);
}

// ============================================
// MODE HAPUS PESAN
// ============================================
async function modeHapusPesan() {
  console.clear();
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║   🗑️  DISCORD MESSAGE DELETER          ║");
  console.log("╚════════════════════════════════════════╝\n");
  
  // Ambil user ID dari token (untuk filter)
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
    const discriminator = meResponse.data.discriminator || '0';
    console.log(`[👤] Logged in as: ${username}#${discriminator}`);
    console.log(`[🆔] User ID: ${userId}\n`);
  } catch (err) {
    console.error("[!] Error mendapatkan user info:", err.response?.status, err.response?.data || err.message);
    console.log("[!] Pastikan USER_TOKEN di .env sudah benar!");
    rl.close();
    return;
  }
  
  // Pilih mode filter DULU sebelum fetch
  console.log("╔════════════════════════════════════════╗");
  console.log("║   PILIH MODE FILTER                    ║");
  console.log("╚════════════════════════════════════════╝\n");
  console.log("  [1] Hapus semua pesan (tanpa filter tanggal)");
  console.log("  [2] Hapus berdasarkan rentang tanggal\n");
  
  const modeFilter = await tanyaInput("Pilih mode [1/2]: ");
  
  let dateStart = null;
  let dateEnd = null;
  let useFilter = false;
  
  if (modeFilter.trim() === '2') {
    // Input rentang tanggal
    console.log("\n[📅] Filter berdasarkan rentang tanggal");
    console.log("[ℹ️] Format tanggal: DD/MM/YYYY (contoh: 13/11/2024)\n");
    
    const tanggalMulai = await tanyaInput("Tanggal mulai (DD/MM/YYYY): ");
    const tanggalAkhir = await tanyaInput("Tanggal akhir (DD/MM/YYYY): ");
    
    // Parse tanggal
    const parseTanggal = (str) => {
      const [day, month, year] = str.split('/').map(Number);
      return new Date(year, month - 1, day);
    };
    
    try {
      dateStart = parseTanggal(tanggalMulai);
      dateEnd = parseTanggal(tanggalAkhir);
      
      // Set waktu untuk cover seluruh hari
      dateStart.setHours(0, 0, 0, 0);
      dateEnd.setHours(23, 59, 59, 999);
      
      if (isNaN(dateStart.getTime()) || isNaN(dateEnd.getTime())) {
        console.log("[!] Format tanggal tidak valid!");
        rl.close();
        return;
      }
      
      if (dateStart > dateEnd) {
        console.log("[!] Tanggal mulai tidak boleh lebih besar dari tanggal akhir!");
        rl.close();
        return;
      }
      
      useFilter = true;
      console.log(`\n[✓] Filter aktif: ${tanggalMulai} - ${tanggalAkhir}`);
      
    } catch (err) {
      console.log("[!] Error parsing tanggal:", err.message);
      rl.close();
      return;
    }
  }
  
  // Input jumlah pesan yang mau di-fetch (manual)
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║   JUMLAH PESAN YANG MAU DI-FETCH       ║");
  console.log("╚════════════════════════════════════════╝\n");
  console.log("[ℹ️] 1 batch = 100 pesan");
  console.log("[ℹ️] Contoh: 1000 pesan = 10 batch, 10000 pesan = 100 batch");
  console.log("[ℹ️] Estimasi waktu: 1000 pesan ~8 menit, 10000 pesan ~80 menit\n");
  
  const inputFetch = await tanyaInput("Mau fetch berapa pesan? (contoh: 1000, 10000, 100000): ");
  const maxFetch = parseInt(inputFetch);
  
  if (isNaN(maxFetch) || maxFetch < 1) {
    console.log("[!] Input tidak valid. Harus angka minimal 1.");
    rl.close();
    return;
  }
  
  const maxBatches = Math.ceil(maxFetch / 100);
  
  console.log(`\n[⚙️] Akan fetch maksimal ${maxFetch} pesan (${maxBatches} batch)`);
  console.log(`[⏱️] Estimasi waktu fetch: ~${Math.ceil(maxBatches * FETCH_DELAY / 1000)} detik\n`);
  
  const konfirmasiFetch = await tanyaInput("Lanjutkan fetch? (y/n): ");
  if (konfirmasiFetch.toLowerCase() !== 'y') {
    console.log("[!] Dibatalkan.");
    rl.close();
    return;
  }
  
  console.log("\n[📊] Mengambil data pesan dari channel...\n");
  
  // Ambil semua pesan user dari channel
  let allMessages = [];
  let lastMessageId = null;
  let fetchCount = 0;
  
  const fetchProgressBar = new cliProgress.SingleBar({
    format: '[📥] Fetching: [{bar}] {percentage}% | Batch {value}/{total} | Pesan Anda: {userMsg}',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true
  });
  
  fetchProgressBar.start(maxBatches, 0, { userMsg: 0 });
  
  try {
    while (fetchCount < maxBatches) {
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
      if (messages.length === 0) {
        fetchProgressBar.stop();
        console.log("\n[✓] Semua pesan di channel sudah diambil.");
        break;
      }
      
      // Filter hanya pesan milik user
      const userMessages = messages.filter(msg => msg.author.id === userId);
      allMessages.push(...userMessages);
      
      fetchCount++;
      fetchProgressBar.update(fetchCount, { userMsg: allMessages.length });
      
      lastMessageId = messages[messages.length - 1].id;
      
      // Delay agar tidak kena rate limit saat fetch
      await new Promise(resolve => setTimeout(resolve, FETCH_DELAY));
    }
    
    fetchProgressBar.stop();
    
  } catch (err) {
    fetchProgressBar.stop();
    console.error("\n[!] Error saat fetch pesan:", err.response?.status, err.response?.data || err.message);
    console.log("[!] Pastikan CHANNEL_ID di .env sudah benar dan Anda punya akses ke channel tersebut!");
    rl.close();
    return;
  }
  
  console.log(`\n[✓] Total pesan Anda yang di-fetch: ${allMessages.length} pesan\n`);
  
  if (allMessages.length === 0) {
    console.log("[!] Tidak ada pesan untuk dihapus.");
    rl.close();
    return;
  }
  
  // Urutkan dari yang terlama ke terbaru (ascending by timestamp)
  allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  // Filter berdasarkan tanggal jika mode filter aktif
  let filteredMessages = allMessages;
  
  if (useFilter && dateStart && dateEnd) {
    filteredMessages = allMessages.filter(msg => {
      const msgDate = new Date(msg.timestamp);
      return msgDate >= dateStart && msgDate <= dateEnd;
    });
    
    console.log(`[📅] Pesan dalam rentang tanggal: ${filteredMessages.length} pesan`);
    
    if (filteredMessages.length === 0) {
      console.log("[!] Tidak ada pesan dalam rentang tanggal tersebut.");
      rl.close();
      return;
    }
  }
  
  console.log(`[📅] Pesan tertua: ${new Date(filteredMessages[0].timestamp).toLocaleString('id-ID')}`);
  console.log(`[📅] Pesan terbaru: ${new Date(filteredMessages[filteredMessages.length - 1].timestamp).toLocaleString('id-ID')}\n`);
  
  // Input jumlah pesan yang mau dihapus
  const input = await tanyaInput(`💬 Hapus berapa pesan dari yang terlama? (1 - ${filteredMessages.length}): `);
  const jumlahHapus = parseInt(input);
  
  if (isNaN(jumlahHapus) || jumlahHapus < 1) {
    console.log("[!] Input tidak valid. Harus angka minimal 1.");
    rl.close();
    return;
  }
  
  const actualHapus = Math.min(jumlahHapus, filteredMessages.length);
  const messagesToDelete = filteredMessages.slice(0, actualHapus);
  
  console.log(`\n[⚠️] Akan menghapus ${actualHapus} pesan dari yang terlama.`);
  
  if (jumlahHapus > filteredMessages.length) {
    console.log(`[ℹ️] Anda meminta ${jumlahHapus} pesan, tapi hanya ada ${filteredMessages.length}. Akan hapus semua.`);
  }
  
  const konfirmasi = await tanyaInput(`\n❓ Lanjutkan hapus ${actualHapus} pesan? (y/n): `);
  
  if (konfirmasi.toLowerCase() !== 'y') {
    console.log("[!] Dibatalkan.");
    rl.close();
    return;
  }
  
  await hapusBatchPesan(messagesToDelete);
  rl.close();
}

// Jalankan script
modeHapusPesan();
