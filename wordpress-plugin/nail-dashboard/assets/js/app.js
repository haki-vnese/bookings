import { NDClient } from './api-client.js';
import { createInitialState } from './core/state.js';
import {
  canManage,
  rolePill,
  esc,
  asArray,
  toDateTimeLocalValue,
  fromDateTimeLocalToIso,
  toShortDateTime,
  buildEntityMaps,
  getEntityLabel,
  filterBookings,
} from './core/helpers.js';
import { renderLogin } from './features/auth.js';
import { renderOverviewPanel } from './features/overview.js';
import { renderBookingsPanel, bindBookingsEvents } from './features/bookings.js';
import { renderCustomersPanel, bindCustomersEvents } from './features/customers.js';
import { renderUsersPanel, bindUsersEvents } from './features/users.js';
import { renderStaffPanel, bindStaffEvents } from './features/staff.js';
import { renderServicesPanel, bindServicesEvents } from './features/services.js';

const app = document.getElementById('nd-app');
const config = window.ND_CONFIG || { apiBaseUrl: '' };
const client = new NDClient(config);
const state = createInitialState(client);

const helpers = {
  timeZone: config.timeZone,
  canManage,
  rolePill,
  esc,
  asArray,
  toDateTimeLocalValue: (iso) => toDateTimeLocalValue(iso, config.timeZone),
  fromDateTimeLocalToIso: (value) => fromDateTimeLocalToIso(value, config.timeZone),
  toShortDateTime: (value) => toShortDateTime(value, config.timeZone),
  buildEntityMaps,
  getEntityLabel,
  filterBookings,
};

function renderPanel() {
  if (state.error) {
    return `<section class="nd-panel"><p class="nd-error">${esc(state.error)}</p></section>`;
  }

  if (state.active === 'overview') return renderOverviewPanel(state);
  if (state.active === 'bookings') return renderBookingsPanel(state, helpers);
  if (state.active === 'customers') return renderCustomersPanel(state, helpers);
  if (state.active === 'users') return renderUsersPanel(state, helpers);
  if (state.active === 'staff') return renderStaffPanel(state, helpers);
  if (state.active === 'services') return renderServicesPanel(state, helpers);

  return `<section class="nd-panel"><p>Module coming soon.</p></section>`;
}

function renderShell() {
  const user = state.user || {};
  const role = String(user.role || '').toLowerCase();
  const salon = user.salon_name || user.salon_id || 'global';
  const timeZone = String(config.timeZone || 'browser-local').trim() || 'browser-local';
  const manage = canManage(role);
  const canUseUsers = manage || role === 'staff';
  const canUseStaff = manage || role === 'staff';

  app.innerHTML = `
    <div class="nd-layout">
      <aside class="nd-sidebar">
        <p class="nd-kicker">Nail Ops</p>
        <h2>Admin Dashboard</h2>
        <nav>
          <button data-view="overview" class="nd-nav ${state.active === 'overview' ? 'active' : ''}">Overview</button>
          <button data-view="bookings" class="nd-nav ${state.active === 'bookings' ? 'active' : ''}">Bookings</button>
          <button data-view="customers" class="nd-nav ${state.active === 'customers' ? 'active' : ''}">Customers</button>
          <button data-view="users" class="nd-nav ${state.active === 'users' ? 'active' : ''}" ${canUseUsers ? '' : 'disabled'}>Users</button>
          <button data-view="staff" class="nd-nav ${state.active === 'staff' ? 'active' : ''}" ${canUseStaff ? '' : 'disabled'}>Staff</button>
          <button data-view="services" class="nd-nav ${state.active === 'services' ? 'active' : ''}">Services</button>
        </nav>
      </aside>

      <main class="nd-main">
        <header class="nd-topbar">
          <div>
            <h1>${state.active[0].toUpperCase()}${state.active.slice(1)}</h1>
            <p>Salon scope: <code>${esc(salon)}</code></p>
            <p class="nd-muted">Time zone: <code>${esc(timeZone)}</code></p>
          </div>
          <div class="nd-userbox">
            ${rolePill(role)}
            <span>${esc(user.name || user.email || 'Unknown')}</span>
            <button id="nd-logout" class="nd-ghost">Log out</button>
          </div>
        </header>
        ${renderPanel()}
      </main>
    </div>
  `;

  app.querySelectorAll('.nd-nav').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      state.active = button.dataset.view;
      render();
    });
  });

  document.getElementById('nd-logout').addEventListener('click', () => {
    client.clearSession();
    state.user = null;
    state.metrics = { bookings: 0, customers: 0, staff: 0, services: 0 };
    state.active = 'overview';
    render();
  });
}

async function refreshData() {
  const role = String(state.user?.role || '').toLowerCase();
  const canReadManageData = canManage(role);
  const isStaffOnly = role === 'staff';

  const [bookings, customers, users, staff, myStaff, services, companies, salons] = await Promise.all([
    client.getBookings().catch(() => []),
    canReadManageData ? client.getCustomers().catch(() => []) : Promise.resolve([]),
    canReadManageData ? client.getUsers().catch(() => []) : Promise.resolve([]),
    canReadManageData ? client.getStaff().catch(() => []) : Promise.resolve([]),
    isStaffOnly ? client.getMyStaff().catch(() => null) : Promise.resolve(null),
    client.getServices().catch(() => []),
    canReadManageData ? client.getCompanies().catch(() => []) : Promise.resolve([]),
    canReadManageData ? client.getSalons().catch(() => []) : Promise.resolve([]),
  ]);

  const salonsRows = asArray(salons);
  const usersRows = asArray(users);
  const staffRows = canReadManageData ? asArray(staff) : myStaff ? [myStaff] : [];

  state.data = {
    bookings: asArray(bookings),
    customers: asArray(customers),
    users: usersRows,
    staff: asArray(staffRows),
    services: asArray(services),
    companies: asArray(companies),
    salons: salonsRows,
  };

  state.metrics = {
    bookings: state.data.bookings.length,
    customers: state.data.customers.length,
    staff: state.data.staff.length,
    services: state.data.services.length,
  };
}

async function bootstrapSession() {
  state.loading = true;
  state.error = '';

  try {
    const me = await client.me();
    state.user = me.user || me;
    client.setUser(state.user);
    await refreshData();
  } catch (error) {
    client.clearSession();
    state.user = null;
    state.error = error.message || 'Session expired';
  } finally {
    state.loading = false;
  }
}

function bindActiveFeatureEvents() {
  const ctx = {
    app,
    state,
    client,
    helpers,
    render,
    refreshData,
    bootstrapSession,
  };

  if (state.active === 'bookings') {
    bindBookingsEvents(ctx);
    return;
  }

  if (state.active === 'customers') {
    bindCustomersEvents(ctx);
    return;
  }

  if (state.active === 'users') {
    bindUsersEvents(ctx);
    return;
  }

  if (state.active === 'staff') {
    bindStaffEvents(ctx);
    return;
  }

  if (state.active === 'services') {
    bindServicesEvents(ctx);
  }
}

function render() {
  if (!app) return;

  if (state.loading) {
    app.innerHTML = '<main class="nd-loading">Loading dashboard...</main>';
    return;
  }

  if (!state.user) {
    renderLogin({ app, client, bootstrapSession, render });
    return;
  }

  renderShell();
  bindActiveFeatureEvents();
}

(async function init() {
  await bootstrapSession();
  render();
})();