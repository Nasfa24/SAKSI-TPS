/**
 * KONFIGURASI API
 * Ganti URL di bawah dengan Web App URL dari Google Apps Script yang sudah Anda Deploy!
 */
const API_URL = "URL_WEB_APP_GOOGLE_SCRIPT_ANDA_DISINI"; 

const DB_NAME = "RealCountDB";
const STORE_NAME = "antrean_c1";
let db;

// Daftar Partai Wajib & Tambahan
const partaiList = [
    { id: 1, nama: "PKB (Partai Kebangkitan Bangsa)" },
    { id: 2, nama: "Gerindra (Partai Gerakan Indonesia Raya)" },
    { id: 3, nama: "PDIP (Partai Demokrasi Indonesia Perjuangan)" },
    { id: 4, nama: "Golkar (Golongan Karya)" },
    { id: 5, nama: "NasDem" },
    { id: 6, nama: "Partai Buruh" },
    { id: 7, nama: "Gelora" },
    { id: 8, nama: "PKS (Partai Keadilan Sejahtera)" },
    { id: 9, nama: "PKN (Partai Kebangkitan Nusantara)" },
    { id: 10, nama: "Hanura" }
];

// Inisialisasi Aplikasi
document.addEventListener("DOMContentLoaded", () => {
    initDB();
    renderPartaiInputs();
    checkNetworkStatus();

    // Event Listeners
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    
    document.getElementById('file_c1').addEventListener('change', handleFileSelect);
    document.getElementById('form-c1').addEventListener('submit', handleFormSubmit);
    document.getElementById('btn-refresh').addEventListener('click', handleClearCache);
});

// Render Input Form Secara Dinamis
function renderPartaiInputs() {
    const container = document.getElementById('partai-container');
    let html = '';
    partaiList.forEach(partai => {
        html += `
            <div class="partai-item">
                <h3>${partai.id}. ${partai.nama}</h3>
                <div class="suara-grid">
                    <div class="input-group">
                        <label>Suara Partai</label>
                        <input type="number" name="suara_partai_${partai.id}" min="0" placeholder="0">
                    </div>
                    <div class="input-group">
                        <label>Total Suara Caleg</label>
                        <input type="number" name="suara_caleg_${partai.id}" min="0" placeholder="0">
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// Menampilkan Nama File C1 yang dipilih
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        document.getElementById('file-name').textContent = "✅ Dokumen siap: " + file.name;
    }
}

// Inisialisasi IndexedDB untuk Mode Offline
function initDB() {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        }
    };
    request.onsuccess = (e) => { db = e.target.result; syncOfflineData(); };
    request.onerror = (e) => console.error("Database error:", e.target.error);
}

// Deteksi Status Sinyal
function updateNetworkStatus() {
    const badge = document.getElementById('network-status');
    const warning = document.getElementById('antrean-info');
    if (navigator.onLine) {
        badge.textContent = "Online";
        badge.className = "status-badge online";
        warning.classList.add('hidden');
        syncOfflineData(); // Coba sinkronisasi jika tiba-tiba online
    } else {
        badge.textContent = "Offline Mode";
        badge.className = "status-badge offline";
        warning.classList.remove('hidden');
    }
}
function checkNetworkStatus() { updateNetworkStatus(); }

// Konversi File Fisik menjadi Base64 untuk dikirim via JSON
function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Main Submit Handler (Mencegah Klik Ganda)
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const btnSubmit = document.getElementById('btn-submit');
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Memproses Data...";

    try {
        const fileInput = document.getElementById('file_c1');
        const file = fileInput.files[0];
        
        if (!file) throw new Error("Foto C1 wajib diunggah!");

        const base64Data = await getBase64(file);
        const fileExtension = file.name.split('.').pop();
        
        // Mengumpulkan Data Suara
        let data_suara = [];
        partaiList.forEach(partai => {
            const suaraPartai = document.querySelector(`input[name="suara_partai_${partai.id}"]`).value || 0;
            const suaraCaleg = document.querySelector(`input[name="suara_caleg_${partai.id}"]`).value || 0;
            data_suara.push({
                id_partai: partai.id,
                nama_partai: partai.nama,
                suara_partai: parseInt(suaraPartai),
                total_suara_caleg: parseInt(suaraCaleg)
            });
        });

        const payload = {
            action: "SUBMIT_C1",
            payload: {
                nik_saksi: document.getElementById('nik').value,
                kecamatan: document.getElementById('kecamatan').value,
                kelurahan: document.getElementById('kelurahan').value,
                tps: document.getElementById('tps').value,
                alamat: document.getElementById('alamat').value,
                data_suara: data_suara,
                file_c1_base64: base64Data,
                file_mime_type: file.type,
                file_extension: fileExtension
            }
        };

        if (navigator.onLine) {
            await sendDataToServer(payload);
        } else {
            await saveToOfflineQueue(payload);
        }

        // Reset Form setelah sukses
        document.getElementById('form-c1').reset();
        document.getElementById('file-name').textContent = "Belum ada foto yang dipilih.";

    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Oops...', text: error.message, confirmButtonColor: '#03754c' });
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Kirim Data TPS";
    }
}

// Fungsi Kirim ke Google Apps Script (Backend)
async function sendDataToServer(payload) {
    Swal.fire({
        title: 'Mengirim Data...',
        text: 'Mohon tunggu, jangan tutup aplikasi.',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            mode: "cors", 
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.status === "success") {
            Swal.fire({
                icon: 'success',
                title: 'Mantap!',
                text: 'Data TPS dan Foto C1 berhasil terkirim ke Server.',
                confirmButtonColor: '#03754c'
            });
            return true;
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        throw new Error("Gagal terhubung ke server. Pastikan URL API benar. Detail: " + error.message);
    }
}

// Fungsi Simpan ke IndexedDB jika Offline
function saveToOfflineQueue(payload) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.add({ payload: payload, timestamp: new Date().getTime() });
        
        tx.oncomplete = () => {
            Swal.fire({
                icon: 'warning',
                title: 'Disimpan Lokal (Offline)',
                text: 'Sinyal terputus. Data Anda aman tersimpan di HP dan akan otomatis terkirim saat sinyal kembali.',
                confirmButtonColor: '#FF9c08'
            });
            resolve();
        };
        tx.onerror = () => reject(new Error("Gagal menyimpan ke penyimpanan offline."));
    });
}

// Background Sync Task
async function syncOfflineData() {
    if (!navigator.onLine || !db) return;

    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = async () => {
        const antrean = request.result;
        if (antrean.length > 0) {
            console.log(`Menyinkronkan ${antrean.length} data tertunda...`);
            for (let item of antrean) {
                try {
                    await sendDataToServer(item.payload);
                    // Hapus dari IndexedDB jika berhasil
                    const deleteTx = db.transaction(STORE_NAME, "readwrite");
                    deleteTx.objectStore(STORE_NAME).delete(item.id);
                } catch (err) {
                    console.error("Gagal sinkronisasi data ID " + item.id, err);
                    break; // Berhenti jika masih gagal (mungkin koneksi putus lagi)
                }
            }
        }
    };
}

// Fitur Anti-Bug: Refresh & Clear Cache menyeluruh
function handleClearCache() {
    Swal.fire({
        title: 'Refresh & Bersihkan Cache?',
        text: "Gunakan fitur ini jika aplikasi terasa berat atau ada update sistem baru.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#FF9c08',
        cancelButtonColor: '#03754c',
        confirmButtonText: 'Ya, Bersihkan!'
    }).then((result) => {
        if (result.isConfirmed) {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for(let registration of registrations) { registration.unregister(); }
                });
            }
            caches.keys().then((keyList) => {
                return Promise.all(keyList.map((key) => { return caches.delete(key); }));
            }).then(() => {
                window.location.reload(true);
            });
        }
    });
}