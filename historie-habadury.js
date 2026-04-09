<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <title>Historie Habaďůry – Kuželky Benešov</title>
  ./style.css?v=1
  <style>
    .season-grid{
      display:grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap:14px;
      margin-top:14px;
    }
    .season-card{
      padding:16px;
      border-radius:14px;
      background:rgba(255,255,255,0.08);
      border:1px solid rgba(255,255,255,0.12);
    }
    .season-card h3{ margin:0; color:#ffd700; }
    .season-card .meta{ margin-top:6px; opacity:0.85; font-size:13px; }
    .actions{
      display:flex;
      gap:10px;
      flex-wrap:wrap;
      margin-top:12px;
    }
    .btn-link{
      padding:10px 14px;
      border-radius:10px;
      background:#1e235c;
      color:#ffd700;
      font-weight:bold;
      display:inline-block;
    }
    .btn-link.disabled{
      opacity:0.35;
      pointer-events:none;
      cursor:not-allowed;
    }
  </style>
</head>

<body>
<header>
  <div class="header-left">
    logo.jpg
  </div>
  <div class="header-title">Kuželky Benešov</div>
  <div class="header-right"></div>
</header>

<nav>
  <ul>
    <li>index.htmlDomů</a></li>
    <li>aktuality.htmlAktuality</a></li>
    <li>historie.htmlHistorie</a></li>
    <li>habadura.htmlHabaďůra</a></li>
    <li>admin.htmlAdmin</a></li>
  </ul>
</nav>

<main>
  <div class="content-box">
    <h2>Historie Habaďůry</h2>
    <p>Sezóny jsou načítány automaticky. Odkazy „Podzim/Jaro“ se zpřístupní po uzavření v admin panelu.</p>

    <div id="seasonsList" class="season-grid"></div>
  </div>
</main>

<footer>© Kuželky Benešov – 2026</footer>

./historie-habadury.js?v=1script>
</body>
</html>
