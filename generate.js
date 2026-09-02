const fs = require('fs');
const path = require('path');
const base = 'd:\\\\wrap & roll\\\\wrap-roll-pos';

function writeFile(relPath, content) {
  const fullPath = path.join(base, relPath);
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

// index.html
writeFile('index.html', <!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <title>Wrap & Roll POS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"><\/script>
  </body>
</html>);

// src/index.css
writeFile('src/index.css', \@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html { font-family: 'Montserrat', sans-serif; }
  body { @apply bg-surface text-surface-on antialiased; }
}

@layer components {
  .btn-primary {
    @apply bg-primary text-white font-display font-bold px-6 py-3 rounded-xl
           hover:bg-primary-container active:scale-[0.98] transition-all duration-150
           disabled:opacity-50 disabled:cursor-not-allowed;
  }
  .btn-secondary {
    @apply bg-white border-2 border-primary text-primary font-display font-semibold px-6 py-3 rounded-xl
           hover:bg-primary/5 active:scale-[0.98] transition-all duration-150;
  }
  .btn-yellow {
    @apply bg-secondary-container text-secondary font-display font-semibold px-4 py-2 rounded-xl
           hover:brightness-95 active:scale-[0.98] transition-all duration-150;
  }
  .card {
    @apply bg-white rounded-xl shadow-ambient p-4 transition-shadow hover:shadow-elevated;
  }
  .badge {
    @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold;
  }
  .badge-red { @apply badge bg-primary/10 text-primary; }
  .badge-yellow { @apply badge bg-secondary-container/30 text-secondary; }
  .badge-green { @apply badge bg-success/10 text-success; }
  .input-field {
    @apply w-full px-4 py-3 rounded-lg border border-outline-variant bg-white
           focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
           font-body text-sm transition-all;
  }
}

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { @apply bg-outline-variant rounded-full; }
\);

console.log('Config files created');