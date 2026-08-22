const GAS_URL = "https://script.google.com/macros/s/AKfycbxSbe79gXWIYFXysaFWmdt8WNbcPYBvq0Ulf0clh6-XzKSKm60cncZp9q3mgse9Er8k/exec"; 

let userSession = JSON.parse(localStorage.getItem('user_session')) || null;
let fotoBase64Global = "";

// PWA: Daftarkan Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}

// Router sederhana
window.onload = () => {
    if (userSession) {
        showApp();
    } else {
        document.getElementById('login-page').classList.remove('hidden');
    }
    checkOnlineStatus();
    window.addEventListener('online', checkOnlineStatus);
    window.addEventListener('offline', checkOnlineStatus);
};

function checkOnlineStatus() {
    const offlineBar = document.getElementById('offline-bar');
    if (navigator.onLine) {
        offlineBar.classList.add('hidden');
        processOfflineQueue(); // Otomatis sync jika online
    } else {
        offlineBar.classList.remove('hidden');
    }
    updateSyncBadge();
}

async function apiCall(action, payload) {
    const response = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" }, // Wajib text/plain untuk GAS
        body: JSON.stringify({ action, payload })
    });
    return response.json();
}

// === AUTENTIKASI ===
async function login() {
    const pin = document.getElementById('pin').value;
    const pass = document.getElementById('password').value;
    const msg = document.getElementById('login-msg');
    
    if (!pin || !pass) return msg.innerText = "Isi PIN dan Password";
    msg.innerText = "Mengecek kredensial...";
    
    if (!navigator.onLine) return msg.innerText = "Anda harus Online untuk login pertama kali.";

    try {
        const res = await apiCall("LOGIN", { pin: pin, password: pass });
        if (res.code === 200) {
            userSession = res.data;
            localStorage.setItem('user_session', JSON.stringify(userSession));
            showApp();
        } else {
            msg.innerText = res.message;
        }
    } catch (e) {
        msg.innerText = "Gagal terhubung ke server.";
    }
}

// === MAIN APP ===
async function showApp() {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app-page').classList.remove('hidden');
    document.getElementById('user-tps').innerText = `TPS ${userSession.tps} - ${userSession.kelurahan}`;
    
    // Load Master Partai
    let masterPartai = JSON.parse(localStorage.getItem('master_partai'));
    
    if (!masterPartai && navigator.onLine) {
        const res = await apiCall("GET_MASTER", {});
        masterPartai = res.data.partai;
        localStorage.setItem('master_partai', JSON.stringify(masterPartai));
    }
    
    renderPartai(masterPartai || []);
}

function renderPartai(partaiList) {
    const container = document.getElementById('partai-container');
    container.innerHTML = "";
    partaiList.forEach(p => {
        container.innerHTML += `
            <div class="flex items-center justify-between border-b pb-2">
                <div class="font-bold text-gray-700">${p.nomor}. ${p.nama}</div>
                <input type="number" min="0" id="partai-${p.nomor}" class="suara-input w-24 text-right px-2 py-1 border rounded focus:border-red-500" placeholder="0">
            </div>
        `;
    });
}

// === KOMPRESI GAMBAR (BOIL THE OCEAN STANDARD) ===
// Menghindari limitasi payload GAS dengan kompresi sisi klien
function compressAndPreview(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
            const canvas = document.getElementById('canvas-compress');
            const ctx = canvas.getContext('2d');
            
            // Limit resolusi maksimal 1280px (Cukup jelas untuk C1, sangat kecil di payload)
            const MAX_WIDTH = 1280;
            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            // Kualitas kompresi JPG 0.7
            fotoBase64Global = canvas.toDataURL("image/jpeg", 0.7); 
            
            // UI Update
            const preview = document.getElementById('preview-foto');
            preview.src = fotoBase64Global;
            preview.classList.remove('hidden');
            document.getElementById('label-foto').innerText = "Foto Terekam ✓";
        }
    };
}

// === SUBMIT & OFFLINE QUEUE ===
async function submitData() {
    const alamat = document.getElementById('alamat-tps').value;
    const btn = document.getElementById('btn-submit');
    const msg = document.getElementById('submit-msg');
    
    if (!alamat || !fotoBase64Global) {
        msg.innerText = "Alamat dan Foto C1 wajib diisi!";
        msg.className = "text-center font-bold mt-2 text-red-600";
        return;
    }

    // Ekstrak data suara dari input form
    let dataSuara = {};
    document.querySelectorAll('.suara-input').forEach(input => {
        let idPartai = input.id.split('-')[1];
        dataSuara[idPartai] = parseInt(input.value) || 0;
    });

    // Format Nama Sesuai Permintaan: [Kecamatan]_[Kelurahan]_[TPS]_[Alamat]
    const namaFile = `${userSession.kecamatan}_${userSession.kelurahan}_${userSession.tps}_${alamat.replace(/[^a-zA-Z0-9 ]/g, "")}.jpg`;

    const payload = {
        pin: userSession.pin,
        kecamatan: userSession.kecamatan,
        kelurahan: userSession.kelurahan,
        tps: userSession.tps,
        alamat: alamat,
        data_suara: dataSuara,
        foto_base64: fotoBase64Global,
        mime_type: "image/jpeg",
        nama_file: namaFile
    };

    btn.disabled = true;
    btn.innerText = "Memproses...";

    if (!navigator.onLine) {
        // SIMPAN KE LOKAL (OFFLINE)
        let queue = JSON.parse(localStorage.getItem('offline_queue')) || [];
        queue.push(payload);
        localStorage.setItem('offline_queue', JSON.stringify(queue));
        
        msg.innerText = "OFFLINE. Data diselamatkan dan akan dikirim saat online.";
        msg.className = "text-center font-bold mt-2 text-yellow-600";
        resetForm();
        updateSyncBadge();
    } else {
        // KIRIM LANGSUNG
        try {
            const res = await apiCall("SUBMIT_C1", payload);
            if (res.code === 200) {
                msg.innerText = "BERHASIL! Data terkirim ke Server.";
                msg.className = "text-center font-bold mt-2 text-green-600";
                resetForm();
            } else {
                msg.innerText = "Gagal: " + res.message;
            }
        } catch (e) {
            msg.innerText = "Error Jaringan. Harap coba lagi.";
        }
    }
    
    btn.disabled = false;
    btn.innerText = "Kirim Data & Foto";
}

function resetForm() {
    document.getElementById('alamat-tps').value = "";
    document.querySelectorAll('.suara-input').forEach(i => i.value = "");
    document.getElementById('preview-foto').classList.add('hidden');
    document.getElementById('label-foto').innerText = "Ambil Foto / Pilih Berkas";
    fotoBase64Global = "";
}

// === BACKGROUND SYNC LOGIC ===
async function processOfflineQueue() {
    let queue = JSON.parse(localStorage.getItem('offline_queue')) || [];
    if (queue.length === 0) return;

    const badge = document.getElementById('sync-badge');
    badge.classList.remove('hidden');
    badge.innerText = `Menyinkronkan ${queue.length} Data...`;

    let failedQueue = [];

    for (let data of queue) {
        try {
            const res = await apiCall("SUBMIT_C1", data);
            if (res.code !== 200) failedQueue.push(data); // Jika gagal server, antrikan lagi
        } catch (e) {
            failedQueue.push(data); // Jika gagal jaringan di tengah proses
        }
    }

    localStorage.setItem('offline_queue', JSON.stringify(failedQueue));
    updateSyncBadge();
}

function updateSyncBadge() {
    let queue = JSON.parse(localStorage.getItem('offline_queue')) || [];
    const badge = document.getElementById('sync-badge');
    if (queue.length > 0) {
        document.getElementById('queue-count').innerText = queue.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}