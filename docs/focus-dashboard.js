
(() => {
  'use strict';

  const byText = text => [...document.querySelectorAll('.tab')]
    .find(button => button.textContent.includes(text));

  function openTab(text) {
    const button = byText(text);
    if (button) button.click();
    closeMenu();
  }

  function closeMenu() {
    document.querySelector('.pure-focus-drawer')?.classList.remove('open');
    document.querySelector('.pure-focus-backdrop')?.classList.remove('open');
  }

  function updateDashboardClass() {
    const dashboard = document.getElementById('today');
    document.body.classList.toggle(
      'pure-focus-dashboard',
      !!dashboard && !dashboard.classList.contains('hidden')
    );
  }

  function init() {
    const header = document.querySelector('.header');
    if (!header || document.querySelector('.pure-focus-menu-button')) return;

    const date = document.createElement('div');
    date.className = 'pure-focus-date';
    date.textContent = '▣  ' + new Intl.DateTimeFormat('it-IT', {
      weekday:'long', day:'numeric', month:'long', year:'numeric'
    }).format(new Date()).replace(/^./, x => x.toUpperCase());

    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'pure-focus-menu-button';
    menuButton.setAttribute('aria-label','Apri menu');
    menuButton.textContent = '☰';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;align-items:center;gap:12px';
    actions.append(date, menuButton);
    header.append(actions);

    const backdrop = document.createElement('div');
    backdrop.className = 'pure-focus-backdrop';

    const drawer = document.createElement('aside');
    drawer.className = 'pure-focus-drawer';
    drawer.innerHTML = `
      <div class="pure-focus-drawer-head">
        <strong>Pure<br><small>Promemoria Aziendale</small></strong>
        <button type="button" class="pure-focus-close" aria-label="Chiudi menu">×</button>
      </div>
      <button type="button" data-focus-menu="Oggi">▣ <span>Dashboard</span></button>
      <button type="button" data-focus-menu="Promemoria">▤ <span>Promemoria</span></button>
      <button type="button" data-focus-menu="Ufficio">⌖ <span>Ufficio</span></button>
      <button type="button" data-focus-menu="Registro">✓ <span>Registro</span></button>
      <button type="button" data-focus-menu="sync">↻ <span>Sincronizzazione</span></button>
      <button type="button" data-focus-menu="account">♙ <span>Account</span></button>
      <button type="button" data-focus-menu="export">⇩ <span>Esporta / Importa</span></button>
      <button type="button" data-focus-menu="settings">⚙ <span>Impostazioni</span></button>
    `;

    document.body.append(backdrop, drawer);

    menuButton.addEventListener('click', () => {
      drawer.classList.add('open');
      backdrop.classList.add('open');
    });
    backdrop.addEventListener('click', closeMenu);
    drawer.querySelector('.pure-focus-close').addEventListener('click', closeMenu);

    drawer.addEventListener('click', event => {
      const item = event.target.closest('[data-focus-menu]');
      if (!item) return;
      const target = item.dataset.focusMenu;

      if (target === 'sync') {
        openTab('Registro');
        setTimeout(() => document.getElementById('cloudSection')?.scrollIntoView({behavior:'smooth'}), 250);
      } else if (target === 'account') {
        location.href = './auth.html';
      } else if (target === 'export') {
        openTab('Registro');
        setTimeout(() => document.getElementById('exportData')?.scrollIntoView({behavior:'smooth'}), 250);
      } else if (target === 'settings') {
        openTab('Ufficio');
      } else {
        openTab(target);
      }
    });

    document.addEventListener('click', event => {
      if (event.target.closest('.tab')) setTimeout(updateDashboardClass, 50);
    });

    new MutationObserver(updateDashboardClass).observe(document.body, {
      subtree:true, attributes:true, attributeFilter:['class']
    });

    updateDashboardClass();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
