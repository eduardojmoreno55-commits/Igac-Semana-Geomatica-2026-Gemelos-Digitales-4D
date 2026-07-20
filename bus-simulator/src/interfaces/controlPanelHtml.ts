/**
 * Panel de control HTML del simulador. Se sirve embebido para que el build
 * (solo `tsc`) funcione igual en `dev` y en `dist` sin copiar archivos.
 */
export const CONTROL_PANEL_HTML = /* html */ `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Simulador de buses - Bogotá</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: #0f172a; color: #e2e8f0; padding: 24px 0;
    }
    .card {
      width: min(640px, 92vw); background: #1e293b; border: 1px solid #334155;
      border-radius: 16px; padding: 28px; box-shadow: 0 12px 40px rgba(0,0,0,.35);
    }
    h1 { font-size: 1.25rem; margin: 0 0 4px; }
    p.sub { margin: 0 0 20px; color: #94a3b8; font-size: .9rem; }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-weight: 600; }
    .badge {
      display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: .75rem;
      font-weight: 600;
    }
    .badge.driving { background: #16a34a33; color: #4ade80; }
    .badge.charging { background: #ca8a0433; color: #facc15; }
    .facts { margin-top: 18px; font-size: .8rem; color: #64748b; line-height: 1.5; }
    code { color: #cbd5e1; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Simulador de buses eléctricos</h1>
    <p class="sub">Zona de estudio: Bogotá - 4 circuitos, vueltas de 2 min con recarga automática</p>

    <table>
      <thead>
        <tr><th>Bus</th><th>Fase</th><th>Progreso</th><th>Restante</th></tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>

    <p class="facts">
      Cada bus circula su circuito en <code id="lap">120</code>s; al completarlo se detiene
      unos segundos en estado <code>CHARGING</code> mientras la batería vuelve al 100%, y
      reinicia la vuelta. El ciclo se repite indefinidamente sin intervención manual.
    </p>
  </main>

  <script>
    const rows = document.getElementById("rows");
    const lap = document.getElementById("lap");

    async function refresh() {
      try {
        const res = await fetch("/api/status");
        const s = await res.json();
        lap.textContent = Math.round(s.lapDurationMs / 1000);
        rows.innerHTML = s.buses.map((b) => {
          const pct = Math.round(b.phaseProgress * 100);
          const secs = Math.ceil(b.remainingMs / 1000);
          const label = b.phase === "charging" ? "Cargando" : "Circulando";
          return \`<tr>
            <td>\${b.busId}</td>
            <td><span class="badge \${b.phase}">\${label}</span></td>
            <td>\${pct}%</td>
            <td>\${secs}s</td>
          </tr>\`;
        }).join("");
      } catch (e) {
        rows.innerHTML = '<tr><td colspan="4">Sin conexión</td></tr>';
      }
    }

    refresh();
    setInterval(refresh, 1000);
  </script>
</body>
</html>`;
