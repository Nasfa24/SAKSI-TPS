/**
 * KONFIGURASI API
 * Ganti URL di bawah dengan Web App URL dari Google Apps Script yang sudah Anda Deploy!
 */
const API_URL = "https://script.google.com/macros/s/AKfycbxSbe79gXWIYFXysaFWmdt8WNbcPYBvq0Ulf0clh6-XzKSKm60cncZp9q3mgse9Er8k/exec"; 

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

document.addEventListener("DOMContentLoaded", () => {
    initDB();
    renderPartaiInputs();
    checkNetworkStatus();

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    
    document.getElementById('file_c1').addEventListener('change', handleFileSelect);
    document.getElementById('form-c1').addEventListener('submit', handleFormSubmit);
    document.getElementById('btn-refresh').addEventListener('click', handleClearCache);
});

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

// Update untuk penanganan multiple file display
function handleFileSelect(e) {
    const files = e.target.files;
    const fileNameDisplay = document.getElementById('file-name');
    if (files.length > 0) {
        fileNameDisplay.textContent = `✅ ${files.length} dokumen telah dipilih.`;
        if (files.length < 5) {
            fileNameDisplay.style.color = "#FF9c08"; // Peringatan visual jika kurang dari 5
        } else {
            fileNameDisplay.style.color = "#03754c";
        }
    } else {
        fileNameDisplay.textContent = "Belum ada foto yang dipilih.";
    }
}

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

function updateNetworkStatus() {
    const badge = document.getElementById('network-status');
    const warning = document.getElementById('antrean-info');
    if (navigator.onLine) {
        badge.textContent = "Online";
        badge.className = "status-badge online";
        warning.classList.add('hidden');
        syncOfflineData(); 
    } else {
        badge.textContent = "Offline Mode";
        badge.className = "status-badge offline";
        warning.classList.remove('hidden');
    }
}
function checkNetworkStatus() { updateNetworkStatus(); }

function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    const btnSubmit = document.getElementById('btn-submit');
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Memproses Data...";

    try {
        const fileInput = document.getElementById('file_c1');
        const rawFiles = fileInput.files;
        
        // 1. Validasi Minimum 5 Foto
        if (rawFiles.length < 5) {
            throw new Error(`Anda baru melampirkan ${rawFiles.length} foto. Minimal 5 foto C1 wajib dilampirkan agar data valid untuk verifikasi.`);
        }
        
        // 2. Kumpulkan & Validasi Data Suara
        let data_suara = [];
        let missingMandatory = [];
        const requiredPartaiIds = [1, 2, 3, 4]; // PKB, Gerindra, PDIP, Golkar

        partaiList.forEach(partai => {
            const suaraPartai = document.querySelector(`input[name="suara_partai_${partai.id}"]`).value;
            const suaraCaleg = document.querySelector(`input[name="suara_caleg_${partai.id}"]`).value;
            
            // Peringatan jika partai wajib kosong sama sekali
            if (requiredPartaiIds.includes(partai.id) && (suaraPartai === "" && suaraCaleg === "")) {
                missingMandatory.push(partai.nama);
            }

            data_suara.push({
                id_partai: partai.id,
                nama_partai: partai.nama,
                suara_partai: suaraPartai === "" ? 0 : parseInt(suaraPartai),
                total_suara_caleg: suaraCaleg === "" ? 0 : parseInt(suaraCaleg)
            });
        });

        // Hentikan proses jika partai wajib tidak diisi
        if (missingMandatory.length > 0) {
            throw new Error(`Anda belum mengisi hasil suara untuk partai wajib: ${missingMandatory.join(', ')}.`);
        }

        // 3. Konversi array file fisik menjadi array Base64
        let processedFiles = [];
        for (let i = 0; i < rawFiles.length; i++) {
            const base64Data = await getBase64(rawFiles[i]);
            processedFiles.push({
                base64: base64Data,
                mime: rawFiles[i].type,
                ext: rawFiles[i].name.split('.').pop()
            });
        }

        const payload = {
            action: "SUBMIT_C1",
            payload: {
                nik_saksi: document.getElementById('nik').value,
                kecamatan: document.getElementById('kecamatan').value,
                kelurahan: document.getElementById('kelurahan').value,
                tps: document.getElementById('tps').value,
                alamat: document.getElementById('alamat').value,
                data_suara: data_suara,
                files: processedFiles // Mengirim array files
            }
        };

        if (navigator.onLine) {
            await sendDataToServer(payload);
        } else {
            await saveToOfflineQueue(payload);
        }

        // Reset
        document.getElementById('form-c1').reset();
        document.getElementById('file-name').textContent = "Belum ada foto yang dipilih.";

    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Validasi Gagal', text: error.message, confirmButtonColor: '#03754c' });
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Kirim Data TPS";
    }
}

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
        throw new Error("Gagal terhubung ke server. Pastikan URL API benar atau NIK Anda sudah terdaftar. Detail: " + error.message);
    }
}

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
                    const deleteTx = db.transaction(STORE_NAME, "readwrite");
                    deleteTx.objectStore(STORE_NAME).delete(item.id);
                } catch (err) {
                    console.error("Gagal sinkronisasi data ID " + item.id, err);
                    break;
                }
            }
        }
    };
}

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
