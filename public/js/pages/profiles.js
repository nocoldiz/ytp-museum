// ─── SUBSCRIPTIONS ───────────────────────────────────────────────────────
// (kept as is)
function getSubscriptions() {
  try {
    return JSON.parse(localStorage.getItem('ytp-subscriptions') || '[]');
  } catch (e) {
    return [];
  }
}
function isSubscribed(channelName) {
  return getSubscriptions().includes(channelName);
}
function toggleSubscription(channelName) {
  let subs = getSubscriptions();
  if (subs.includes(channelName)) {
    subs = subs.filter(s => s !== channelName);
  } else {
    subs.push(channelName);
  }
  localStorage.setItem('ytp-subscriptions', JSON.stringify(subs));
  updateSubscriptionButtons(channelName);
}
function updateSubscriptionButtons(channelName) {
  const subbed = isSubscribed(channelName);
  const text = subbed ? 'Iscritto' : 'Iscriviti';
  document.querySelectorAll(`.modern-btn-subscribe[data-channel="${escAttr(channelName)}"]`).forEach(btn => {
    btn.textContent = text;
    btn.classList.toggle('subscribed', subbed);
  });
  document.querySelectorAll(`.btn-watch-subscribe[data-channel="${escAttr(channelName)}"]`).forEach(btn => {
    btn.textContent = text;
    btn.classList.toggle('subscribed', subbed);
  });
}

// Expose functions to global scope
window.getSubscriptions = getSubscriptions;
window.isSubscribed = isSubscribed;
window.toggleSubscription = toggleSubscription;
window.updateSubscriptionButtons = updateSubscriptionButtons;
