// Current ↔ Proposed switch keeps the scroll position, so the same spot on the
// page can be compared back and forth.
(function () {
  var y = new URLSearchParams(location.search).get('y');
  if (y) window.addEventListener('load', function () { window.scrollTo(0, +y); });
  document.querySelectorAll('.mk-switch a').forEach(function (a) {
    a.addEventListener('click', function () {
      a.href = a.getAttribute('href').split('?')[0] + '?y=' + Math.round(window.scrollY);
    });
  });
})();
