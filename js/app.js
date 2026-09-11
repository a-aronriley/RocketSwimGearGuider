/**
 * RocketSwim Gear Guider
 * Main application logic
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────
  let gearData = null;
  let checkedItems = new Set(); // items the parent says they already own

  // ── DOM refs ───────────────────────────────────────────────
  const $fromSelect = document.getElementById('level-from');
  const $toSelect = document.getElementById('level-to');
  const $levelInfo = document.getElementById('level-info');
  const $levelInfoText = document.getElementById('level-info-text');
  const $checklistSection = document.getElementById('checklist-section');
  const $checklistTitle = document.getElementById('checklist-title');
  const $checklistCount = document.getElementById('checklist-count');
  const $checklistInstructions = document.getElementById('checklist-instructions');
  const $checklistItems = document.getElementById('checklist-items');
  const $shoppingSection = document.getElementById('shopping-section');
  const $shoppingTitle = document.getElementById('shopping-title');
  const $shoppingRequired = document.getElementById('shopping-required');
  const $shoppingOptional = document.getElementById('shopping-optional');
  const $allSet = document.getElementById('all-set');
  const $cartSummary = document.getElementById('cart-summary');
  const $cartDetails = document.getElementById('cart-details');
  const $storesSection = document.getElementById('stores-section');
  const $storesList = document.getElementById('stores-list');

  // ── Bootstrap ──────────────────────────────────────────────
  async function init() {
    try {
      const resp = await fetch('data/gear-data.json');
      if (!resp.ok) throw new Error('Failed to load gear data');
      gearData = await resp.json();
      populateDropdowns();
      renderStores();
      $fromSelect.addEventListener('change', onSelectionChange);
      $toSelect.addEventListener('change', onSelectionChange);
    } catch (err) {
      console.error('Gear data load error:', err);
      document.querySelector('main').innerHTML =
        '<div class="bg-red-50 border border-red-200 rounded-xl p-8 text-center mt-8"><p class="text-red-700 font-semibold">Unable to load gear data. Please refresh or try again later.</p></div>';
    }
  }

  // ── Populate Level Dropdowns ───────────────────────────────
  function populateDropdowns() {
    gearData.levels.forEach(level => {
      // "From" dropdown — all levels
      const optFrom = document.createElement('option');
      optFrom.value = level.id;
      optFrom.textContent = `${level.name} (${level.id}) — Ages ${level.ageRange}`;
      $fromSelect.appendChild(optFrom);

      // "To" dropdown — all levels
      const optTo = document.createElement('option');
      optTo.value = level.id;
      optTo.textContent = `${level.name} (${level.id}) — Ages ${level.ageRange}`;
      $toSelect.appendChild(optTo);
    });
  }

  // ── Selection Change Handler ───────────────────────────────
  function onSelectionChange() {
    const fromId = $fromSelect.value;
    const toId = $toSelect.value;

    // Reset state
    checkedItems.clear();

    if (!toId) {
      hideAll();
      return;
    }

    const toLevel = gearData.levels.find(l => l.id === toId);
    const fromLevel = fromId ? gearData.levels.find(l => l.id === fromId) : null;

    // Show level info
    showLevelInfo(toLevel, fromLevel);

    // Get gear for target level
    const targetGear = getGearForLevel(toId);

    if (fromId) {
      // Upgrade flow: pre-check gear from previous level
      const fromGear = getGearForLevel(fromId);
      fromGear.forEach(g => {
        if (targetGear.some(tg => tg.id === g.id)) {
          checkedItems.add(g.id);
        }
      });
      showChecklist(targetGear, fromId, toId);
    } else {
      // New swimmer: no checklist, show all gear
      $checklistSection.classList.add('hidden');
    }

    renderShoppingList(targetGear, toId);
    $storesSection.classList.remove('hidden');
  }

  // ── Get Gear for a Level ───────────────────────────────────
  function getGearForLevel(levelId) {
    return gearData.gear.filter(g => {
      const req = g.levels[levelId];
      return req === 'R' || req === 'O';
    });
  }

  // ── Show Level Info Bar ────────────────────────────────────
  function showLevelInfo(toLevel, fromLevel) {
    let text = `<strong>${toLevel.name}</strong> — Ages ${toLevel.ageRange}`;
    if (toLevel.coachRatio) text += ` · Coach ratio ${toLevel.coachRatio}`;
    if (fromLevel) {
      text = `Upgrading from <strong>${fromLevel.name}</strong> → <strong>${toLevel.name}</strong>`;
    }
    $levelInfoText.innerHTML = text;
    $levelInfo.classList.remove('hidden');
  }

  // ── Checklist ──────────────────────────────────────────────
  function showChecklist(targetGear, fromId, toId) {
    const fromGear = getGearForLevel(fromId);
    const fromIds = new Set(fromGear.map(g => g.id));

    $checklistTitle.textContent = `Gear Checklist — What do you already have?`;
    $checklistInstructions.innerHTML = `Items from your previous level (<strong>${fromId}</strong>) are pre-checked. <strong>Uncheck</strong> anything you don't actually have — those items will appear in your shopping list.`;

    $checklistItems.innerHTML = '';

    // Group by category
    const categories = groupByCategory(targetGear);

    for (const [cat, items] of Object.entries(categories)) {
      const catHeader = document.createElement('div');
      catHeader.className = 'mt-4 mb-2 first:mt-0';
      catHeader.innerHTML = `<h3 class="text-sm font-bold text-navy-600 uppercase tracking-wider flex items-center gap-2">
        ${cat === 'WATER' ? '🏊' : '🏋️'} ${cat} Gear
      </h3>`;
      $checklistItems.appendChild(catHeader);

      items.forEach(gear => {
        const isFromLevel = fromIds.has(gear.id);
        const isNew = !isFromLevel;
        const isRequired = gear.levels[toId] === 'R';
        const isOptional = gear.levels[toId] === 'O';

        const div = document.createElement('label');
        div.className = `gear-card flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${isFromLevel ? 'bg-gray-50 border-gray-200' : 'bg-green-50 border-green-200'}`;
        div.innerHTML = `
          <input type="checkbox" class="w-5 h-5 rounded border-gray-300 text-teal-500 focus:ring-teal-400 cursor-pointer"
            data-gear-id="${gear.id}" ${isFromLevel ? 'checked' : ''}>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-medium text-sm">${gear.name}</span>
              ${isRequired ? '<span class="badge-required text-xs px-2 py-0.5 rounded-full font-medium">Required</span>' : ''}
              ${isOptional ? '<span class="badge-optional text-xs px-2 py-0.5 rounded-full font-medium">Optional</span>' : ''}
              ${isNew ? '<span class="badge-new text-xs px-2 py-0.5 rounded-full font-medium">NEW</span>' : ''}
              ${isFromLevel ? '<span class="badge-have text-xs px-2 py-0.5 rounded-full font-medium">From ' + fromId + '</span>' : ''}
            </div>
            ${gear.notes ? '<p class="text-xs text-gray-500 mt-0.5">' + gear.notes + '</p>' : ''}
          </div>
          ${getSourceBadge(gear)}
        `;

        const checkbox = div.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            checkedItems.add(gear.id);
          } else {
            checkedItems.delete(gear.id);
          }
          renderShoppingList(targetGear, toId);
        });

        // Sync initial state
        if (isFromLevel) {
          checkedItems.add(gear.id);
        }

        $checklistItems.appendChild(div);
      });
    }

    updateChecklistCount(targetGear);
    $checklistSection.classList.remove('hidden');
  }

  function updateChecklistCount(targetGear) {
    const total = targetGear.length;
    const owned = checkedItems.size;
    $checklistCount.textContent = `${owned}/${total} items owned`;
  }

  // ── Shopping List ──────────────────────────────────────────
  function renderShoppingList(targetGear, toId) {
    const needed = targetGear.filter(g => !checkedItems.has(g.id));
    const required = needed.filter(g => g.levels[toId] === 'R');
    const optional = needed.filter(g => g.levels[toId] === 'O');

    // Update checklist count
    updateChecklistCount(targetGear);

    if (needed.length === 0) {
      $shoppingRequired.innerHTML = '';
      $shoppingOptional.innerHTML = '';
      $allSet.classList.remove('hidden');
      $cartSummary.classList.add('hidden');
      $shoppingSection.classList.remove('hidden');
      $shoppingTitle.textContent = `Gear for ${toId}`;
      return;
    }

    $allSet.classList.add('hidden');
    const toLevel = gearData.levels.find(l => l.id === toId);
    $shoppingTitle.textContent = `Shopping List for ${toLevel.name}`;

    // Render required
    if (required.length > 0) {
      $shoppingRequired.innerHTML = `
        <h3 class="text-sm font-bold text-navy-600 uppercase tracking-wider mb-3 flex items-center gap-2">
          Required Gear <span class="text-xs font-normal text-gray-500">(${required.length} items)</span>
        </h3>
        <div class="space-y-2">${required.map(g => renderGearCard(g)).join('')}</div>
      `;
    } else {
      $shoppingRequired.innerHTML = '';
    }

    // Render optional
    if (optional.length > 0) {
      $shoppingOptional.innerHTML = `
        <h3 class="text-sm font-bold text-navy-600 uppercase tracking-wider mb-3 mt-6 flex items-center gap-2">
          Optional Gear <span class="text-xs font-normal text-gray-500">(${optional.length} items)</span>
        </h3>
        <div class="space-y-2">${optional.map(g => renderGearCard(g)).join('')}</div>
      `;
    } else {
      $shoppingOptional.innerHTML = '';
    }

    // Render cart summary
    renderCartSummary(needed);
    $shoppingSection.classList.remove('hidden');
  }

  function renderGearCard(gear) {
    const priceText = gear.priceFromClub ? `$${gear.priceFromClub}` : '';
    const sourceClass = `source-${gear.source}`;
    const buyButton = getBuyButton(gear);
    const categoryIcon = gear.category === 'WATER' ? '🏊' : '🏋️';

    return `
      <div class="gear-card ${sourceClass} rounded-lg border border-gray-200 p-4 bg-white flex items-center justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs">${categoryIcon}</span>
            <span class="font-medium text-sm text-navy-900">${gear.name}</span>
            ${priceText ? `<span class="text-sm font-semibold text-teal-700">${priceText}</span>` : ''}
          </div>
          ${gear.notes ? `<p class="text-xs text-gray-500 mt-1">${gear.notes}</p>` : ''}
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${getSourceLabel(gear)}
          ${buyButton}
        </div>
      </div>
    `;
  }

  // ── Cart & Payment Summary ─────────────────────────────────
  function renderCartSummary(needed) {
    const clubItems = needed.filter(g => g.source === 'club' && g.priceFromClub);
    const coachItems = needed.filter(g => g.source === 'coach');
    const storeItems = needed.filter(g => ['store', 'amazon'].includes(g.source) && g.purchaseUrl);
    const anyItems = needed.filter(g => g.source === 'any');

    if (clubItems.length === 0 && coachItems.length === 0 && storeItems.length === 0 && anyItems.length === 0) {
      $cartSummary.classList.add('hidden');
      return;
    }

    let html = '';

    // Club items — payment via email
    if (clubItems.length > 0) {
      const total = clubItems.reduce((sum, g) => sum + (g.priceFromClub || 0), 0);
      const itemList = clubItems.map(g => `${g.name} ($${g.priceFromClub})`).join(', ');
      const subject = encodeURIComponent('RocketSwim Gear Order');
      const body = encodeURIComponent(`Hi,\n\nI'd like to order the following gear:\n\n${clubItems.map(g => `• ${g.name} — $${g.priceFromClub}`).join('\n')}\n\nTotal: $${total}\n\nSwimmer Name: [Your swimmer's name]\nLevel: ${$toSelect.value}\n\nThank you!`);

      html += `
        <div class="bg-teal-50 rounded-lg p-4 border border-teal-100">
          <h4 class="font-semibold text-teal-800 text-sm mb-2 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            Club Gear — Pay via Email
          </h4>
          <ul class="text-sm text-teal-900 mb-3 space-y-1">
            ${clubItems.map(g => `<li class="flex justify-between"><span>${g.name}</span><span class="font-medium">$${g.priceFromClub}</span></li>`).join('')}
          </ul>
          <div class="flex items-center justify-between border-t border-teal-200 pt-2 mb-3">
            <span class="font-bold text-teal-900">Total</span>
            <span class="font-bold text-teal-900 text-lg">$${total}</span>
          </div>
          <a href="mailto:${gearData.payment.clubEmail}?subject=${subject}&body=${body}"
            class="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors no-print">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            Email Payment Request
          </a>
          <p class="text-xs text-teal-600 mt-2">Sends to ${gearData.payment.clubEmail}</p>
        </div>
      `;
    }

    // Coach items — Discord DM
    if (coachItems.length > 0) {
      const discordMsg = `Hi Coach! 👋\n\nMy swimmer is moving to ${$toSelect.value} and needs the following gear:\n\n${coachItems.map(g => `• ${g.name}`).join('\n')}\n\nCan you let me know how to get these? Thanks! 🚀`;

      html += `
        <div class="bg-amber-50 rounded-lg p-4 border border-amber-100 mt-4">
          <h4 class="font-semibold text-amber-800 text-sm mb-2 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
            Coach Gear — DM in Discord #gear
          </h4>
          <ul class="text-sm text-amber-900 mb-3 space-y-1">
            ${coachItems.map(g => `<li>• ${g.name}</li>`).join('')}
          </ul>
          <button onclick="copyToClipboard(\`${discordMsg.replace(/`/g, '\\`')}\`)"
            class="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors no-print">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
            Copy Discord Message
          </button>
          <p class="text-xs text-amber-600 mt-2">${gearData.payment.coachContact}</p>
        </div>
      `;
    }

    // Store items
    if (storeItems.length > 0) {
      html += `
        <div class="bg-green-50 rounded-lg p-4 border border-green-100 mt-4">
          <h4 class="font-semibold text-green-800 text-sm mb-2 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
            Buy from Stores
          </h4>
          <ul class="text-sm text-green-900 space-y-2">
            ${storeItems.map(g => `
              <li class="flex items-center justify-between">
                <span>${g.name}</span>
                <a href="${g.purchaseUrl}" target="_blank" rel="noopener"
                  class="inline-flex items-center gap-1 text-green-700 hover:text-green-900 font-medium text-xs">
                  ${g.storeName || 'Buy'} →
                </a>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    // Items available anywhere
    if (anyItems.length > 0) {
      html += `
        <div class="bg-gray-50 rounded-lg p-4 border border-gray-200 mt-4">
          <h4 class="font-semibold text-gray-700 text-sm mb-2">Available Anywhere</h4>
          <p class="text-sm text-gray-600">${anyItems.map(g => g.name).join(', ')}</p>
        </div>
      `;
    }

    $cartDetails.innerHTML = html;
    $cartSummary.classList.remove('hidden');
  }

  // ── Stores Section ─────────────────────────────────────────
  function renderStores() {
    if (!gearData || !gearData.stores) return;

    $storesList.innerHTML = gearData.stores.map(store => `
      <a href="${store.url}" target="_blank" rel="noopener"
        class="block p-4 rounded-lg border border-gray-200 hover:border-teal-300 hover:shadow-md transition-all bg-white">
        <h3 class="font-semibold text-navy-900 text-sm">${store.name}</h3>
        <p class="text-xs text-gray-500 mt-1">${store.location}</p>
        ${store.discount ? `<span class="inline-block mt-2 text-xs bg-teal-50 text-teal-700 px-2 py-1 rounded-full font-medium">${store.discount}</span>` : ''}
      </a>
    `).join('');
  }

  // ── Helpers ────────────────────────────────────────────────
  function getSourceBadge(gear) {
    const badges = {
      store: `<span class="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">${gear.storeName || 'Store'}</span>`,
      club: '<span class="text-xs px-2 py-1 rounded-full bg-teal-100 text-teal-700 font-medium">Club</span>',
      coach: '<span class="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">Coach</span>',
      amazon: '<span class="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-medium">Amazon</span>',
      any: '<span class="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">Anywhere</span>'
    };
    return badges[gear.source] || '';
  }

  function getSourceLabel(gear) {
    return getSourceBadge(gear);
  }

  function getBuyButton(gear) {
    if (gear.purchaseUrl) {
      return `<a href="${gear.purchaseUrl}" target="_blank" rel="noopener"
        class="inline-flex items-center gap-1 bg-navy-900 hover:bg-navy-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors no-print">
        Buy <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
      </a>`;
    }
    if (gear.source === 'club' && gear.priceFromClub) {
      return `<span class="text-sm font-semibold text-teal-700">$${gear.priceFromClub}</span>`;
    }
    return '';
  }

  function groupByCategory(gearList) {
    const groups = {};
    gearList.forEach(g => {
      if (!groups[g.category]) groups[g.category] = [];
      groups[g.category].push(g);
    });
    return groups;
  }

  function hideAll() {
    $levelInfo.classList.add('hidden');
    $checklistSection.classList.add('hidden');
    $shoppingSection.classList.add('hidden');
    $storesSection.classList.add('hidden');
  }

  // ── Clipboard ──────────────────────────────────────────────
  window.copyToClipboard = function (text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard! Paste in Discord #gear channel.');
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Copied to clipboard!');
    });
  };

  function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast bg-navy-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium mb-2 flex items-center gap-2';
    toast.innerHTML = `
      <svg class="w-4 h-4 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
      ${message}
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ── GO ─────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

})();
