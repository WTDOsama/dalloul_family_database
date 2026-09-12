// ===========================================================================
// المصادقة والجلسات — Supabase Auth هو النظام المعتمد لإدارة كلمات المرور
// لا يتم تخزين أي كلمة مرور في قاعدة بيانات التطبيق أو المتصفح.
// ===========================================================================
import { supabase, isConfigured, renderConfigError } from './env.js';
import { state, setUser, clearUser, ROLE_LABELS } from './state.js';
import { showAlert, hideAlert, showToast, showOverlay, hideOverlay, applyRoleVisibility, esc } from './ui.js';
import { friendlyAuthError } from './errors.js';
import { logAction } from './data.js';
import { refreshRealtime } from './realtime.js';

let hadSession = false;       // لتمييز انتهاء الجلسة عن الخروج اليدوي
let authListenerBound = false;

// ------------------------------------------------------------- التهيئة ---
export async function initApp() {
  if (!isConfigured) { renderConfigError(); return; }

  bindAuthEvents();

  showOverlay();
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!authListenerBound) {
      supabase.auth.onAuthStateChange(handleAuthEvent);
      authListenerBound = true;
    }

    if (session) {
      hadSession = true;
      const ok = await enterApp(session);
      if (!ok) return;
    } else {
      // هل هذا أول تشغيل؟ (لا يوجد أي مدير) — شاشة الإعداد الآمن
      let adminExists = null; // null = تعذر معرفة الحالة
      try {
        const { data, error } = await supabase.rpc('admin_exists');
        if (!error) adminExists = Boolean(data);
      } catch { /* تعذر الاتصال */ }
      if (adminExists === false) {
        showSetup();
      } else {
        showLogin();
        if (adminExists === null) {
          showAlert('loginAlert', 'تعذر الاتصال بقاعدة البيانات. تحقق من اتصال الإنترنت ثم أعد المحاولة.', 'error');
        }
      }
    }
  } catch (err) {
    console.error(err);
    showLogin();
    showAlert('loginAlert', 'تعذر الاتصال بقاعدة البيانات. تحقق من اتصال الإنترنت ثم أعد المحاولة.', 'error');
  } finally {
    hideOverlay();
  }
}

async function handleAuthEvent(event, session) {
  if (event === 'SIGNED_IN' && session && !state.user) {
    hadSession = true;
    await enterApp(session);
  } else if (event === 'SIGNED_OUT') {
    const expired = hadSession;
    hadSession = false;
    clearUser();
    showLogin();
    document.getElementById('loginForm').reset();
    if (expired) {
      showAlert('loginAlert', 'انتهت جلسة الدخول، يرجى تسجيل الدخول مرة أخرى.', 'error');
    }
  } else if (event === 'PASSWORD_RECOVERY' && session) {
    hadSession = true;
    await enterApp(session);
    // وصل المستخدم عبر رابط استعادة كلمة المرور
    import('./loaders.js').then((m) => {
      m.loadPage('settings');
      showToast('أدخل كلمة مرور جديدة بالأسفل ثم اضغط تحديث.', 'success');
    });
  }
  // TOKEN_REFRESHED / USER_UPDATED لا تحتاج إجراء
}

// ------------------------------------------------------------ الدخول ---
export async function enterApp(session) {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .single();

    if (error || !profile) {
      await supabase.auth.signOut();
      showLogin();
      showAlert('loginAlert', 'تعذر العثور على ملف المستخدم. يرجى التواصل مع مدير النظام.', 'error');
      return false;
    }

    if (!profile.is_active || profile.role === 'pending') {
      setUser(session.user, profile);
      showPending();
      return false;
    }

    setUser(session.user, profile);
    showApp();
    return true;
  } catch (err) {
    console.error(err);
    showLogin();
    showAlert('loginAlert', 'تعذر الاتصال بقاعدة البيانات. حاول مرة أخرى.', 'error');
    return false;
  }
}

export function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';

  const name = state.profile?.full_name || state.user?.email || 'مستخدم';
  document.getElementById('userName').textContent = name;
  document.getElementById('userRole').textContent = ROLE_LABELS[state.profile?.role] || '';

  applyRoleVisibility();
  refreshRealtime();

  import('./loaders.js').then((m) => m.loadPage('dashboard'));
}

export function showLogin() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
  ['loginForm', 'setupForm', 'forgotForm', 'pendingPanel'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  document.getElementById('loginForm').classList.remove('hidden');
  const logoBlock = document.querySelector('#loginPage .login-logo h1');
  if (logoBlock) logoBlock.textContent = 'قاعدة بيانات أيتام عائلة دلول';
}

export function showSetup() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
  ['loginForm', 'forgotForm', 'pendingPanel'].forEach((id) =>
    document.getElementById(id).classList.add('hidden'));
  document.getElementById('setupForm').classList.remove('hidden');
  const sub = document.querySelector('#loginPage .login-logo p');
  if (sub) sub.textContent = 'الإعداد الأولي للنظام — إنشاء حساب المدير';
}

export function showPending() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
  ['loginForm', 'setupForm', 'forgotForm'].forEach((id) =>
    document.getElementById(id).classList.add('hidden'));
  document.getElementById('pendingPanel').classList.remove('hidden');
}

export function showForgotPassword() {
  ['loginForm', 'setupForm', 'pendingPanel'].forEach((id) =>
    document.getElementById(id).classList.add('hidden'));
  document.getElementById('forgotForm').classList.remove('hidden');
  hideAlert('forgotAlert');
}

export async function retryPending() {
  showOverlay();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { showLogin(); return; }
    await enterApp(session);
  } finally {
    hideOverlay();
  }
}

// ------------------------------------------------------- نماذج الدخول ---
function bindAuthEvents() {
  if (bindAuthEvents.done) return;
  bindAuthEvents.done = true;

  document.getElementById('loginForm').addEventListener('submit', login);
  document.getElementById('setupForm').addEventListener('submit', setupFirstAdmin);
  document.getElementById('forgotForm').addEventListener('submit', submitForgotPassword);
}

export async function login(e) {
  e.preventDefault();
  hideAlert('loginAlert');
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) return;

  showOverlay();
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showAlert('loginAlert', friendlyAuthError(error), 'error');
      return;
    }
    if (data.session) {
      await logAction('login', 'auth', data.user?.id, 'تسجيل دخول');
      // enterApp يتم عبر handleAuthEvent / أو مباشرة:
      if (!state.user) await enterApp(data.session);
      document.getElementById('loginForm').reset();
    }
  } catch (err) {
    showAlert('loginAlert', 'تعذر الاتصال بخادم المصادقة. تحقق من الإنترنت.', 'error');
  } finally {
    hideOverlay();
  }
}

export async function logout() {
  try {
    if (state.user) await logAction('logout', 'auth', state.user.id, 'تسجيل خروج');
  } catch { /* التسجيل لا يمنع الخروج */ }
  hadSession = false;
  clearUser();
  try { await supabase.auth.signOut(); } catch { /* تجاهل */ }
  showLogin();
  document.getElementById('loginForm')?.reset();
}

// ------------------------------------------------ إنشاء المدير الأول ---
export async function setupFirstAdmin(e) {
  e.preventDefault();
  hideAlert('setupAlert');

  const fullName = document.getElementById('setupFullName').value.trim();
  const email = document.getElementById('setupEmail').value.trim();
  const password = document.getElementById('setupPassword').value;
  const confirm = document.getElementById('setupConfirmPassword').value;

  if (!fullName || fullName.length < 3) {
    showAlert('setupAlert', 'يرجى إدخال الاسم الكامل.', 'error');
    return;
  }
  if (password.length < 6) {
    showAlert('setupAlert', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.', 'error');
    return;
  }
  if (password !== confirm) {
    showAlert('setupAlert', 'كلمتا المرور غير متطابقتين.', 'error');
    return;
  }

  showOverlay();
  try {
    // تحقق أخير: هل ما زال النظام بدون مدير؟
    const { data: adminExists } = await supabase.rpc('admin_exists');
    if (adminExists) {
      showAlert('setupAlert', 'يوجد مدير للنظام بالفعل. يرجى تسجيل الدخول.', 'error');
      showLogin();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      showAlert('setupAlert', friendlyAuthError(error), 'error');
      return;
    }

    if (data.session) {
      // تم إنشاء الحساب وتأكيده تلقائياً — سيصبح مديراً عبر trigger
      hadSession = true;
      await enterApp(data.session);
      showToast('تم إنشاء حساب المدير الأول بنجاح. مرحباً بك!', 'success');
    } else {
      // البريد يتطلب تأكيداً
      showAlert('setupAlert',
        'تم إنشاء الحساب. يرجى تأكيد بريدك الإلكتروني من الرسالة المرسلة إليك ثم تسجيل الدخول.',
        'success');
      setTimeout(showLogin, 4000);
    }
  } catch (err) {
    showAlert('setupAlert', 'تعذر إنشاء الحساب، حاول مرة أخرى.', 'error');
  } finally {
    hideOverlay();
  }
}

// ---------------------------------------------------- استعادة كلمة المرور ---
export async function submitForgotPassword(e) {
  e.preventDefault();
  hideAlert('forgotAlert');
  const email = document.getElementById('forgotEmail').value.trim();
  if (!email) return;

  showOverlay();
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      showAlert('forgotAlert', friendlyAuthError(error), 'error');
      return;
    }
    showAlert('forgotAlert',
      'إذا كان البريد الإلكتروني مسجلاً في النظام، ستصل رسالة تحتوي رابط إعادة تعيين كلمة المرور.',
      'success');
  } catch {
    showAlert('forgotAlert', 'تعذر إرسال الرابط، تحقق من الاتصال وحاول مرة أخرى.', 'error');
  } finally {
    hideOverlay();
  }
}

// ---------------------------------------------------- تغيير كلمة المرور ---
export async function changePassword(e) {
  e.preventDefault();
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (newPassword.length < 6) {
    showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل.', 'error');
    return;
  }
  if (newPassword !== confirmPassword) {
    showToast('كلمتا المرور غير متطابقتين.', 'error');
    return;
  }

  showOverlay();
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      showToast(friendlyAuthError(error), 'error');
      return;
    }
    document.getElementById('changePasswordForm').reset();
    await logAction('password_change', 'auth', state.user?.id, 'تغيير كلمة المرور');
    showToast('تم تحديث كلمة المرور بنجاح.', 'success');
  } catch {
    showToast('تعذر تحديث كلمة المرور، حاول مرة أخرى.', 'error');
  } finally {
    hideOverlay();
  }
}

// ------------------------------------------------------ الاسم المعروض ---
export async function updateDisplayName(e) {
  e.preventDefault();
  const name = document.getElementById('displayNameInput').value.trim();
  if (!name || name.length < 2) {
    showToast('يرجى إدخال اسم صحيح.', 'error');
    return;
  }
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name })
      .eq('user_id', state.user.id);
    if (error) throw error;

    state.profile.full_name = name;
    document.getElementById('userName').textContent = name;
    showToast('تم حفظ الاسم بنجاح.', 'success');
  } catch {
    showToast('تعذر حفظ الاسم، حاول مرة أخرى.', 'error');
  }
}

export function togglePassword() {
  const passwordInput = document.getElementById('password');
  passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
}
