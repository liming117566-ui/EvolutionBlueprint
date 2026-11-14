(function () {
  var id = location.hash.replace(/^#/, '');
  try { id = decodeURIComponent(id); } catch (e) { return; }
  if (/^cnm_[A-Za-z0-9]+$/.test(id)) {
    document.documentElement.style.visibility = 'hidden';
    location.replace('explore/#' + encodeURIComponent(id));
  } else if (/^cne_[A-Za-z0-9]+$/.test(id)) {
    document.documentElement.style.visibility = 'hidden';
    location.replace('explore/?subject=english#' + encodeURIComponent(id));
  } else if (/^cnp_[A-Za-z0-9]+$/.test(id)) {
    document.documentElement.style.visibility = 'hidden';
    location.replace('explore/?subject=physics#' + encodeURIComponent(id));
  } else if (/^cns_[A-Za-z0-9]+$/.test(id)) {
    document.documentElement.style.visibility = 'hidden';
    location.replace('explore/?subject=science#' + encodeURIComponent(id));
  } else if (/^cnc_[A-Za-z0-9]+$/.test(id)) {
    document.documentElement.style.visibility = 'hidden';
    location.replace('explore/?subject=chinese#' + encodeURIComponent(id));
  } else if (/^cnd_[A-Za-z0-9]+$/.test(id)) {
    document.documentElement.style.visibility = 'hidden';
    location.replace('explore/?subject=morality#' + encodeURIComponent(id));
  } else if (/^cnh_[A-Za-z0-9]+$/.test(id)) {
    document.documentElement.style.visibility = 'hidden';
    location.replace('explore/?subject=history#' + encodeURIComponent(id));
  } else if (/^cng_[A-Za-z0-9]+$/.test(id)) {
    document.documentElement.style.visibility = 'hidden';
    location.replace('explore/?subject=geography#' + encodeURIComponent(id));
  } else if (/^cnb_[A-Za-z0-9]+$/.test(id)) {
    document.documentElement.style.visibility = 'hidden';
    location.replace('explore/?subject=biology#' + encodeURIComponent(id));
  } else if (/^cnk_[A-Za-z0-9]+$/.test(id)) {
    document.documentElement.style.visibility = 'hidden';
    location.replace('explore/?subject=chemistry#' + encodeURIComponent(id));
  }
})();

