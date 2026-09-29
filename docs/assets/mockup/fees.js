// Dealer-fee disclosure: click/tap toggles, hover previews on a real pointer,
// Esc and outside-click close, one popover open at a time.
(function () {
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var all = [].slice.call(document.querySelectorAll('.fx'));

  function set(box, open, pinned) {
    var btn = box.querySelector('.fx-trigger');
    box.classList.toggle('is-open', open);
    box.dataset.pinned = open && pinned ? '1' : '';
    btn.setAttribute('aria-expanded', String(open));
    if (open) all.forEach(function (b) { if (b !== box) set(b, false); });
  }

  all.forEach(function (box) {
    var btn = box.querySelector('.fx-trigger');
    var pop = box.querySelector('.fx-pop');
    var timer;

    // On the SRP the whole card links to the vehicle page; the disclosure must not.
    [btn, pop].forEach(function (el) {
      el.addEventListener('click', function (e) { e.stopPropagation(); });
    });

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var pinned = box.dataset.pinned === '1';
      set(box, !pinned, !pinned);
    });
    box.querySelector('.fx-close').addEventListener('click', function () { set(box, false); btn.focus(); });

    if (fine) {
      [btn, pop].forEach(function (el) {
        el.addEventListener('mouseenter', function () {
          clearTimeout(timer);
          if (!box.classList.contains('is-open')) set(box, true, false);
        });
        el.addEventListener('mouseleave', function () {
          if (box.dataset.pinned === '1') return;
          timer = setTimeout(function () { set(box, false); }, 180);
        });
      });
    }
  });

  document.addEventListener('click', function () {
    all.forEach(function (box) { if (box.classList.contains('is-open')) set(box, false); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    all.forEach(function (box) {
      if (box.classList.contains('is-open')) { set(box, false); box.querySelector('.fx-trigger').focus(); }
    });
  });
})();
