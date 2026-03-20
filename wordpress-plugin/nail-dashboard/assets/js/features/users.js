function filterUsers(rows, filters) {
  // Local client-side filtering keeps the UI responsive while preserving
  // server-side scope guarantees.
  const q = String(filters?.q || '').trim().toLowerCase();
  const role = String(filters?.role || '').trim();
  const salon = String(filters?.salon || '').trim();

  return rows.filter((row) => {
    if (role && row.role !== role) return false;
    if (salon && row.salon_id !== salon) return false;
    if (!q) return true;

    const haystack = [row.name, row.email, row.username, row.role, row.salon_name, row.salon_id]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');
    return haystack.includes(q);
  });
}

function getSalonLabel(row, salonsById) {
  // Prefer enriched payload field, then lookup map, then raw ID fallback.
  if (row.salon_name) return row.salon_name;
  if (!row.salon_id) return 'global';
  return salonsById.get(row.salon_id) || row.salon_id;
}

function renderUserModal(state, helpers, role) {
  const { esc } = helpers;
  const editingId = state.modal.type === 'edit-user' ? state.modal.rowId : null;
  const editingRow = state.data.users.find((row) => row.id === editingId) || null;
  const isCreate = state.modal.type === 'create-user';
  if (!isCreate && !editingRow) return '';

  const roleOptions = role === 'superuser' ? ['staff', 'admin', 'superuser'] : ['staff', 'admin'];
  const companies = state.data.companies || [];
  const salons = state.data.salons || [];
  const selectedCompanyId = editingRow?.company_id || '';
  const selectedSalonId = editingRow?.salon_id || '';

  const scopedSalons = role === 'superuser'
    ? (selectedCompanyId ? salons.filter((row) => row.company_id === selectedCompanyId) : salons)
    : salons;

  return `
    <div class="nd-modal-backdrop" data-action="close-user-modal">
      <div class="nd-modal" role="dialog" aria-modal="true" aria-label="User form" onclick="event.stopPropagation()">
        <div class="nd-panel-head">
          <h3>${isCreate ? 'Add User' : 'Edit User'}</h3>
          <button class="nd-ghost" data-action="close-user-modal">Close</button>
        </div>
        <form id="nd-user-modal-form" class="nd-modal-form" data-id="${esc(editingRow?.id || '')}">
          <input name="name" required placeholder="Full name" value="${esc(editingRow?.name || '')}" />
          <input name="email" type="email" required placeholder="Email" value="${esc(editingRow?.email || '')}" />
          <input name="username" placeholder="Username" value="${esc(editingRow?.username || '')}" />
          ${isCreate ? '<input name="password" type="password" required placeholder="Temporary password" minlength="6" />' : ''}
          <select name="role">
            ${roleOptions
              .map((option) => `<option value="${option}" ${editingRow?.role === option ? 'selected' : ''}>${option}</option>`)
              .join('')}
          </select>
          ${role === 'superuser' ? `
            <select name="company_id">
              <option value="">No company</option>
              ${companies
                .map((row) => `<option value="${esc(row.id)}" ${selectedCompanyId === row.id ? 'selected' : ''}>${esc(row.name)}</option>`)
                .join('')}
            </select>
            <select name="salon_id">
              <option value="">No salon</option>
              ${scopedSalons
                .map((row) => `<option value="${esc(row.id)}" ${selectedSalonId === row.id ? 'selected' : ''}>${esc(row.name)}</option>`)
                .join('')}
            </select>
          ` : ''}
          <button type="submit">${isCreate ? 'Create' : 'Save'}</button>
        </form>
      </div>
    </div>
  `;
}

function renderStaffSelfPanel(state, helpers) {
  const { esc } = helpers;
  const me = state.user || {};

  return `
    <section class="nd-panel">
      <div class="nd-panel-head">
        <h3>My User Profile</h3>
      </div>
      <form id="nd-user-self-form" class="nd-form">
        <label>Name
          <input name="name" required value="${esc(me.name || '')}" />
        </label>
        <label>Email
          <input name="email" type="email" required value="${esc(me.email || '')}" />
        </label>
        <label>Username
          <input name="username" value="${esc(me.username || '')}" />
        </label>
        <button type="submit">Save Profile</button>
        <p id="nd-user-self-error" class="nd-error"></p>
      </form>
      <p class="nd-muted">Staff can update only personal profile and cannot list other users.</p>
    </section>
  `;
}

export function renderUsersPanel(state, helpers) {
  const { canManage, esc, rolePill } = helpers;
  const role = String(state.user?.role || '').toLowerCase();
  const canCreate = canManage(role);

  if (role === 'staff') {
    // Staff sees a self-service profile panel, not the global user table.
    return renderStaffSelfPanel(state, helpers);
  }

  const filters = state.filters.user || {};
  const rows = filterUsers(state.data.users || [], filters);
  const salons = state.data.salons || [];
  const salonsById = new Map(salons.map((row) => [row.id, row.name]));

  return `
    <section class="nd-panel">
      <div class="nd-panel-head">
        <h3>System Users</h3>
        <div class="nd-row-actions">
          <button class="nd-ghost" data-action="refresh-data">Refresh</button>
          ${canCreate ? '<button data-action="open-create-user">Add User</button>' : ''}
        </div>
      </div>
      <form id="nd-user-filter" class="nd-filters">
        <input name="q" placeholder="Search by name, email, username" value="${esc(filters.q || '')}" />
        <select name="role">
          <option value="">All roles</option>
          <option value="staff" ${filters.role === 'staff' ? 'selected' : ''}>staff</option>
          <option value="admin" ${filters.role === 'admin' ? 'selected' : ''}>admin</option>
          <option value="superuser" ${filters.role === 'superuser' ? 'selected' : ''}>superuser</option>
        </select>
        <select name="salon">
          <option value="">All salons</option>
          ${salons
            .map((row) => `<option value="${esc(row.id)}" ${filters.salon === row.id ? 'selected' : ''}>${esc(row.name)}</option>`)
            .join('')}
        </select>
        <button type="submit" class="nd-secondary">Apply Filter</button>
        <button type="button" class="nd-ghost" data-action="clear-user-filter">Clear</button>
      </form>
      <div class="nd-table-wrap">
        <table class="nd-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Salon</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map(
                      (row) => `
                        <tr>
                          <td>${esc(row.name)}</td>
                          <td>${esc(row.email)}</td>
                          <td>${rolePill(row.role)}</td>
                          <td>${esc(getSalonLabel(row, salonsById))}</td>
                          <td>
                            <div class="nd-row-actions">
                              <button class="nd-secondary" data-action="open-edit-user" data-id="${esc(row.id)}">Edit</button>
                              <button class="nd-danger" data-action="delete-user" data-id="${esc(row.id)}">Delete</button>
                            </div>
                          </td>
                        </tr>
                      `
                    )
                    .join('')
                : '<tr><td colspan="5" class="nd-empty">No users in scope.</td></tr>'
            }
          </tbody>
        </table>
      </div>
      ${renderUserModal(state, helpers, role)}
    </section>
  `;
}

export function bindUsersEvents(ctx) {
  const { app, state, client, refreshData, render } = ctx;
  const role = String(state.user?.role || '').toLowerCase();

  if (role === 'staff') {
    // Staff update path intentionally reuses users/me endpoint only.
    const selfForm = document.getElementById('nd-user-self-form');
    if (selfForm) {
      selfForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const errorNode = document.getElementById('nd-user-self-error');
        errorNode.textContent = '';

        const formData = new FormData(selfForm);
        const payload = {
          name: String(formData.get('name') || '').trim(),
          email: String(formData.get('email') || '').trim(),
          username: String(formData.get('username') || '').trim() || null,
        };

        try {
          await client.updateMe(payload);
          await refreshData();
          render();
        } catch (error) {
          errorNode.textContent = error.message || 'Failed to update profile';
        }
      });
    }
    return;
  }

  app.querySelectorAll('[data-action="refresh-data"]').forEach((button) => {
    button.addEventListener('click', async () => {
      await refreshData();
      render();
    });
  });

  const filterForm = document.getElementById('nd-user-filter');
  if (filterForm) {
    filterForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(filterForm);
      state.filters.user.q = String(formData.get('q') || '').trim();
      state.filters.user.role = String(formData.get('role') || '').trim();
      state.filters.user.salon = String(formData.get('salon') || '').trim();
      render();
    });
  }

  app.querySelectorAll('[data-action="clear-user-filter"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filters.user = { q: '', role: '', salon: '' };
      render();
    });
  });

  app.querySelectorAll('[data-action="open-create-user"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.modal.type = 'create-user';
      state.modal.rowId = null;
      render();
    });
  });

  app.querySelectorAll('[data-action="open-edit-user"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.modal.type = 'edit-user';
      state.modal.rowId = button.dataset.id || null;
      render();
    });
  });

  app.querySelectorAll('[data-action="close-user-modal"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.modal.type = null;
      state.modal.rowId = null;
      render();
    });
  });

  app.querySelectorAll('[data-action="delete-user"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      if (!id) return;
      if (!window.confirm('Delete this user?')) return;

      try {
        await client.deleteUser(id);
        await refreshData();
        render();
      } catch (error) {
        window.alert(error.message || 'Failed to delete user');
      }
    });
  });

  const modalForm = document.getElementById('nd-user-modal-form');
  if (modalForm) {
    modalForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = modalForm.dataset.id || null;
      const formData = new FormData(modalForm);

      const payload = {
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        username: String(formData.get('username') || '').trim() || null,
        role: String(formData.get('role') || '').trim(),
      };

      const password = String(formData.get('password') || '').trim();
      if (state.modal.type !== 'edit-user' && password) {
        payload.password = password;
      }

      const companyId = String(formData.get('company_id') || '').trim();
      const salonId = String(formData.get('salon_id') || '').trim();
      if (companyId) payload.company_id = companyId;
      if (salonId) payload.salon_id = salonId;

      try {
        if (state.modal.type === 'edit-user' && id) {
          await client.updateUser(id, payload);
        } else {
          await client.createUser(payload);
        }
        state.modal.type = null;
        state.modal.rowId = null;
        await refreshData();
        render();
      } catch (error) {
        window.alert(error.message || 'Failed to save user');
      }
    });
  }
}
