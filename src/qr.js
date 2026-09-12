// ===========================================================================
// رموز QR — ترميز معرّف داخلي آمن فقط (لا بيانات شخصية داخل الرمز)
// محتوى الرمز: معرف QR الداخلي لليتيم (ORPHAN:...) أو رمز الأسرة (FAMILY:...)
// لا يتضمن الرمز: هوية، جوال، عنوان، أو أي معلومة حساسة.
// ===========================================================================
import { getOrphan, getOrphanByQR, getOrphanByCode, getFamily } from './data.js';
import { esc, showToast, printModal } from './ui.js';
import { friendlyError } from './errors.js';

const LOGO_B64 =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iZ3JhZGllbnQxIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3R5bGU9InN0b3AtY29sb3I6IzQyODVGNDtzdG9wLW9wYWNpdHk6MSIgLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojNkI3MkZENztzdG9wLW9wYWNpdHk6MSIgLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CiAgPC9kZWZzPgogIDxwYXRoIGQ9Ik0gMTAwIDIwIEwgMTgwIDYwIEwgMTgwIDE2MCBMIDEwMCAxODAgTCAyMCAxNjAgTCAyMCA2MCBaIiBmaWxsPSJ1cmwoI2dyYWRpZW50MSkiIHN0cm9rZT0iIzEwQjdGNiIgc3Ryb2tlLXdpZHRoPSI0Ii8+CiAgPHRleHQgeD0iMTAwIiB5PSIxMTAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI0MCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPvbDqMOLPC90ZXh0PgogIDx0ZXh0IHg9IjEwMCIgeT0iMTUwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj7YqNin2Kkg2KfYsdio2YcgLS0g2KfYsdin2Kk8L3RleHQ+Cjwvc3ZnPg==';

let currentQRData = null;

// -------------------------------------------------------------- يتيم ---
export async function showQR(orphanId) {
  try {
    const orphan = await getOrphan(orphanId);
    if (!orphan) return;

    // المحتوى: معرف QR الداخلي فقط — لا معلومات شخصية داخل الرمز
    const qrData = orphan.qrId || `ORPHAN:${orphan.id}`;
    currentQRData = { type: 'orphan', data: qrData, orphan };

    document.getElementById('qrContent').innerHTML = `
      <img src="${LOGO_B64}" alt="Logo" style="width: 80px; margin-bottom: 20px;">
      <div class="qr-info">
        <h3>${esc(orphan.fullName)}</h3>
        <p>رقم الملف: ${esc(orphan.fileNumber)}</p>
        <p class="muted">يحتوي الرمز على معرّف داخلي آمن فقط — بدون أي بيانات شخصية</p>
      </div>
      <div id="qrcode" class="qr-code"></div>`;

    renderQR(qrData);
    document.getElementById('qrModal').classList.add('show');
  } catch (error) {
    showToast(friendlyError(error), 'error');
  }
}

// -------------------------------------------------------------- أسرة ---
export async function showFamilyQR(familyId) {
  try {
    const family = await getFamily(familyId);
    if (!family) return;

    const qrData = `FAMILY:${family.familyCode}`;
    currentQRData = { type: 'family', data: qrData, family };

    document.getElementById('qrContent').innerHTML = `
      <img src="${LOGO_B64}" alt="Logo" style="width: 80px; margin-bottom: 20px;">
      <div class="qr-info">
        <h3>${esc(family.name)}</h3>
        <p>رمز الأسرة: ${esc(family.familyCode)}</p>
        <p class="muted">يحتوي الرمز على رمز الأسرة الداخلي فقط</p>
      </div>
      <div id="qrcode" class="qr-code"></div>`;

    renderQR(qrData);
    document.getElementById('qrModal').classList.add('show');
  } catch (error) {
    showToast(friendlyError(error), 'error');
  }
}

function renderQR(qrData) {
  const QRCodeLib = window.QRCode;
  if (!QRCodeLib) {
    showToast('مكتبة QR غير محمّلة. تحقق من الاتصال بالإنترنت وأعد المحاولة.', 'error');
    return;
  }
  QRCodeLib.toCanvas(document.getElementById('qrcode'), qrData, {
    width: 200,
    margin: 2,
    errorCorrectionLevel: 'M',
  }, (error) => {
    if (error) console.error('QR render error:', error);
  });
}

export function closeQRModal() {
  document.getElementById('qrModal').classList.remove('show');
}

export function downloadQR() {
  const canvas = document.querySelector('#qrcode canvas');
  if (canvas && currentQRData) {
    const link = document.createElement('a');
    link.download = `QR-${currentQRData.type === 'orphan'
      ? currentQRData.orphan.fileNumber
      : currentQRData.family.familyCode}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
}

export function printQR() {
  printModal();
}

// ------------------------------------------------------------- المسح ---
export async function scanQR() {
  // إدخال يدوي لمعرف QR أو رمز البحث (المسح بالكاميرا عبر جهاز/تطبيق خارجي)
  const code = prompt('امسح رمز QR باستخدام جهازك أو أدخل الكود/رقم الملف يدوياً:');
  if (!code) return;

  const value = String(code).trim();
  try {
    if (value.startsWith('ORPHAN:')) {
      // البحث بمعرف QR الداخلي ثم برقم الملف
      let orphan = await getOrphanByQR(value);
      if (!orphan) orphan = await getOrphanByCode(value);
      if (orphan) {
        const { viewOrphan } = await import('./orphans.js');
        viewOrphan(orphan.id);
      } else {
        showToast('لم يتم العثور على سجل مطابق لهذا الرمز في قاعدة البيانات.', 'error');
      }
    } else if (value.startsWith('FAMILY:')) {
      const familyCode = value.replace('FAMILY:', '');
      const { supabase } = await import('./env.js');
      const { data } = await supabase
        .from('families')
        .select('id')
        .eq('family_code', familyCode)
        .maybeSingle();
      if (data) {
        const { viewFamily } = await import('./families.js');
        viewFamily(data.id);
      } else {
        showToast('لم يتم العثور على أسرة مطابقة لهذا الرمز.', 'error');
      }
    } else {
      // محاولة البحث برقم الملف مباشرة
      const orphan = await getOrphanByCode(value);
      if (orphan) {
        const { viewOrphan } = await import('./orphans.js');
        viewOrphan(orphan.id);
      } else {
        showToast('لم يتم العثور على سجل مطابق.', 'error');
      }
    }
  } catch (error) {
    showToast(friendlyError(error), 'error');
  }
}
