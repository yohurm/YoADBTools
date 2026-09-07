(function () {
  try {
    var dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch (_) {}
})();
