// Kirish va ro'yxatdan o'tish ekranlari.
window.TP = window.TP || {};
TP.views = TP.views || {};

TP.views.auth = function (container) {
  var h = TP.ui.h, api = TP.api, toast = TP.ui.toast;
  var mode = 'login';

  var loginInput = h('input', { type: 'text', placeholder: 'Login yoki telefon' });
  var passInput = h('input', { type: 'password', placeholder: 'Parol' });
  var regName = h('input', { type: 'text', placeholder: 'Ism familiya' });
  var regLogin = h('input', { type: 'text', placeholder: 'Telefon (login)' });
  var regPass = h('input', { type: 'password', placeholder: 'Parol (kamida 6 belgi)' });

  var formBox = h('div', null);

  function renderForm() {
    formBox.textContent = '';
    if (mode === 'login') {
      formBox.appendChild(h('div', { class: 'field' }, h('label', null, 'Login'), loginInput));
      formBox.appendChild(h('div', { class: 'field' }, h('label', null, 'Parol'), passInput));
      var btn = h('button', { class: 'btn btn-primary btn-block' }, 'Kirish');
      btn.addEventListener('click', doLogin);
      [loginInput, passInput].forEach(function (i) {
        i.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin({ target: btn }); });
      });
      formBox.appendChild(btn);
      formBox.appendChild(h('p', { class: 'form-hint', style: 'margin-top:12px' },
        'Mijozlar: telefon raqami va parolingizni kiriting — birinchi marta kirshtada hisobingiz avtomatik yaratiladi va tizimga saqlanadi. Xodim va admin hisoblari faqat administrator tomonidan beriladi.'));
    } else {
      formBox.appendChild(h('div', { class: 'field' }, h('label', null, 'Ism familiya'), regName));
      formBox.appendChild(h('div', { class: 'field' }, h('label', null, 'Telefon (login)'), regLogin));
      formBox.appendChild(h('div', { class: 'field' }, h('label', null, 'Parol'), regPass));
      var btn2 = h('button', { class: 'btn btn-primary btn-block' }, "Ro'yxatdan o'tish");
      btn2.addEventListener('click', doRegister);
      [regName, regLogin, regPass].forEach(function (i) {
        i.addEventListener('keydown', function (e) { if (e.key === 'Enter') doRegister({ target: btn2 }); });
      });
      formBox.appendChild(btn2);
      formBox.appendChild(h('p', { class: 'form-hint', style: 'margin-top:12px' },
        "Ro'yxatdan o'tish faqat MIJOZ roli uchun. Xodim va admin hisoblari administrator tomonidan yaratiladi."));
    }
  }

  async function doLogin(ev) {
    ev.target.disabled = true;
    try {
      var res = await api.post('/api/auth/login', { login: loginInput.value.trim(), password: passInput.value });
      localStorage.setItem('tp_token', res.token);
      TP.app.setUser(res.user);
    } catch (e) { toast(e.message, 'err'); }
    ev.target.disabled = false;
  }
  async function doRegister(ev) {
    ev.target.disabled = true;
    try {
      var res = await api.post('/api/auth/register', {
        name: regName.value.trim(), login: regLogin.value.trim(), password: regPass.value,
      });
      localStorage.setItem('tp_token', res.token);
      TP.app.setUser(res.user);
    } catch (e) { toast(e.message, 'err'); }
    ev.target.disabled = false;
  }

  var tabLogin = h('button', { onclick: function () { mode = 'login'; syncTabs(); renderForm(); } }, 'Kirish');
  var tabReg = h('button', { onclick: function () { mode = 'register'; syncTabs(); renderForm(); } }, "Ro'yxatdan o'tish");
  function syncTabs() {
    tabLogin.className = mode === 'login' ? 'active' : '';
    tabReg.className = mode === 'register' ? 'active' : '';
  }

  renderForm(); syncTabs();

  container.appendChild(h('div', { class: 'auth-wrap' },
    h('div', { class: 'auth-card' },
      h('div', { class: 'auth-logo' }, 'TIKUV PRO'),
      h('div', { class: 'auth-sub' }, 'Tikuvchilik ishlab chiqarish boshqaruvi'),
      h('div', { class: 'auth-tabs' }, tabLogin, tabReg),
      formBox
    )
  ));
};
