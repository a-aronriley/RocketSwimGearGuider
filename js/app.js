/**
 * RocketSwim Gear Guider
 * Main application logic — 3-step wizard (Issue #35)
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────
  let gearData = null;
  let currentStep = 1;

  // Multi-swimmer support (Issue #39)
  let swimmers = [];       // Array of { id, name, fromId, toId, checkedItems: Set, targetGear: [] }
  let activeSwimmerId = 0; // Index of the currently selected swimmer

  // Convenience accessors for the active swimmer
  function activeSwimmer() { return swimmers[activeSwimmerId] || null; }
  function getCheckedItems() { const s = activeSwimmer(); return s ? s.checkedItems : new Set(); }
  function getTargetGear() { const s = activeSwimmer(); return s ? s.targetGear : []; }

  // Legacy aliases for backward compatibility in unchanged functions
  // These are computed properties that delegate to the active swimmer
  let checkedItems = new Set();
  let targetGear = [];

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
  const $retireSection = document.getElementById('retire-section');
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

  // Sticky bottom bar (Issue #42)
  // Swimmer tabs (Issue #39)
  const $swimmerTabs = document.getElementById('swimmer-tabs');
  const $swimmerTabList = document.getElementById('swimmer-tab-list');
  const $addSwimmerBtn = document.getElementById('add-swimmer-btn');
  const $setupHeading = document.getElementById('setup-heading');

  const $stickyBar = document.getElementById('sticky-bar');
  const $stickyItemsNeeded = document.getElementById('sticky-items-needed');
  const $stickyClubTotal = document.getElementById('sticky-club-total');
  const $stickyStoreCount = document.getElementById('sticky-store-count');
  const $stickyReviewBtn = document.getElementById('sticky-review-btn');

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
      bindSwimmerEvents();
      addSwimmer('Swimmer 1');
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

    // Sticky bar review button (Issue #42)
    if ($stickyReviewBtn) {
      $stickyReviewBtn.addEventListener('click', () => {
        renderShoppingList();
        goToStep(3);
      });
    }

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

    // Show/hide sticky bar (Issue #42) — only on Step 2
    if (step === 2) {
      showStickyBar();
      updateStickyBar();
    } else {
      hideStickyBar();
    }

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
    // Reset all swimmers
    swimmers = [];
    activeSwimmerId = 0;
    checkedItems = new Set();
    targetGear = [];
    addSwimmer('Swimmer 1');
    $levelInfo.classList.add('hidden');
    $btnToStep2.disabled = true;
    goToStep(1);
    // Reset step 3 button to disabled
    const btn3 = document.getElementById('wizard-btn-3');
    if (btn3) btn3.disabled = true;
  }

  // ── Multi-Swimmer Management (Issue #39) ──────────────────
  function bindSwimmerEvents() {
    if ($addSwimmerBtn) {
      $addSwimmerBtn.addEventListener('click', () => {
        const name = 'Swimmer ' + (swimmers.length + 1);
        addSwimmer(name);
        switchToSwimmer(swimmers.length - 1);
      });
    }
  }

  function addSwimmer(name) {
    const swimmer = {
      id: swimmers.length,
      name: name,
      fromId: '',
      toId: '',
      checkedItems: new Set(),
      targetGear: []
    };
    swimmers.push(swimmer);
    renderSwimmerTabs();
    switchToSwimmer(swimmer.id);
  }

  function removeSwimmer(index) {
    if (swimmers.length <= 1) return; // Must have at least one swimmer
    swimmers.splice(index, 1);
    // Re-number swimmer IDs
    swimmers.forEach((s, i) => { s.id = i; });
    // If we removed the active swimmer, switch to previous or first
    if (activeSwimmerId >= swimmers.length) {
      activeSwimmerId = swimmers.length - 1;
    }
    renderSwimmerTabs();
    switchToSwimmer(activeSwimmerId);
  }

  function switchToSwimmer(index) {
    // Save current swimmer's state from UI
    if (activeSwimmerId < swimmers.length && swimmers[activeSwimmerId]) {
      const prev = swimmers[activeSwimmerId];
      prev.fromId = $fromSelect.value;
      prev.toId = $toSelect.value;
    }

    activeSwimmerId = index;
    const swimmer = swimmers[index];

    // Sync legacy variables
    checkedItems = swimmer.checkedItems;
    targetGear = swimmer.targetGear;

    // Update UI with this swimmer's state
    $fromSelect.value = swimmer.fromId;
    $toSelect.value = swimmer.toId;

    // Update heading
    if ($setupHeading) {
      $setupHeading.textContent = swimmers.length > 1
        ? `Setup — ${swimmer.name}`
        : 'Select Swimmer\'s Level';
    }

    // Update level info
    if (swimmer.toId) {
      const toLevel = gearData.levels.find(l => l.id === swimmer.toId);
      const fromLevel = swimmer.fromId ? gearData.levels.find(l => l.id === swimmer.fromId) : null;
      showLevelInfo(toLevel, fromLevel);
      $btnToStep2.disabled = false;
    } else {
      $levelInfo.classList.add('hidden');
      $btnToStep2.disabled = true;
    }

    // Update tab visual
    renderSwimmerTabs();
  }

  function renderSwimmerTabs() {
    if (!$swimmerTabList) return;
    $swimmerTabList.innerHTML = '';

    swimmers.forEach((swimmer, i) => {
      const tab = document.createElement('button');
      tab.className = `swimmer-tab ${i === activeSwimmerId ? 'active' : ''}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', i === activeSwimmerId ? 'true' : 'false');
      tab.setAttribute('aria-label', swimmer.name);

      const nameSpan = document.createElement('span');
      nameSpan.textContent = swimmer.name;
      nameSpan.className = 'swimmer-name';
      // Make name editable on double-click
      nameSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.type = 'text';
        input.value = swimmer.name;
        input.className = 'text-xs font-semibold bg-transparent border-b border-current outline-none w-20';
        input.style.color = 'inherit';
        nameSpan.replaceWith(input);
        input.focus();
        input.select();
        const finish = () => {
          const val = input.value.trim() || swimmer.name;
          swimmer.name = val;
          renderSwimmerTabs();
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') finish(); });
      });
      tab.appendChild(nameSpan);

      // Level indicator
      if (swimmer.toId) {
        const levelBadge = document.createElement('span');
        levelBadge.className = 'text-xs opacity-75';
        levelBadge.textContent = `(${swimmer.toId})`;
        tab.appendChild(levelBadge);
      }

      // Remove button (only if more than 1 swimmer)
      if (swimmers.length > 1) {
        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-swimmer';
        removeBtn.innerHTML = '×';
        removeBtn.title = 'Remove ' + swimmer.name;
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          removeSwimmer(i);
        });
        tab.appendChild(removeBtn);
      }

      tab.addEventListener('click', () => {
        if (i !== activeSwimmerId) {
          switchToSwimmer(i);
        }
      });

      $swimmerTabList.appendChild(tab);
    });
  }

  // ── Step 1: Setup Change Handler ───────────────────────────
  function onSetupChange() {
    const toId = $toSelect.value;

    // Save to active swimmer
    const swimmer = activeSwimmer();
    if (swimmer) {
      swimmer.fromId = $fromSelect.value;
      swimmer.toId = toId;
    }

    if (!toId) {
      $levelInfo.classList.add('hidden');
      $btnToStep2.disabled = true;
      renderSwimmerTabs(); // Update tab badge
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

    renderSwimmerTabs(); // Update tab badge
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
    // Sync from UI to active swimmer
    const swimmer = activeSwimmer();
    if (swimmer) {
      swimmer.fromId = $fromSelect.value;
      swimmer.toId = $toSelect.value;
    }

    // Prepare ALL swimmers' gear so sticky bar / review can aggregate (Issue #39)
    swimmers.forEach(s => {
      if (!s.toId) return;
      // Only re-prepare if targetGear isn't set yet (avoid overwriting user checks)
      if (s.targetGear.length === 0) {
        s.targetGear = getGearForLevel(s.toId);
        // Pre-check owned items for upgrade flow
        if (s.fromId) {
          const fromGear = getGearForLevel(s.fromId);
          fromGear.forEach(g => {
            if (s.targetGear.some(tg => tg.id === g.id)) {
              s.checkedItems.add(g.id);
            }
          });
        }
      }
    });

    const fromId = $fromSelect.value;
    const toId = $toSelect.value;

    if (!toId) return;

    // Reset active swimmer's checked items when re-entering step 2 from step 1
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

    // Save to swimmer state
    if (swimmer) {
      swimmer.checkedItems = checkedItems;
      swimmer.targetGear = targetGear;
    }

    showChecklist(targetGear, fromId, toId);
  }

  // ── Checklist (Issues #6, #8, #9, #41) ────────────────────
  function showChecklist(gear, fromId, toId) {
    const isNewSwimmer = !fromId;
    const fromGear = isNewSwimmer ? [] : getGearForLevel(fromId);
    const fromIds = new Set(fromGear.map(g => g.id));

    $checklistTitle.textContent = 'Gear Checklist — What do you already have?';

    if (isNewSwimmer) {
      $checklistInstructions.innerHTML = 'You\'re new to RocketSwim! <strong>Check off</strong> any gear you already own — unchecked items will appear in your shopping list.';
    } else {
      const fromLevel = gearData.levels.find(l => l.id === fromId);
      $checklistInstructions.innerHTML = `Moving up from <strong>${fromLevel.name}</strong> — new items to get are shown first. Your existing gear is in the collapsible section below. <strong>Uncheck</strong> anything you don't actually have.`;
    }

    $checklistItems.innerHTML = '';

    // For upgrade flows, split into new vs carrying-over items (Issue #41)
    if (!isNewSwimmer) {
      const newItems = gear.filter(g => !fromIds.has(g.id));
      const carryOverItems = gear.filter(g => fromIds.has(g.id));

      // ── New items section (prominent) ──
      if (newItems.length > 0) {
        const newHeader = document.createElement('div');
        newHeader.className = 'mb-2';
        newHeader.innerHTML = `<h3 class="text-sm font-bold text-green-700 uppercase tracking-wider flex items-center gap-2">
          🆕 New Gear for ${toId} <span class="text-xs font-normal text-gray-500">(${newItems.length} item${newItems.length !== 1 ? 's' : ''})</span>
        </h3>`;
        $checklistItems.appendChild(newHeader);

        newItems.forEach(gearItem => {
          $checklistItems.appendChild(buildChecklistCard(gearItem, toId, fromIds, isNewSwimmer, gear));
        });
      } else {
        const noNewDiv = document.createElement('div');
        noNewDiv.className = 'p-4 bg-green-50 rounded-lg border border-green-200 text-center';
        noNewDiv.innerHTML = `
          <div class="text-3xl mb-2" aria-hidden="true">✅</div>
          <p class="text-sm font-semibold text-green-800">No new gear needed!</p>
          <p class="text-xs text-green-600 mt-1">All gear from your previous level carries over to ${toId}.</p>
        `;
        $checklistItems.appendChild(noNewDiv);
      }

      // ── Carrying over collapsible section ──
      if (carryOverItems.length > 0) {
        const collapseWrapper = document.createElement('div');
        collapseWrapper.className = 'mt-6';

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'w-full flex items-center justify-between p-3 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer text-left';
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.setAttribute('aria-controls', 'carrying-over-list');
        toggleBtn.innerHTML = `
          <span class="text-sm font-bold text-navy-600 flex items-center gap-2">
            ✓ Carrying over from previous level
            <span class="text-xs font-normal text-gray-500">(${carryOverItems.length} item${carryOverItems.length !== 1 ? 's' : ''})</span>
          </span>
          <svg class="w-4 h-4 text-gray-500 transition-transform carrying-over-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        `;
        collapseWrapper.appendChild(toggleBtn);

        const collapseContent = document.createElement('div');
        collapseContent.id = 'carrying-over-list';
        collapseContent.className = 'hidden mt-2 space-y-2';
        collapseContent.setAttribute('role', 'group');
        collapseContent.setAttribute('aria-label', 'Gear carrying over from previous level');

        carryOverItems.forEach(gearItem => {
          collapseContent.appendChild(buildChecklistCard(gearItem, toId, fromIds, isNewSwimmer, gear));
        });
        collapseWrapper.appendChild(collapseContent);

        // Toggle click handler
        toggleBtn.addEventListener('click', () => {
          const isOpen = collapseContent.classList.contains('hidden');
          collapseContent.classList.toggle('hidden');
          toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          const arrow = toggleBtn.querySelector('.carrying-over-arrow');
          if (arrow) arrow.style.transform = isOpen ? 'rotate(180deg)' : '';
        });

        $checklistItems.appendChild(collapseWrapper);
      }
    } else {
      // ── New swimmer: show all items flat (no collapsible) ──
      const categories = groupByCategory(gear);
      for (const [cat, items] of Object.entries(categories)) {
        const catHeader = document.createElement('div');
        catHeader.className = 'mt-4 mb-2 first:mt-0';
        catHeader.innerHTML = `<h3 class="text-sm font-bold text-navy-600 uppercase tracking-wider flex items-center gap-2">
          ${cat === 'WATER' ? '🏊' : '🏋️'} ${cat} Gear
        </h3>`;
        $checklistItems.appendChild(catHeader);

        items.forEach(gearItem => {
          $checklistItems.appendChild(buildChecklistCard(gearItem, toId, fromIds, isNewSwimmer, gear));
        });
      }
    }

    updateChecklistCount(gear);
  }

  /**
   * Build a single gear checklist card element.
   * Extracted from showChecklist for reuse in both flat and collapsible layouts.
   */
  function buildChecklistCard(gearItem, toId, fromIds, isNewSwimmer, allGear) {
    const isOwned = fromIds.has(gearItem.id);
    const isRequired = gearItem.levels[toId] === 'R';
    const isOptional = gearItem.levels[toId] === 'O';

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
        ${gearItem.sizing ? '<p class="text-xs text-purple-600 mt-0.5">📏 ' + gearItem.sizing + '</p>' : ''}
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
      updateChecklistCount(allGear);
    });

    return div;
  }

  function updateChecklistCount(gear) {
    const total = gear.length;
    const owned = checkedItems.size;
    $checklistCount.textContent = `${owned}/${total} items owned`;
    updateStickyBar();
  }

  // ── Sticky Bottom Bar (Issue #42) ────────────────────────
  function showStickyBar() {
    if (!$stickyBar) return;
    // Remove hidden first, add sticky-hidden for transition start state
    $stickyBar.classList.remove('hidden');
    $stickyBar.classList.add('sticky-hidden');
    // Force reflow so transition triggers
    $stickyBar.offsetHeight;
    $stickyBar.classList.remove('sticky-hidden');
    document.body.classList.add('has-sticky-bar');
  }

  function hideStickyBar() {
    if (!$stickyBar) return;
    $stickyBar.classList.add('sticky-hidden');
    document.body.classList.remove('has-sticky-bar');
    // Fully hide after transition
    setTimeout(() => {
      if ($stickyBar.classList.contains('sticky-hidden')) {
        $stickyBar.classList.add('hidden');
      }
    }, 300);
  }

  function updateStickyBar() {
    if (!$stickyBar || currentStep !== 2) return;

    // Aggregate needed items across all swimmers (Issue #39)
    const allNeeded = [];
    const seenIds = new Set();
    swimmers.forEach(s => {
      if (!s.toId) return;
      const sGear = getGearForLevel(s.toId);
      sGear.forEach(g => {
        if (!s.checkedItems.has(g.id) && !seenIds.has(g.id)) {
          allNeeded.push(g);
          seenIds.add(g.id);
        }
      });
    });

    const needed = allNeeded;
    const clubGear = needed.filter(g => g.source === 'club' || g.source === 'coach');
    const clubTotal = clubGear.reduce((sum, g) => sum + (g.priceFromClub || 0), 0);
    const storeItems = needed.filter(g => ['store', 'amazon'].includes(g.source));

    // Update items needed
    if ($stickyItemsNeeded) {
      $stickyItemsNeeded.innerHTML = `
        <svg class="w-4 h-4 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"/></svg>
        <span class="font-semibold">${needed.length} item${needed.length !== 1 ? 's' : ''}</span> to buy`;
    }

    // Update club total
    if ($stickyClubTotal) {
      if (clubTotal > 0) {
        $stickyClubTotal.classList.remove('hidden');
        $stickyClubTotal.classList.add('sm:flex');
        $stickyClubTotal.innerHTML = `
          <svg class="w-4 h-4 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Club <span class="font-semibold">$${clubTotal}</span>`;
      } else {
        $stickyClubTotal.classList.add('hidden');
        $stickyClubTotal.classList.remove('sm:flex');
      }
    }

    // Update store count
    if ($stickyStoreCount) {
      if (storeItems.length > 0) {
        $stickyStoreCount.classList.remove('hidden');
        $stickyStoreCount.classList.add('sm:flex');
        $stickyStoreCount.innerHTML = `
          <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
          <span class="font-semibold">${storeItems.length}</span> store item${storeItems.length !== 1 ? 's' : ''}`;
      } else {
        $stickyStoreCount.classList.add('hidden');
        $stickyStoreCount.classList.remove('sm:flex');
      }
    }

    // Update review button text based on needed count
    if ($stickyReviewBtn) {
      if (needed.length === 0) {
        $stickyReviewBtn.innerHTML = `
          All Set! ✓
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>`;
      } else {
        $stickyReviewBtn.innerHTML = `
          Review List
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>`;
      }
    }
  }

  // ── Step 3: Shopping List ──────────────────────────────────
  function renderShoppingList() {
    // Save current swimmer state before rendering
    const swimmer = activeSwimmer();
    if (swimmer) {
      swimmer.fromId = $fromSelect.value;
      swimmer.toId = $toSelect.value;
    }

    // Collect needed items across all swimmers (Issue #39)
    const allNeeded = [];
    const swimmerSections = [];

    swimmers.forEach(s => {
      if (!s.toId) return;
      const sGear = getGearForLevel(s.toId);
      const sNeeded = sGear.filter(g => !s.checkedItems.has(g.id));
      const sRequired = sNeeded.filter(g => g.levels[s.toId] === 'R');
      const sOptional = sNeeded.filter(g => g.levels[s.toId] === 'O');

      // Deduplicate across swimmers for combined cart
      sNeeded.forEach(g => {
        if (!allNeeded.some(n => n.id === g.id)) allNeeded.push(g);
      });

      swimmerSections.push({ swimmer: s, needed: sNeeded, required: sRequired, optional: sOptional });
    });

    // If ALL swimmers have no needed items
    if (allNeeded.length === 0) {
      $shoppingRequired.innerHTML = '';
      $shoppingOptional.innerHTML = '';
      $allSet.classList.remove('hidden');
      $cartSummary.classList.add('hidden');
      $shoppingTitle.textContent = swimmers.length > 1
        ? 'Family Gear Summary'
        : `Gear for ${swimmers[0]?.toId || ''}`;
      renderRetireSection();
      return;
    }

    $allSet.classList.add('hidden');

    // Timeline grouping helper (Issue #40)
    const timelineOrder = (gearData.neededByOrder || []);
    function groupByTimeline(items) {
      const groups = {};
      const noTimeline = [];
      items.forEach(g => {
        const t = g.neededBy || '';
        if (t && timelineOrder.includes(t)) {
          if (!groups[t]) groups[t] = [];
          groups[t].push(g);
        } else {
          noTimeline.push(g);
        }
      });
      // Return ordered array of { label, items }
      const result = [];
      timelineOrder.forEach(t => {
        if (groups[t] && groups[t].length > 0) result.push({ label: t, items: groups[t] });
      });
      if (noTimeline.length > 0) result.push({ label: '', items: noTimeline });
      return result;
    }

    const timelineIcons = { 'Day 1': '🏁', 'First week': '📅', 'First meet': '🏅', 'First month': '📆', 'When needed': '⏳' };

    function renderTimelineGroups(items) {
      const groups = groupByTimeline(items);
      // If only one group or no timeline data, render flat
      if (groups.length <= 1) return items.map(g => renderGearCard(g)).join('');
      return groups.map(grp => {
        const icon = timelineIcons[grp.label] || '📦';
        const label = grp.label || 'Other';
        return `
          <div class="mt-3 first:mt-0">
            <p class="text-xs font-semibold text-purple-700 mb-1.5 flex items-center gap-1.5">
              <span>${icon}</span> ${label}
              <span class="text-gray-400 font-normal">(${grp.items.length})</span>
            </p>
            <div class="space-y-2">${grp.items.map(g => renderGearCard(g)).join('')}</div>
          </div>
        `;
      }).join('');
    }

    // Single swimmer: original layout
    if (swimmers.length === 1 || swimmerSections.length === 1) {
      const s = swimmerSections[0];
      const toLevel = gearData.levels.find(l => l.id === s.swimmer.toId);
      $shoppingTitle.textContent = `Shopping List for ${toLevel.name}`;

      if (s.required.length > 0) {
        $shoppingRequired.innerHTML = `
          <h3 class="text-sm font-bold text-navy-600 uppercase tracking-wider mb-3 flex items-center gap-2">
            Required Gear <span class="text-xs font-normal text-gray-500">(${s.required.length} items)</span>
          </h3>
          <div>${renderTimelineGroups(s.required)}</div>
        `;
      } else {
        $shoppingRequired.innerHTML = '';
      }

      if (s.optional.length > 0) {
        $shoppingOptional.innerHTML = `
          <h3 class="text-sm font-bold text-navy-600 uppercase tracking-wider mb-3 mt-6 flex items-center gap-2">
            Optional Gear <span class="text-xs font-normal text-gray-500">(${s.optional.length} items)</span>
          </h3>
          <div>${renderTimelineGroups(s.optional)}</div>
        `;
      } else {
        $shoppingOptional.innerHTML = '';
      }
    } else {
      // Multi-swimmer: show per-swimmer sections (Issue #39)
      $shoppingTitle.textContent = 'Family Shopping List';

      let reqHtml = '';
      let optHtml = '';

      swimmerSections.forEach(sec => {
        const toLevel = gearData.levels.find(l => l.id === sec.swimmer.toId);
        const label = `${sec.swimmer.name} — ${toLevel ? toLevel.name : sec.swimmer.toId}`;

        if (sec.required.length > 0) {
          reqHtml += `
            <h3 class="text-sm font-bold text-navy-600 uppercase tracking-wider mb-3 ${reqHtml ? 'mt-6' : ''} flex items-center gap-2">
              👤 ${label} — Required <span class="text-xs font-normal text-gray-500">(${sec.required.length} items)</span>
            </h3>
            <div>${renderTimelineGroups(sec.required)}</div>
          `;
        }

        if (sec.optional.length > 0) {
          optHtml += `
            <h3 class="text-sm font-bold text-navy-600 uppercase tracking-wider mb-3 ${optHtml ? 'mt-6' : 'mt-6'} flex items-center gap-2">
              👤 ${label} — Optional <span class="text-xs font-normal text-gray-500">(${sec.optional.length} items)</span>
            </h3>
            <div>${renderTimelineGroups(sec.optional)}</div>
          `;
        }
      });

      $shoppingRequired.innerHTML = reqHtml;
      $shoppingOptional.innerHTML = optHtml;
    }

    // Render retired items (Issue #36)
    renderRetireSection();

    // Render cart summary with combined items
    renderCartSummary(allNeeded);
  }

  // ── Retire Section (Issue #36, updated for #39 multi-swimmer) ──
  function renderRetireSection() {
    if (!$retireSection) return;

    // Collect retired items across all swimmers
    let allRetiredSections = [];

    swimmers.forEach(s => {
      if (!s.fromId || !s.toId) return;

      const retiredItems = gearData.gear.filter(g => {
        const fromReq = g.levels[s.fromId];
        const toReq = g.levels[s.toId];
        return (fromReq === 'R' || fromReq === 'O') && toReq !== 'R' && toReq !== 'O';
      });

      if (retiredItems.length > 0) {
        const fromLevel = gearData.levels.find(l => l.id === s.fromId);
        const toLevel = gearData.levels.find(l => l.id === s.toId);
        allRetiredSections.push({ swimmer: s, retiredItems, fromLevel, toLevel });
      }
    });

    if (allRetiredSections.length === 0) {
      $retireSection.classList.add('hidden');
      return;
    }

    let html = '<div class="border-t pt-6">';

    allRetiredSections.forEach((sec, idx) => {
      const swimmerLabel = swimmers.length > 1 ? `👤 ${sec.swimmer.name} — ` : '';
      html += `
        ${idx > 0 ? '<div class="mt-4"></div>' : ''}
        <h3 class="text-sm font-bold text-amber-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg>
          ${swimmerLabel}No Longer Needed at ${sec.toLevel.name}
          <span class="text-xs font-normal text-gray-500">(${sec.retiredItems.length} item${sec.retiredItems.length !== 1 ? 's' : ''})</span>
        </h3>
        <p class="text-xs text-gray-500 mb-3">These items were used at ${sec.fromLevel.name} but are not required at ${sec.toLevel.name}. Consider passing them to a younger swimmer!</p>
        <div class="space-y-2">
      `;

      sec.retiredItems.forEach(item => {
        const replacement = item.replacedBy ? gearData.gear.find(g => g.id === item.replacedBy) : null;
        const replacementNote = replacement ? `<span class="text-xs text-teal-600">→ Replaced by ${replacement.name}</span>` : '';
        const categoryIcon = item.category === 'WATER' ? '🏊' : '🏋️';

        html += `
          <div class="flex items-center gap-3 p-3 rounded-lg border border-amber-100 bg-amber-50">
            <div class="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-600 shrink-0" aria-hidden="true">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4"/></svg>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs">${categoryIcon}</span>
                <span class="font-medium text-sm text-navy-900">${item.name}</span>
                ${replacementNote}
              </div>
              ${item.model ? `<p class="text-xs text-gray-500 mt-0.5">${item.model}</p>` : ''}
            </div>
            <span class="text-xs px-2 py-1 rounded-full bg-amber-200 text-amber-800 font-medium shrink-0">Hand down 🤝</span>
          </div>
        `;
      });

      html += '</div>';
    });

    html += '</div>';
    $retireSection.innerHTML = html;
    $retireSection.classList.remove('hidden');
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
          ${gear.sizing ? `<p class="text-xs text-purple-600 mt-0.5">📏 ${gear.sizing}</p>` : ''}
          ${gear.notes ? `<p class="text-xs text-gray-500 mt-1">${gear.notes}</p>` : ''}
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${getSourceLabel(gear)}
          ${buyButton}
        </div>
      </div>
    `;
  }

  // ── Cart & Payment Summary (Issues #10-13, updated for #39) ──
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

    // Build multi-swimmer-aware labels for email/Discord (Issue #39)
    const activeSwimmers = swimmers.filter(s => s.toId);
    const isMulti = activeSwimmers.length > 1;
    const levelSummary = isMulti
      ? activeSwimmers.map(s => {
          const lvl = gearData.levels.find(l => l.id === s.toId);
          return `${s.name} → ${lvl ? lvl.name : s.toId}`;
        }).join(', ')
      : (() => {
          const s = activeSwimmers[0];
          const lvl = s ? gearData.levels.find(l => l.id === s.toId) : null;
          return lvl ? lvl.name : (s ? s.toId : '');
        })();
    const swimmerNamePlaceholder = isMulti
      ? activeSwimmers.map(s => s.name).join(', ')
      : '[Your swimmer\'s name]';

    let html = '';

    // ── Club + Coach gear — merged single section ──
    if (clubGear.length > 0) {
      const total = pricedClubGear.reduce((sum, g) => sum + (g.priceFromClub || 0), 0);
      const subject = encodeURIComponent(`RocketSwim Gear Payment — ${levelSummary}`);
      const body = encodeURIComponent(
        `Hi,\n\nI'd like to order the following gear:\n\n` +
        pricedClubGear.map(g => `• ${g.name} — $${g.priceFromClub}`).join('\n') +
        (unpricedClubGear.length > 0 ? `\n\nAlso requesting:\n${unpricedClubGear.map(g => `• ${g.name}`).join('\n')}` : '') +
        `\n\nTotal: $${total}\n\nSwimmer${isMulti ? 's' : ''}: ${swimmerNamePlaceholder}\nLevel${isMulti ? 's' : ''}: ${levelSummary}\n\nThank you!`
      );
      const discordMsg = isMulti
        ? `Hi! I have ${activeSwimmers.length} swimmers:\n\n${activeSwimmers.map(s => {
            const lvl = gearData.levels.find(l => l.id === s.toId);
            return `**${s.name}** → ${lvl ? lvl.name : s.toId}`;
          }).join('\n')}\n\nCould I get:\n\n${clubGear.map(g => `• ${g.name}${g.priceFromClub ? ' — $' + g.priceFromClub : ''}`).join('\n')}\n\nThanks! 🚀`
        : `Hi! My swimmer is moving to ${levelSummary}. Could I get:\n\n${clubGear.map(g => `• ${g.name}${g.priceFromClub ? ' — $' + g.priceFromClub : ''}`).join('\n')}\n\nThanks! 🚀`;

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
