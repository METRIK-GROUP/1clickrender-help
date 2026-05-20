const EDGE = "https://<PROJECT_REF>.supabase.co/functions/v1"; // replaced at deploy

const $ = (id) => document.getElementById(id);

async function tryAuthed(endpoint) {
  return await fetch(`${EDGE}/admin-data?endpoint=${endpoint}`, { credentials: "include" });
}

async function login() {
  const pw = $("password").value;
  const r = await fetch(`${EDGE}/admin-auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ password: pw }),
  });
  if (r.ok) {
    location.hash = "#overview";
    await render();
  } else {
    $("login-error").style.display = "block";
  }
}

function viewLogin() {
  $("content").innerHTML = `
    <section id="login">
      <h2>Login</h2>
      <input type="password" id="password" placeholder="Senha do admin">
      <button id="login-btn" class="primary">Entrar</button>
      <p id="login-error" style="color:#f55;display:none">Senha incorreta</p>
    </section>
  `;
  $("login-btn").onclick = login;
  $("password").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
}

async function viewOverview() {
  const r = await tryAuthed("overview");
  if (r.status === 401) return viewLogin();
  const data = await r.json();
  const m = data.metrics;
  const lastReportDate = data.reports?.[0]?.report_date;
  const stale = !lastReportDate || (Date.now() - new Date(lastReportDate).getTime()) > 25 * 3600_000;

  $("content").innerHTML = `
    ${stale ? `<div class="cron-alert">⚠ Último relatório > 25h. Cron pode estar parado.</div>` : ""}
    <h2>Overview (últimos 7 dias)</h2>
    <div class="metric-grid">
      <div class="metric"><div class="label">Conversas</div><div class="value">${m.conversations_7d}</div></div>
      <div class="metric"><div class="label">Satisfação</div><div class="value">${m.satisfaction === null ? "—" : m.satisfaction + "%"}</div></div>
      <div class="metric"><div class="label">Latência média</div><div class="value">${m.avg_latency_ms}ms</div></div>
      <div class="metric"><div class="label">Gaps abertos</div><div class="value">${data.gaps?.length ?? 0}</div></div>
    </div>

    <h3>Top gaps</h3>
    <table>
      <thead><tr><th>Tema</th><th>Freq</th><th>Sugestão</th><th>Issue</th></tr></thead>
      <tbody>
        ${(data.gaps ?? []).map((g) => `
          <tr>
            <td>${g.cluster_label}</td>
            <td>${g.frequency}</td>
            <td><code>${g.suggested_kb_path ?? "—"}</code></td>
            <td>${g.github_issue_url ? `<a href="${g.github_issue_url}" target="_blank">link</a>` : "—"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>

    <h3>Últimos relatórios</h3>
    <ul class="report-list">
      ${(data.reports ?? []).map((r) => `<li><a href="#reports/${r.report_date}">${r.report_date}</a></li>`).join("")}
    </ul>
  `;
}

async function viewReports(date = null) {
  const r = await tryAuthed("reports");
  if (r.status === 401) return viewLogin();
  const data = await r.json();
  if (date) {
    const report = data.reports.find((r) => r.report_date === date);
    if (!report) { $("content").innerHTML = "<p>Relatório não encontrado.</p>"; return; }
    $("content").innerHTML = `
      <h2>Relatório ${date}</h2>
      <div class="report-content">${DOMPurify.sanitize(marked.parse(report.markdown_content))}</div>
    `;
  } else {
    $("content").innerHTML = `
      <h2>Relatórios diários</h2>
      <ul class="report-list">
        ${data.reports.map((r) => `<li><a href="#reports/${r.report_date}">${r.report_date}</a></li>`).join("")}
      </ul>
    `;
  }
}

async function viewGaps() {
  const r = await tryAuthed("gaps");
  if (r.status === 401) return viewLogin();
  const data = await r.json();
  $("content").innerHTML = `
    <h2>KB Gaps</h2>
    <table>
      <thead><tr><th>Tema</th><th>Freq</th><th>Status</th><th>Issue</th><th>Criado</th></tr></thead>
      <tbody>
        ${data.gaps.map((g) => `
          <tr>
            <td>${g.cluster_label}</td>
            <td>${g.frequency}</td>
            <td>${g.status}</td>
            <td>${g.github_issue_url ? `<a href="${g.github_issue_url}" target="_blank">link</a>` : "—"}</td>
            <td>${new Date(g.created_at).toLocaleDateString()}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function viewConversations() {
  const r = await tryAuthed("conversations");
  if (r.status === 401) return viewLogin();
  const data = await r.json();
  const grouped = new Map();
  for (const m of data.messages ?? []) {
    if (!grouped.has(m.session_id)) grouped.set(m.session_id, []);
    grouped.get(m.session_id).push(m);
  }
  $("content").innerHTML = `
    <h2>Conversas (últimas 50)</h2>
    ${(data.sessions ?? []).map((s) => `
      <div class="conv-thread">
        <div class="meta">${new Date(s.created_at).toLocaleString()} · ${s.lang}</div>
        ${(grouped.get(s.id) ?? []).map((m) => `
          <div class="conv-msg ${m.role}"><strong>${m.role}:</strong> ${m.content.slice(0, 500)}</div>
        `).join("")}
      </div>
    `).join("")}
  `;
}

async function render() {
  const hash = location.hash || "#overview";
  if (hash.startsWith("#overview")) return viewOverview();
  if (hash.startsWith("#reports/")) return viewReports(hash.split("/")[1]);
  if (hash === "#reports") return viewReports();
  if (hash === "#gaps") return viewGaps();
  if (hash === "#conversations") return viewConversations();
  return viewOverview();
}

window.addEventListener("hashchange", render);
render();
