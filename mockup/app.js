// Fixed visual fixtures only. No blackjack rules, scoring, or recommendations run here.
const $ = (selector) => document.querySelector(selector);
const scenes = {
  decision: {
    dealer: [['K', '♠'], null], dealerTotal: '10 showing',
    hands: [{ cards: [['10', '♥'], ['6', '♣']], label: 'YOUR HAND', total: 'Hard 16' }],
    title: 'What’s your move?', message: 'Take your time. Choose the best basic-strategy action.',
    icon: '↗', tone: '', caption: 'Your turn',
  },
  mistake: {
    dealer: [['6', '♠'], null], dealerTotal: '6 showing',
    hands: [{ cards: [['10', '♥'], ['6', '♣'], ['2', '♦']], label: 'YOUR HAND', total: 'Hard 18' }],
    title: 'Better move: Stand', message: 'Stand on hard 16 against dealer 6. Your hit was played.',
    icon: '!', tone: 'mistake', caption: 'Your turn · Feedback example',
  },
  split: {
    dealer: [['6', '♠'], null], dealerTotal: '6 showing',
    hands: [
      { cards: [['8', '♥'], ['3', '♣']], label: 'HAND 1 · YOUR TURN', total: 'Hard 11', active: true },
      { cards: [['8', '♣']], label: 'HAND 2 · WAITING', total: '8', waiting: true },
    ],
    title: 'Two hands. One decision at a time.', message: 'Your 8s are split. Play the highlighted hand first.',
    icon: '⑂', tone: '', caption: 'Hand 1 of 2 · Your turn',
  },
  complete: {
    dealer: [['K', '♠'], ['7', '♦']], dealerTotal: '17',
    hands: [{ cards: [['10', '♥'], ['6', '♣'], ['4', '♦']], label: 'YOUR HAND', total: '20 · WIN' }],
    title: 'Nice hand. +$25.00', message: 'You hit hard 16 against a 10, then stood on 20. Both decisions were on strategy.',
    icon: '✓', tone: 'complete', caption: 'Round complete',
  },
};
let currentScene = 'decision';

function card([rank, suit] = []) {
  if (!rank) return '<div class="card back" role="img" aria-label="Face-down card"></div>';
  const red = suit === '♥' || suit === '♦';
  const suitName = { '♥': 'hearts', '♦': 'diamonds', '♠': 'spades', '♣': 'clubs' }[suit];
  return `<div class="card${red ? ' red' : ''}" role="img" aria-label="${rank} of ${suitName}"><span class="card-corner" aria-hidden="true">${rank}<small>${suit}</small></span><span class="card-center" aria-hidden="true">${suit}</span><span class="card-bottom" aria-hidden="true">${rank}</span></div>`;
}

function render(name) {
  currentScene = name;
  const scene = scenes[name];
  $('#scene').value = name;
  $('#dealer-cards').innerHTML = scene.dealer.map((item) => card(item || undefined)).join('');
  $('#dealer-total').textContent = scene.dealerTotal;
  $('#player-hands').classList.toggle('is-split', name === 'split');
  $('#player-hands').innerHTML = scene.hands.map((hand) => `<div class="player-hand${hand.active ? ' split-active' : ''}${hand.waiting ? ' split-inactive' : ''}"><div class="hand-heading">${hand.label}<span>${hand.total}</span></div><div class="cards">${hand.cards.map((item) => card(item)).join('')}</div><div class="hand-bet"><span><span class="bet-chip" aria-hidden="true">25</span> $25 wager</span></div></div>`).join('');
  $('#feedback').className = `feedback ${scene.tone}`;
  $('#feedback').innerHTML = `<span class="feedback-icon" aria-hidden="true">${scene.icon}</span><div><strong>${scene.title}</strong><p>${scene.message}</p></div>`;
  $('#round-caption').innerHTML = `Round 29 <span>·</span> ${scene.caption}`;
  $('#round-count').textContent = name === 'complete' ? '29' : '28';
  $('#bankroll').innerHTML = name === 'complete' ? '$1,150<span>.00</span>' : '$1,125<span>.00</span>';
  $('#profit').textContent = name === 'complete' ? '↗ $150.00 this session' : '↗ $125.00 this session';
  $('#action-hint').textContent = name === 'complete' ? 'Ready when you are. There’s no timer.' : 'Choose an action or use your keyboard';
  if (name === 'complete') {
    $('#actions').innerHTML = '<button class="action-button next" data-action="next">Next hand <span aria-hidden="true">→</span><kbd>Enter</kbd></button>';
  } else {
    $('#actions').innerHTML = [['hit', 'Hit', 'H'], ['stand', 'Stand', 'S'], ['double', 'Double', 'D'], ['split', 'Split', 'P']].map(([action, label, key]) => {
      const disabled = action === 'split' || (action === 'double' && name === 'mistake');
      return `<button class="action-button" data-action="${action}"${disabled ? ' disabled' : ''}>${label}<kbd>${key}</kbd></button>`;
    }).join('');
  }
}

function performAction(action) {
  const control = document.querySelector(`[data-action="${action}"]`);
  if (!control || control.disabled) return;
  // All actions just select an explicitly labeled visual fixture.
  const nextScene = action === 'next' ? 'decision' : action === 'hit' && currentScene === 'decision' ? 'mistake' : 'complete';
  render(nextScene);
  const hint = $('#action-hint');
  hint.textContent = 'Preview only: switched sample scene, not a simulated result.';
  // Keep keyboard focus in the action area when its buttons are replaced.
  document.querySelector('#actions button:not(:disabled)')?.focus({ preventScroll: true });
}

$('#scene').addEventListener('change', (event) => render(event.target.value));
$('#actions').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (button) performAction(button.dataset.action);
});

document.querySelectorAll('[data-dialog]').forEach((button) => {
  button.addEventListener('click', () => document.getElementById(button.dataset.dialog).showModal());
});
document.querySelectorAll('[data-close]').forEach((button) => {
  button.addEventListener('click', () => button.closest('dialog').close());
});
document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
});

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || document.querySelector('dialog[open]')) return;
  if (event.target.closest('select, input, textarea, [contenteditable]')) return;
  const key = event.key.toLowerCase();
  // Preserve native activation for focused buttons, links, and disclosure controls.
  if ((key === 'enter' || key === ' ') && event.target.closest('button, a, summary')) return;
  if (key === 't' || key === '?') {
    event.preventDefault();
    $(key === 't' ? '#chart-dialog' : '#help-dialog').showModal();
    return;
  }
  const action = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surrender', enter: 'next' }[key];
  if (action) { event.preventDefault(); performAction(action); }
});

const chartRows = [
  [17, 'SSSSSSSSSS'],
  [16, 'SSSSSHHHHH'],
  [15, 'SSSSSHHHHH'],
  [14, 'SSSSSHHHHH'],
  [13, 'SSSSSHHHHH'],
  [12, 'HHSSSHHHHH'],
];
$('#chart-body').innerHTML = chartRows.map(([total, actions]) => `<tr><th scope="row">${total}</th>${[...actions].map((action) => `<td class="${action === 'H' ? 'chart-hit' : 'chart-stand'}">${action}</td>`).join('')}</tr>`).join('');
render('decision');
