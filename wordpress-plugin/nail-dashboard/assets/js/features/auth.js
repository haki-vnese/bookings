export function renderLogin(ctx) {
  const { app, client, bootstrapSession, render } = ctx;

  app.innerHTML = `
    <main class="nd-login-wrap">
      <section class="nd-login-card">
        <p class="nd-kicker">Nail Ops</p>
        <h1>Editorial Admin Suite</h1>
        <p class="nd-subtitle">Sign in with your backend account to manage bookings, staff, and customers.</p>
        <form id="nd-login-form" class="nd-form">
          <label>Email
            <input id="nd-email" type="email" required placeholder="admin@salon.com" autocomplete="username" />
          </label>
          <label>Password
            <input id="nd-password" type="password" required placeholder="••••••••" autocomplete="current-password" />
          </label>
          <button type="submit">Sign In</button>
          <p id="nd-login-error" class="nd-error" aria-live="polite"></p>
        </form>
      </section>
    </main>
  `;

  const form = document.getElementById('nd-login-form');
  const errorNode = document.getElementById('nd-login-error');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorNode.textContent = '';

    const email = document.getElementById('nd-email').value.trim();
    const password = document.getElementById('nd-password').value;

    try {
      const response = await client.login(email, password);
      client.token = response.token;
      await bootstrapSession();
      render();
    } catch (error) {
      errorNode.textContent = error.message || 'Login failed';
    }
  });
}
