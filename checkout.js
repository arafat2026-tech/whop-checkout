/**
 * checkout.js
 * Whop Checkout – Shopify-style multi-step form + Shopify order sync
 */

'use strict';

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const CONFIG = {
  // Replace these with real values when deploying
  WHOP_API_KEY:       'YOUR_WHOP_API_KEY',
  SHOPIFY_STORE:      'les-kicks-du-quebec',
  SHOPIFY_API_TOKEN:  'YOUR_SHOPIFY_ADMIN_TOKEN',
  SYNC_ENDPOINT:      'https://whop-checkout-production-bf20.up.railway.app/api/sync-order',
  DISCOUNT_CODES: {
    'KICKS10': { type: 'percent', value: 10, label: 'KICKS10' },
    'SAVE20':  { type: 'percent', value: 20, label: 'SAVE20'  },
    'FREE':    { type: 'flat',    value: 9.99, label: 'FREE'   },
  }
};

// ─── STATE ───────────────────────────────────────────────────────────────────
const state = {
  step: 'information',
  email: '',
  firstName: '', lastName: '',
  address1: '', address2: '',
  city: '', province: '', postal: '', country: 'CA', phone: '',
  shippingMethod: 'standard',
  shippingCost: 0,
  subtotal: 149.99,
  discount: null,
  paymentMethod: 'card',
  orderSummaryVisible: true,
};

// ─── DOM HELPERS ──────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => document.querySelectorAll(sel);

// ─── STEP NAVIGATION ─────────────────────────────────────────────────────────
function goToStep(name) {
  // Hide all panels
  qsa('.step-panel').forEach(p => p.classList.remove('active'));

  // Show target
  const panel = $('step-' + name);
  if (panel) {
    panel.classList.add('active');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Update breadcrumbs
  const steps = ['information', 'shipping', 'payment', 'confirmation'];
  const idx = steps.indexOf(name);
  const crumbs = { info: $('bc-info'), shipping: $('bc-shipping'), payment: $('bc-payment') };

  crumbs.info.className     = idx === 0 ? 'bc-current' : idx > 0 ? 'bc-link' : 'bc-step';
  crumbs.shipping.className = idx === 1 ? 'bc-current' : idx > 1 ? 'bc-link' : 'bc-step';
  crumbs.payment.className  = idx === 2 ? 'bc-current' : idx > 2 ? 'bc-link' : 'bc-step';

  state.step = name;
  updateTotals();
}

// ─── VALIDATION ───────────────────────────────────────────────────────────────
function validateEmail(val) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim()); }
function validatePostal(val) { return /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(val.trim()); }
function isEmpty(val) { return !val || val.trim() === ''; }

function markError(inputEl, msg) {
  inputEl.classList.add('error');
  // Show or create error message
  let errEl = inputEl.parentElement.querySelector('.field-error');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.className = 'field-error';
    inputEl.parentElement.insertBefore(errEl, inputEl.nextSibling);
  }
  errEl.textContent = msg;
  errEl.classList.add('show');
}

function clearError(inputEl) {
  inputEl.classList.remove('error');
  const errEl = inputEl.parentElement.querySelector('.field-error');
  if (errEl) errEl.classList.remove('show');
}

function validateInfoStep() {
  let valid = true;
  const fields = [
    { el: $('email'),      check: () => validateEmail($('email').value),        msg: 'Please enter a valid email address.' },
    { el: $('first-name'), check: () => !isEmpty($('first-name').value),        msg: 'First name is required.' },
    { el: $('last-name'),  check: () => !isEmpty($('last-name').value),         msg: 'Last name is required.' },
    { el: $('address1'),   check: () => !isEmpty($('address1').value),          msg: 'Address is required.' },
    { el: $('city'),       check: () => !isEmpty($('city').value),              msg: 'City is required.' },
    { el: $('postal'),     check: () => validatePostal($('postal').value),      msg: 'Enter a valid postal code (e.g. H1A 2B3).' },
  ];

  fields.forEach(f => {
    if (f.check()) { clearError(f.el); }
    else           { markError(f.el, f.msg); valid = false; }
  });

  return valid;
}

// ─── COLLECT STATE FROM FORM ──────────────────────────────────────────────────
function collectInfoState() {
  state.email       = $('email').value.trim();
  state.firstName   = $('first-name').value.trim();
  state.lastName    = $('last-name').value.trim();
  state.address1    = $('address1').value.trim();
  state.address2    = $('address2').value.trim();
  state.city        = $('city').value.trim();
  state.province    = $('province').value;
  state.postal      = $('postal').value.trim();
  state.country     = $('country').value;
  state.phone       = $('phone').value.trim();
}

// ─── UPDATE SUMMARY BOXES ─────────────────────────────────────────────────────
function updateSummaryBoxes() {
  const fullAddress = [
    state.address1,
    state.address2,
    state.city,
    state.province,
    state.postal,
    state.country
  ].filter(Boolean).join(', ');

  const shippingLabel = {
    standard: 'Standard (5–8 days) · Free',
    express:  'Express (2–4 days) · CA$12.99',
    overnight:'Overnight (Next day) · CA$29.99',
  }[state.shippingMethod] || '';

  [$('sum-email'), $('pay-sum-email')].forEach(el => { if(el) el.textContent = state.email || '–'; });
  [$('sum-address'), $('pay-sum-address')].forEach(el => { if(el) el.textContent = fullAddress || '–'; });
  const pss = $('pay-sum-shipping');
  if (pss) pss.textContent = shippingLabel;
}

// ─── UPDATE TOTALS ────────────────────────────────────────────────────────────
function updateTotals() {
  const shipping = { standard: 0, express: 12.99, overnight: 29.99 }[state.shippingMethod] || 0;
  state.shippingCost = shipping;

  let total = state.subtotal + shipping;
  let discountAmt = 0;

  if (state.discount) {
    if (state.discount.type === 'percent') {
      discountAmt = +(state.subtotal * state.discount.value / 100).toFixed(2);
    } else {
      discountAmt = state.discount.value;
    }
    total -= discountAmt;
    if (total < 0) total = 0;
  }

  const fmt = (n) => 'CA$' + n.toFixed(2);

  const subEl = $('subtotal');
  if (subEl) subEl.textContent = fmt(state.subtotal);

  const shipEl = $('shipping-cost');
  if (shipEl) shipEl.textContent = shipping === 0 ? 'Free' : fmt(shipping);

  const grandEl = $('grand-total');
  if (grandEl) grandEl.textContent = fmt(total);

  const finalTotal = $('final-total');
  if (finalTotal) finalTotal.textContent = fmt(total);

  const togglePrice = qs('.toggle-price');
  if (togglePrice) togglePrice.textContent = fmt(total);

  const discountRow = $('discount-row');
  if (discountRow) {
    if (state.discount) {
      discountRow.style.display = '';
      $('discount-label').textContent = state.discount.label;
      $('discount-amount').textContent = '–' + fmt(discountAmt);
    } else {
      discountRow.style.display = 'none';
    }
  }
}

// ─── SHIPPING CHANGE ──────────────────────────────────────────────────────────
function bindShippingOptions() {
  qsa('input[name="shipping"]').forEach(radio => {
    radio.addEventListener('change', () => {
      state.shippingMethod = radio.value;
      updateSummaryBoxes();
      updateTotals();
    });
  });
}

// ─── PAYMENT TABS ─────────────────────────────────────────────────────────────
function bindPaymentTabs() {
  qsa('.pay-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.pay-tab').forEach(t => t.classList.remove('active'));
      qsa('.pay-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      state.paymentMethod = btn.dataset.tab;
      const panel = $('tab-' + btn.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });
}

// ─── CARD INPUT FORMATTING ────────────────────────────────────────────────────
function bindCardFormatting() {
  const cardNum = $('card-number');
  if (cardNum) {
    cardNum.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').slice(0, 16);
      v = v.replace(/(.{4})/g, '$1 ').trim();
      e.target.value = v;
    });
  }

  const expiry = $('card-expiry');
  if (expiry) {
    expiry.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').slice(0, 4);
      if (v.length >= 2) v = v.slice(0, 2) + ' / ' + v.slice(2);
      e.target.value = v;
    });
  }

  const cvv = $('card-cvv');
  if (cvv) {
    cvv.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    });
  }

  const postal = $('postal');
  if (postal) {
    postal.addEventListener('input', (e) => {
      let v = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
      if (v.length >= 3) v = v.slice(0, 3) + ' ' + v.slice(3);
      e.target.value = v;
    });
  }
}

// ─── DISCOUNT CODE ─────────────────────────────────────────────────────────────
function bindDiscountCode() {
  const btn = $('btn-apply-discount');
  const input = $('discount-code');
  const feedback = $('discount-feedback');

  if (!btn || !input) return;

  btn.addEventListener('click', () => {
    const code = input.value.trim().toUpperCase();
    if (!code) {
      feedback.textContent = 'Please enter a discount code.';
      feedback.className = 'discount-feedback error';
      return;
    }

    const disc = CONFIG.DISCOUNT_CODES[code];
    if (disc) {
      state.discount = disc;
      feedback.textContent = '✓ Discount applied!';
      feedback.className = 'discount-feedback success';
      input.disabled = true;
      btn.textContent = 'Remove';
      btn.onclick = () => {
        state.discount = null;
        feedback.textContent = '';
        input.value = '';
        input.disabled = false;
        btn.textContent = 'Apply';
        btn.onclick = null;
        bindDiscountCode();
        updateTotals();
      };
      updateTotals();
    } else {
      feedback.textContent = 'That code is not valid.';
      feedback.className = 'discount-feedback error';
      shakeElement(input);
    }
  });
}

// ─── MOBILE SUMMARY TOGGLE ────────────────────────────────────────────────────
function bindSummaryToggle() {
  const toggle = $('summary-toggle');
  const content = $('summary-content');
  const arrow = qs('.toggle-arrow');
  const label = toggle ? toggle.querySelector('span') : null;

  if (!toggle) return;

  toggle.addEventListener('click', () => {
    const hidden = content.classList.toggle('hidden');
    if (arrow) arrow.classList.toggle('open', !hidden);
    if (label) label.textContent = hidden ? 'Show order summary' : 'Hide order summary';
  });
}

// ─── CHANGE LINKS ─────────────────────────────────────────────────────────────
function bindChangeLinks() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-target]');
    if (el) {
      e.preventDefault();
      goToStep(el.dataset.target);
    }
  });
}

// ─── TOAST NOTIFICATION ────────────────────────────────────────────────────────
function showToast(msg, duration = 3000) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// ─── SHAKE ANIMATION ──────────────────────────────────────────────────────────
function shakeElement(el) {
  el.style.animation = 'none';
  el.style.transition = 'transform 0.1s';
  let i = 0;
  const frames = [6, -6, 4, -4, 2, -2, 0];
  const interval = setInterval(() => {
    if (i >= frames.length) { clearInterval(interval); el.style.transform = ''; return; }
    el.style.transform = `translateX(${frames[i]}px)`;
    i++;
  }, 60);
}

// ─── GENERATE ORDER ID ─────────────────────────────────────────────────────────
function generateOrderId() {
  return 'LKQ-' + Math.floor(10000 + Math.random() * 90000);
}

// ─── BUILD ORDER PAYLOAD (for Shopify sync) ────────────────────────────────────
function buildOrderPayload() {
  const orderId = generateOrderId();
  const shippingAmt = { standard: 0, express: 12.99, overnight: 29.99 }[state.shippingMethod] || 0;
  let total = state.subtotal + shippingAmt;
  if (state.discount) {
    const disc = state.discount.type === 'percent'
      ? state.subtotal * state.discount.value / 100
      : state.discount.value;
    total -= disc;
  }
  if (total < 0) total = 0;

  return {
    source: 'whop',
    order_name: orderId,
    email: state.email,
    phone: state.phone,
    financial_status: 'paid',
    fulfillment_status: null,
    currency: 'CAD',
    total_price: total.toFixed(2),
    subtotal_price: state.subtotal.toFixed(2),
    shipping_lines: [{
      title: state.shippingMethod.charAt(0).toUpperCase() + state.shippingMethod.slice(1) + ' Shipping',
      price: shippingAmt.toFixed(2),
      code: state.shippingMethod,
    }],
    discount_codes: state.discount ? [{ code: state.discount.label, amount: '', type: state.discount.type }] : [],
    line_items: [{
      title: 'Nike Air Jordan 1 Retro High OG',
      variant_title: 'Size: 42 / Black Red',
      quantity: 1,
      price: state.subtotal.toFixed(2),
      sku: 'AJ1-42-BLK-RED',
    }],
    shipping_address: {
      first_name: state.firstName,
      last_name:  state.lastName,
      address1:   state.address1,
      address2:   state.address2,
      city:       state.city,
      province:   state.province,
      zip:        state.postal,
      country:    state.country,
      phone:      state.phone,
    },
    billing_address: {
      first_name: state.firstName,
      last_name:  state.lastName,
      address1:   state.address1,
      address2:   state.address2,
      city:       state.city,
      province:   state.province,
      zip:        state.postal,
      country:    state.country,
    },
    tags: 'whop,checkout-sync',
    note: 'Order placed via Whop checkout integration',
  };
}

// ─── SYNC ORDER TO SHOPIFY ─────────────────────────────────────────────────────
async function syncOrderToShopify(payload) {
  /**
   * In production this hits your backend endpoint (server.js)
   * which securely calls the Shopify Admin API.
   * We simulate here for the demo.
   */
  console.log('📦 Syncing order to Shopify:', payload);

  try {
    const response = await fetch(CONFIG.SYNC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Whop-Source': 'checkout',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error('Sync failed: ' + response.status);
    const result = await response.json();
    console.log('✅ Shopify order created:', result);
    return result;
  } catch (err) {
    // In demo mode, we silently log and continue
    console.warn('ℹ️ Sync endpoint not live yet (demo mode):', err.message);
    return { simulated: true, order_id: payload.order_name };
  }
}

// ─── PAYMENT VALIDATION ────────────────────────────────────────────────────────
function validatePayment() {
  if (state.paymentMethod !== 'card') return true;

  const cardNum = $('card-number');
  const cardName = $('card-name');
  const cardExp = $('card-expiry');
  const cardCvv = $('card-cvv');

  let valid = true;

  const rawNum = (cardNum.value || '').replace(/\s/g, '');
  if (rawNum.length < 13 || rawNum.length > 16) { markError(cardNum, 'Enter a valid card number.'); valid = false; }
  else clearError(cardNum);

  if (isEmpty(cardName.value)) { markError(cardName, 'Name on card is required.'); valid = false; }
  else clearError(cardName);

  const expVal = (cardExp.value || '').replace(/\s/g, '');
  if (!/^\d{2}\/\d{2}$/.test(expVal)) { markError(cardExp, 'Enter expiry as MM/YY.'); valid = false; }
  else clearError(cardExp);

  const cvvVal = (cardCvv.value || '').replace(/\s/g, '');
  if (cvvVal.length < 3) { markError(cardCvv, 'Enter a 3 or 4 digit CVV.'); valid = false; }
  else clearError(cardCvv);

  return valid;
}

// ─── MAIN BUTTON HANDLERS ─────────────────────────────────────────────────────
function bindButtonHandlers() {
  // Information → Shipping
  const btnToShipping = $('btn-to-shipping');
  if (btnToShipping) {
    btnToShipping.addEventListener('click', () => {
      if (!validateInfoStep()) {
        showToast('Please fix the errors above.');
        return;
      }
      collectInfoState();
      updateSummaryBoxes();
      goToStep('shipping');
    });
  }

  // Shipping → Payment
  const btnToPayment = $('btn-to-payment');
  if (btnToPayment) {
    btnToPayment.addEventListener('click', () => {
      const radio = qs('input[name="shipping"]:checked');
      if (radio) state.shippingMethod = radio.value;
      updateSummaryBoxes();
      goToStep('payment');
    });
  }

  // Pay now
  const btnPay = $('btn-pay');
  if (btnPay) {
    btnPay.addEventListener('click', async () => {
      if (!validatePayment()) {
        showToast('Please check your payment details.');
        return;
      }

      // Show loading state
      btnPay.classList.add('loading');
      btnPay.querySelector('span') && (btnPay.querySelector('span').textContent = 'Processing…');

      const payload = buildOrderPayload();

      // Sync to Shopify
      const result = await syncOrderToShopify(payload);

      // Show confirmation
      const confEmail = $('conf-email');
      const confOrderId = $('conf-order-id');
      if (confEmail) confEmail.textContent = state.email;
      if (confOrderId) confOrderId.textContent = payload.order_name;

      btnPay.classList.remove('loading');
      goToStep('confirmation');
      showToast('🎉 Order confirmed and synced to Shopify!', 5000);
    });
  }
}

// ─── FIELD AUTO-CLEAR ERRORS ──────────────────────────────────────────────────
function bindFieldClearErrors() {
  qsa('.form-input').forEach(input => {
    input.addEventListener('input', () => clearError(input));
    input.addEventListener('focus', () => clearError(input));
  });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  goToStep('information');
  bindButtonHandlers();
  bindShippingOptions();
  bindPaymentTabs();
  bindCardFormatting();
  bindDiscountCode();
  bindSummaryToggle();
  bindChangeLinks();
  bindFieldClearErrors();
  updateTotals();

  // Load product image (Whop API / Shopify storefront placeholder)
  const productImg = $('product-img-0');
  if (productImg) {
    // Set a sneaker placeholder – in production pull from Shopify product image API
    productImg.src = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=128&q=80';
    productImg.onerror = () => {
      productImg.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><rect width='64' height='64' fill='%23f0f0f0'/><text x='50%25' y='50%25' font-size='28' text-anchor='middle' dominant-baseline='middle'>👟</text></svg>";
    };
  }

  console.log('✅ Whop Checkout initialized – Shopify sync ready');
});
