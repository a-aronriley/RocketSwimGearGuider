/**
 * RocketSwim Gear Guider
 * Main application logic — 3-step wizard (Issue #35)
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────
  let gearData = null;
  let checkedItems = new Set(); // items the parent says they already own
  let currentStep = 1;
  let targetGear = [];          // gear for the selected target level

  // ── DOM refs ───────────────────────────────────────────────
  const $loadingState = document.getElementById('loading-state');
  const $wizardNav = document.getElementById('wizard-nav');
  const $step1 = document.getElementById('step-1');
  const $step2 = document.getElementById('step-2');
  const $step3 = document.getElementById('step-3');
  const $fromSelect = document.getElementById('level-from');
  const $toSelect = document.getElementById('level-to');
  const $levelInfo = document.getElementById('level-info');
  const $levelInfoText = document.getElementById('level-info-text');
  const $checklistTitle = document.getElementById('checklist-title');
  const $checklistCount = document.getElementById('checklist-count');
  const $checklistInstructions = document.getElementById('checklist-instructions');
  const $checklistItems = document.getElementById('checklist-items');
  const $shoppingTitle = document.getElementById('shopping-title');
  const $shoppingRequired = document.getElementById('shopping-required');
  const $shoppingOptional = document.getElementById('shopping-optional');
  const $allSet = document.getElementById('all-set');
  const $cartSummary = document.getElementById('cart-summary');
  const $cartDetails = document.getElementById('cart-details');
  const $storesSection = document.getElementById('stores-section');
  const $storesList = document.getElementById('stores-list');

  // Wizard buttons
  const $btnToStep2 = document.getElementById('btn-to-step2');
  const $btnBackToStep1 = document.getElementById('btn-back-to-step1');
  const $btnToStep3 = document.getElementById('btn-to-step3');
  const $btnBackToStep2 = document.getElementById('btn-back-to-step2');
  const $btnStartOver = document.getElementById('btn-start-over');

  // ── Bootstrap ──────────────────────────────────────────────
  async function init() {
    try {
      // Use GearDataLoader (gear-data.js) for data loading, Sheets fallback, and validation
      if (window.GearDataLoader) {
        gearData = await window.GearDataLoader.loadGearData();
      } else {
        // Fallback if gear-data.js not loaded
        console.warn('[App] GearDataLoader not found, loading JSON directly');
        const resp = await fetch('data/gear-data.json');
        if (!resp.ok) throw new Error('Failed to load gear data');
        gearData = await resp.json();
      }

      // Hide loading skeleton, show wizard
      if ($loadingState) $loadingState.classList.add('hidden');
      if ($wizardNav) $wizardNav.classList.remove('hidden');

      populateDropdowns();
      renderStores();
      bindWizardEvents();
      goToStep(1);

    } catch (err) {
      console.error('Gear data load error:', err);
      // Replace loading state with error message (Issue #20)
      if ($loadingState) $loadingState.classList.add('hidden');
      const main = document.getElementById('main-content') || document.querySelector('main');
      const errorDiv = document.createElement('div');
      errorDiv.className = 'bg-red-50 border border-red-200 rounded-xl p-8 text-center mt-8';
      errorDiv.setAttribute('role', 'alert');
      errorDiv.innerHTML = `
        <div class="text-4xl mb-3" aria-hidden="true">😕</div>
        <h2 class="text-lg font-bold text-red-800 mb-2">Unable to Load Gear Data</h2>
        <p class="text-red-700 mb-4">Something went wrong while loading the equipment list.</p>
        <button onclick="location.reload()" class="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
          Try Again
        </button>
      `;
      main.insertBefore(errorDiv, main.firstChild);
    }
  }

  // ── Wizard Navigation (Issue #35) ──────────────────────────
  function bindWizardEvents() {
    // Dropdowns → update level info + enable/disable Continue
    $fromSelect.addEventListener('change', onSetupChange);
    $toSelect.addEventListener('change', onSetupChange);

    // Wizard buttons
    $btnToStep2.addEventListener('click', () => {
      prepareChecklist();
      goToStep(2);
    });
    $btnBackToStep1.addEventListener('click', () => goToStep(1));
    $btnToStep3.addEventListener('click', () => {
      renderShoppingList();
      goToStep(3);
    });
    $btnBackToStep2.addEventListener('click', () => goToStep(2));
    $btnStartOver.addEventListener('click', startOver);

    // Step indicator clicks (only completed steps)
    for (let i = 1; i <= 3; i++) {
      const btn = document.getElementById('wizard-btn-' + i);
      if (btn) {
        btn.addEventListener('click', () => {
          if (!btn.disabled) {
            if (i === 2) prepareChecklist();
            if (i === 3) renderShoppingList();
            goToStep(i);
          }
        });
      }
    }
  }

  function goToStep(step) {
    currentStep = step;

    // Hide all panels
    [$step1, $step2, $step3].forEach(el => {
      el.classList.add('hidden');
      el.classList.remove('fade-in');
    });

    // Show target panel
    const panel = [null, $step1, $step2, $step3][step];
    panel.classList.remove('hidden');
    panel.classList.add('fade-in');

    // Update step indicators
    updateStepIndicators();

    // Scroll to top of main content
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateStepIndicators() {
    for (let i = 1; i <= 3; i++) {
      const btn = document.getElementById('wizard-btn-' + i);
      if (!btn) continue;

      btn.classList.remove('active', 'completed');
      btn.removeAttribute('aria-current');

      if (i === currentStep) {
        btn.classList.add('active');
        btn.setAttribute('aria-current', 'step');
        btn.disabled = false;
      } else if (i < currentStep) {
        btn.classList.add('completed');
        btn.disabled = false;
      } else {
        // Future steps: enable if they've been reached before
        // Step 2 accessible once target level chosen
        // Step 3 accessible once checklist viewed
        if (i === 2 && $toSelect.value) {
          btn.disabled = false;
        } else if (i === 3 && currentStep > 2) {
          btn.disabled = false;
        } else {
          btn.disabled = true;
        }
      }
    }
  }

  function startOver() {
    $fromSelect.value = '';
    $toSelect.value = '';
    checkedItems.clear();
    targetGear = [];
    $levelInfo.classList.add('hidden');
    $btnToStep2.disabled = true;
    goToStep(1);
    // Reset step 3 button to disabled
    const btn3 = document.getElementById('wizard-btn-3');
    if (btn3) btn3.disabled = true;
  }

  // ── Step 1: Setup Change Handler ───────────────────────────
  function onSetupChange() {
    const toId = $toSelect.value;

    if (!toId) {
      $levelInfo.classList.add('hidden');
      $btnToStep2.disabled = true;
      return;
    }

    const fromId = $fromSelect.value;
    const toLevel = gearData.levels.find(l => l.id === toId);
    const fromLevel = fromId ? gearData.levels.find(l => l.id === fromId) : null;

    // Show level info
    showLevelInfo(toLevel, fromLevel);

    // Enable Continue
    $btnToStep2.disabled = false;

    // Enable step 2 in nav
    const btn2 = document.getElementById('wizard-btn-2');
    if (btn2) btn2.disabled = false;
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

  // ── Get Gear for a Level ───────────────────────────────────
  function getGearForLevel(levelId) {
    return gearData.gear.filter(g => {
      const req = g.levels[levelId];
      return req === 'R' || req === 'O';
    });
  }

  // ── Show Level Info Bar ────────────────────────────────────
  function showLevelInfo(toLevel, fromLevel) {
    let text;
    if (fromLevel) {
      text = `Upgrading from <strong>${fromLevel.name}</strong> → <strong>${toLevel.name}</strong>`;
    } else {
      text = `New to RocketSwim → Joining <strong>${toLevel.name}</strong> — Ages ${toLevel.ageRange}`;
    }
    $levelInfoText.innerHTML = text;
    $levelInfo.classList.remove('hidden');
  }

  // ── Step 2: Prepare Checklist ──────────────────────────────
  function prepareChecklist() {
    const fromId = $fromSelect.value;
    const toId = $toSelect.value;

    if (!toId) return;

    // Reset checked items when re-entering step 2 from step 1
    // (only if dropdown values changed since last checklist build)
    checkedItems.clear();

    targetGear = getGearForLevel(toId);
    const isNewSwimmer = !fromId;
    const fromGear = isNewSwimmer ? [] : getGearForLevel(fromId);
    const fromIds = new Set(fromGear.map(g => g.id));

    // Pre-check owned items for upgrade flow
    if (!isNewSwimmer) {
      fromGear.forEach(g => {
        if (targetGear.some(tg => tg.id === g.id)) {
          checkedItems.add(g.id);
        }
      });
    }

    showChecklist(targetGear, fromId, toId);
  }

  // ── Checklist (Issues #6, #8, #9) ─────────────────────────
  function showChecklist(gear, fromId, toId) {
    const isNewSwimmer = !fromId;
    const fromGear = isNewSwimmer ? [] : getGearForLevel(fromId);
    const fromIds = new Set(fromGear.map(g => g.id));

    // Determine level order
    const levelOrder = gearData.levels.map(l => l.id);

    $checklistTitle.textContent = 'Gear Checklist — What do you already have?';

    if (isNewSwimmer) {
      $checklistInstructions.innerHTML = 'You\'re new to RocketSwim! <strong>Check off</strong> any gear you already own — unchecked items will appear in your shopping list.';
    } else {
      const fromLevel = gearData.levels.find(l => l.id === fromId);
      $checklistInstructions.innerHTML = `Items from <strong>${fromLevel.name} (${fromId})</strong> are pre-checked. <strong>Uncheck</strong> anything you don't actually have — those items will appear in your shopping list.`;
    }

    $checklistItems.innerHTML = '';

    // Group by category
    const categories = groupByCategory(gear);

    for (const [cat, items] of Object.entries(categories)) {
      const catHeader = document.createElement('div');
      catHeader.className = 'mt-4 mb-2 first:mt-0';
      catHeader.innerHTML = `<h3 class="text-sm font-bold text-navy-600 uppercase tracking-wider flex items-center gap-2">
        ${cat === 'WATER' ? '🏊' : '🏋️'} ${cat} Gear
      </h3>`;
      $checklistItems.appendChild(catHeader);

      items.forEach(gearItem => {
        const isOwned = fromIds.has(gearItem.id);
        const isRequired = gearItem.levels[toId] === 'R';
        const isOptional = gearItem.levels[toId] === 'O';
        const isNew = !isNewSwimmer && !isOwned;

        // Build badge HTML (Issue #8)
        let badgeHtml = '';
        if (isRequired) badgeHtml += '<span class="badge-required text-xs px-2 py-0.5 rounded-full font-medium">Required</span>';
        if (isOptional) badgeHtml += '<span class="badge-optional text-xs px-2 py-0.5 rounded-full font-medium">Optional</span>';

        if (isOwned) {
          badgeHtml += '<span class="badge-have text-xs px-2 py-0.5 rounded-full font-medium">You have this ✓</span>';
        } else if (!isNewSwimmer) {
          badgeHtml += `<span class="badge-new text-xs px-2 py-0.5 rounded-full font-medium">NEW at ${toId}</span>`;
        }

        const div = document.createElement('label');
        div.className = `gear-card flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${checkedItems.has(gearItem.id) ? 'bg-gray-50 border-gray-200' : 'bg-green-50 border-green-200'}`;
        div.innerHTML = `
          <input type="checkbox" class="w-5 h-5 rounded border-gray-300 text-teal-500 focus:ring-teal-400 cursor-pointer"
            data-gear-id="${gearItem.id}" ${checkedItems.has(gearItem.id) ? 'checked' : ''}
            aria-label="${gearItem.name} — ${isRequired ? 'required' : 'optional'}${checkedItems.has(gearItem.id) ? ', you have this' : ', needed'}">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-medium text-sm">${gearItem.name}</span>
              ${badgeHtml}
            </div>
            ${gearItem.model ? '<p class="text-xs text-teal-700 mt-0.5 font-medium">' + gearItem.model + '</p>' : ''}
            ${gearItem.notes ? '<p class="text-xs text-gray-500 mt-0.5">' + gearItem.notes + '</p>' : ''}
          </div>
          ${getSourceBadge(gearItem)}
        `;

        const checkbox = div.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            checkedItems.add(gearItem.id);
            div.className = 'gear-card flex items-center gap-3 p-3 rounded-lg border cursor-pointer bg-gray-50 border-gray-200';
          } else {
            checkedItems.delete(gearItem.id);
            div.className = 'gear-card flex items-center gap-3 p-3 rounded-lg border cursor-pointer bg-green-50 border-green-200';
          }
          updateChecklistCount(gear);
        });

        $checklistItems.appendChild(div);
      });
    }

    updateChecklistCount(gear);
  }

  function updateChecklistCount(gear) {
    const total = gear.length;
    const owned = checkedItems.size;
    $checklistCount.textContent = `${owned}/${total} items owned`;
  }

  // ── Step 3: Shopping List ──────────────────────────────────
  function renderShoppingList() {
    const toId = $toSelect.value;
    if (!toId) return;

    const needed = targetGear.filter(g => !checkedItems.has(g.id));
    const required = needed.filter(g => g.levels[toId] === 'R');
    const optional = needed.filter(g => g.levels[toId] === 'O');

    if (needed.length === 0) {
      $shoppingRequired.innerHTML = '';
      $shoppingOptional.innerHTML = '';
      $allSet.classList.remove('hidden');
      $cartSummary.classList.add('hidden');
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
  }

  function renderGearCard(gear) {
    const priceText = gear.priceFromClub ? `$${gear.priceFromClub}` : '';
    const sourceClass = `source-${gear.source}`;
    const buyButton = getBuyButton(gear);
    const categoryIcon = gear.category === 'WATER' ? '🏊' : '🏋️';
    const isSplashables = (gear.storeName || '').toLowerCase().includes('splashable');

    return `
      <div class="gear-card ${sourceClass} rounded-lg border border-gray-200 p-4 bg-white flex items-center justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs">${categoryIcon}</span>
            <span class="font-medium text-sm text-navy-900">${gear.name}</span>
            ${priceText ? `<span class="text-sm font-semibold text-teal-700">${priceText}</span>` : ''}
            ${isSplashables ? '<span class="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-medium">20% club discount</span>' : ''}
          </div>
          ${gear.model ? `<p class="text-xs text-teal-700 mt-0.5 font-medium">${gear.model}</p>` : ''}
          ${gear.notes ? `<p class="text-xs text-gray-500 mt-1">${gear.notes}</p>` : ''}
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${getSourceLabel(gear)}
          ${buyButton}
        </div>
      </div>
    `;
  }

  // ── Cart & Payment Summary (Issues #10-13) ────────────────
  function renderCartSummary(needed) {
    // Group by source (Issue #10)
    const clubGear = needed.filter(g => g.source === 'club' || g.source === 'coach');
    const pricedClubGear = clubGear.filter(g => g.priceFromClub);
    const unpricedClubGear = clubGear.filter(g => !g.priceFromClub);
    const storeItems = needed.filter(g =>
      ['store', 'amazon'].includes(g.source) && g.purchaseUrl
    );
    const anyItems = needed.filter(g => g.source === 'any');

    const hasAnything = clubGear.length > 0 || storeItems.length > 0 || anyItems.length > 0;

    if (!hasAnything) {
      $cartSummary.classList.add('hidden');
      return;
    }

    const toId = $toSelect.value;
    const toLevel = gearData.levels.find(l => l.id === toId);
    let html = '';

    // ── Club + Coach gear — merged single section ──
    if (clubGear.length > 0) {
      const total = pricedClubGear.reduce((sum, g) => sum + (g.priceFromClub || 0), 0);
      const subject = encodeURIComponent(`RocketSwim Gear Payment — ${toLevel ? toLevel.name : toId}`);
      const body = encodeURIComponent(
        `Hi,\n\nI'd like to order the following gear:\n\n` +
        pricedClubGear.map(g => `• ${g.name} — $${g.priceFromClub}`).join('\n') +
        (unpricedClubGear.length > 0 ? `\n\nAlso requesting:\n${unpricedClubGear.map(g => `• ${g.name}`).join('\n')}` : '') +
        `\n\nTotal: $${total}\n\nSwimmer Name: [Your swimmer's name]\nLevel: ${toId}\n\nThank you!`
      );
      const discordMsg = `Hi! My swimmer is moving to ${toLevel ? toLevel.name : toId}. Could I get:\n\n${clubGear.map(g => `• ${g.name}${g.priceFromClub ? ' — $' + g.priceFromClub : ''}`).join('\n')}\n\nThanks! 🚀`;

      html += `
        <div class="bg-teal-50 rounded-lg p-4 border border-teal-100">
          <h4 class="font-semibold text-teal-800 text-sm mb-2 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            Club Gear — Pay via E-Transfer
          </h4>
          <ul class="text-sm text-teal-900 mb-3 space-y-1">
            ${clubGear.map(g => `<li class="flex justify-between"><span>${g.name}</span><span class="font-medium ${g.priceFromClub ? 'text-teal-800' : 'text-teal-600 italic'}">${g.priceFromClub ? '$' + g.priceFromClub : 'Ask coach'}</span></li>`).join('')}
          </ul>
          ${total > 0 ? `
          <div class="flex items-center justify-between border-t border-teal-200 pt-2 mb-3">
            <span class="font-bold text-teal-900">Total</span>
            <span class="font-bold text-teal-900 text-lg">$${total}</span>
          </div>` : ''}
          <div class="flex flex-wrap gap-2 no-print">
            ${pricedClubGear.length > 0 ? `
            <a href="mailto:${gearData.payment.clubEmail}?subject=${subject}&body=${body}"
              class="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              aria-label="Email payment request for $${total} to ${gearData.payment.clubEmail}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              📧 Email Payment Request
            </a>` : ''}
            <button onclick="copyToClipboard(\`${discordMsg.replace(/`/g, '\\`')}\`)"
              class="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              aria-label="Copy Discord message for ${clubGear.length} gear items">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
              📋 DM Coach
            </button>
          </div>
          <div class="flex flex-wrap gap-4 mt-2 text-xs no-print">
            ${pricedClubGear.length > 0 ? `<span class="text-teal-600">Sends to ${gearData.payment.clubEmail}</span>` : ''}
            <span class="text-amber-600">${gearData.payment.coachContact}</span>
          </div>
        </div>
      `;
    }

    // ── Store/External items — grouped by retailer (Issues #13, #38) ──
    if (storeItems.length > 0) {
      // Group items by store name
      const storeGroups = {};
      storeItems.forEach(g => {
        const storeName = g.storeName || (g.source === 'amazon' ? 'Amazon' : 'Other');
        if (!storeGroups[storeName]) storeGroups[storeName] = [];
        storeGroups[storeName].push(g);
      });

      // Find store URL from gearData.stores for group header links
      const getStoreUrl = (name) => {
        const store = (gearData.stores || []).find(s => s.name === name);
        return store ? store.url : null;
      };

      html += `
        <div class="bg-green-50 rounded-lg p-4 border border-green-100 mt-4">
          <h4 class="font-semibold text-green-800 text-sm mb-3 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
            Buy from Stores
          </h4>
          <div class="space-y-4">
            ${Object.entries(storeGroups).map(([storeName, items]) => {
              const storeUrl = getStoreUrl(storeName);
              const isSplashables = storeName.toLowerCase().includes('splashable');
              const storeDiscount = isSplashables ? ' — 20% club discount' : '';
              return `
              <div class="bg-white rounded-lg p-3 border border-green-100">
                <div class="flex items-center justify-between mb-2">
                  <h5 class="font-semibold text-green-900 text-sm flex items-center gap-2">
                    🏪 ${storeName}
                    ${isSplashables ? '<span class="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-medium">20% club discount</span>' : ''}
                    <span class="text-xs font-normal text-gray-500">(${items.length} item${items.length > 1 ? 's' : ''})</span>
                  </h5>
                  ${storeUrl ? `<a href="${storeUrl}" target="_blank" rel="noopener" class="text-xs text-green-700 hover:text-green-900 underline no-print" aria-label="Visit ${storeName} website">Visit store →</a>` : ''}
                </div>
                <ul class="text-sm text-green-900 space-y-2">
                  ${items.map(g => `
                  <li class="flex items-center justify-between gap-2">
                    <div>
                      <span class="font-medium">${g.name}</span>
                      ${g.model ? '<span class="text-xs text-teal-700 ml-1">' + g.model + '</span>' : ''}
                    </div>
                    <a href="${g.purchaseUrl}" target="_blank" rel="noopener"
                      class="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap no-print"
                      aria-label="Buy ${g.name} at ${storeName} — opens in new tab">
                      Buy
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                    </a>
                  </li>`).join('')}
                </ul>
              </div>`;
            }).join('')}
          </div>
        </div>
      `;
    }

    // ── Generic items — available anywhere ──
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
        class="block p-4 rounded-lg border border-gray-200 hover:border-teal-300 hover:shadow-md transition-all bg-white"
        aria-label="Visit ${store.name} — ${store.location}${store.discount ? ', ' + store.discount : ''}">
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
      const storeName = gear.storeName || (gear.source === 'amazon' ? 'Amazon' : 'Store');
      const isSplashables = storeName.toLowerCase().includes('splashable');
      return `<a href="${gear.purchaseUrl}" target="_blank" rel="noopener"
        class="inline-flex items-center gap-1 bg-navy-900 hover:bg-navy-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors no-print whitespace-nowrap"
        title="${isSplashables ? '20% club discount at Splashables' : 'Buy at ' + storeName}"
        aria-label="Buy ${gear.name} at ${storeName} — opens in new tab">
        Buy at ${storeName} <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
      </a>`;
    }
    if ((gear.source === 'club' || gear.source === 'coach') && gear.priceFromClub) {
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
