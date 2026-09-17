<template>
  <main class="app-shell">
    <aside class="sidebar" aria-label="Admin workspace">
      <p class="brand">Sequo Admin</p>
      <nav>
        <a href="/docs/OPERATIONS_BRIEF.md">Operations brief</a>
        <a href="/docs/UX_AND_SECURITY.md">UX and security</a>
        <a href="/docs/IMPLEMENTATION_PLAN.md">Implementation plan</a>
      </nav>
    </aside>

    <section class="workspace">
      <p class="eyebrow">Internal dashboard workspace</p>
      <h1>Ready for Sequo operations.</h1>
      <p class="lead">
        This placeholder replaces the Vue starter. The next build should add authentication,
        protected navigation, monitoring widgets, operational tables, and safe action flows.
      </p>

      <div class="status-grid" aria-label="Planned dashboard areas">
        <article>
          <span>01</span>
          <h2>Monitoring</h2>
          <p>Use <code>/api/admin/monitoring/operations</code> for the first dashboard.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Operations</h2>
          <p>Manage missions, hubs, relay parcels, returns, settlements, and commissions.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Safety</h2>
          <p>Gate dangerous actions with roles, confirmations, reason fields, and audit context.</p>
        </article>
      </div>
    </section>
  </main>
</template>
