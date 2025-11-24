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

async function countdown(seconds) {
  const bar = new cliProgress.SingleBar({
    format: '⏳ Menunggu {remaining}s: [{bar}] {percentage}%',
    barCompleteChar: '█',
    barIncompleteChar: '-',
    hideCursor: true,
    linewrap: false,
    clearOnComplete: true
  });
  
  bar.start(seconds, 0, { remaining: seconds });
  
  for (let i = 0; i <= seconds; i++) {
    bar.update(i, { remaining: seconds - i });
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  bar.stop();
}

// ============================================
// MODE 1: KIRIM PESAN (KODE LAMA)
// ============================================
async function modeKirimPesan() {
  const pesanList = fs.readFileSync('pesan.txt', 'utf-8')
    .split('\n').map(p => p.trim()).filter(p => p !== '');

  if (pesanList.length === 0) {
    console.error("[!] File pesan.txt kosong.");
    process.exit(1);
  }

  let indexPesan = 0;

  async function hapusPesan(messageId) {
    while (true) {
      try {
        await axios.delete(`https://discord.com/api/v9/channels/${channelId}/messages/${messageId}`, {
          headers: {
            Authorization: token,
            'User-Agent': 'Mozilla/5.0'
          }
        });
        console.log(`\n[🗑️] Pesan ${messageId} berhasil dihapus`);
        break;
      } catch (err) {
        console.error(`\n[!] Gagal hapus pesan:`, err.response?.status, err.response?.data || err.message);
        console.log(`[↻] Retry hapus pesan dalam 1 detik...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async function kirimPesanDenganRetry() {
    const pesan = pesanList[indexPesan];
    indexPesan = (indexPesan + 1) % pesanList.length;
    
    while (true) {
      try {
        const res = await axios.post(`https://discord.com/api/v9/channels/${channelId}/messages`,
          { content: pesan },
          {
            headers: {
              Authorization: token,
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0'
            }
          }
        );
        
        console.log(`\n[✔] Kirim: "${pesan}"`);
        setTimeout(() => hapusPesan(res.data.id), 500);
        break;
      } catch (err) {
        console.error(`\n[!] Gagal kirim, retry dalam 5 detik...`, err.response?.status, err.response?.data || err.message);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    await countdown(60);
    kirimPesanDenganRetry();
  }

  console.log("\n[🚀] Mode Kirim Pesan dimulai...\n");
  kirimPesanDenganRetry();
}

// ============================================
// MODE 2: HAPUS PESAN LAMA
// ============================================
async function modeHapusPesanLama() {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║   🗑️  MODE HAPUS PESAN LAMA           ║");
  console.log("╚════════════════════════════════════════╝\n");
  
  console.log("[📊] Mengambil data pesan Anda dari server...\n");
  
  // Ambil semua pesan user dari channel
  let allMessages = [];
  let lastMessageId = null;
  let fetchCount = 0;
  
  try {
    while (true) {
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
      const userMessages = messages.filter(msg => msg.author.id === response.data[0].author.id);
      allMessages.push(...userMessages);
      
      fetchCount++;
      process.stdout.write(`\r[📥] Fetching batch ${fetchCount}... Total pesan ditemukan: ${allMessages.length}`);
      
      lastMessageId = messages[messages.length - 1].id;
      
      // Delay agar tidak kena rate limit saat fetch
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (err) {
    console.error("\n\n[!] Error saat fetch pesan:", err.response?.status, err.response?.data || err.message);
    process.exit(1);
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
  
  console.log(`\n[🗑️] Memulai penghapusan ${actualHapus} pesan...\n`);
  
  const progressBar = new cliProgress.SingleBar({
    format: '🗑️  Progress: [{bar}] {percentage}% | {value}/{total} pesan | ETA: {eta}s',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true
  });
  
  progressBar.start(actualHapus, 0);
  
  let berhasilHapus = 0;
  let gagalHapus = 0;
  
  for (let i = 0; i < actualHapus; i++) {
    const msg = allMessages[i];
    
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
      if (i < actualHapus - 1) {
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
  console.log(`[⏱️] Total waktu: ~${Math.ceil((actualHapus * DELETE_DELAY) / 1000)} detik\n`);
  
  rl.close();
}

// ============================================
// MENU UTAMA
// ============================================
async function menuUtama() {
  console.clear();
  console.log("╔════════════════════════════════════════╗");
  console.log("║   DISCORD MESSAGE MANAGER v2.0         ║");
  console.log("╚════════════════════════════════════════╝\n");
  console.log("Pilih Mode:\n");
  console.log("  [1] Kirim Pesan Otomatis (mode lama)");
  console.log("  [2] Hapus Pesan Lama (dari yang terlama)");
  console.log("  [0] Keluar\n");
  
  const pilihan = await tanyaInput("Pilih [1/2/0]: ");
  
  switch(pilihan.trim()) {
    case '1':
      rl.close();
      modeKirimPesan();
      break;
    case '2':
      await modeHapusPesanLama();
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
