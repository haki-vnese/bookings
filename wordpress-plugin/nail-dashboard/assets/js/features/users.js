export function renderUsersPanel(state, helpers) {
  const { canManage, esc, rolePill } = helpers;
  const role = String(state.user?.role || '').toLowerCase();
  const rows = state.data.users;
  const canCreate = canManage(role);
  const roleOptions = role === 'superuser' ? ['staff', 'admin', 'superuser'] : ['staff', 'admin'];

  return `
    <section class="nd-panel">
      <div class="nd-panel-head">
        <h3>Staff and Admin Users</h3>
        <button class="nd-ghost" data-action="refresh-data">Refresh</button>
      </div>
      ${
        canCreate
          ? `
            <form id="nd-user-form" class="nd-inline-form">
              <input name="name" required placeholder="Full name" />
              <input name="email" type="email" required placeholder="staff@email.com" />
              <select name="role">
                ${roleOptions.map((item) => `<option value="${item}">${item}</option>`).join('')}
              </select>
              ${
                role === 'superuser'
                  ? '<input name="salon_id" placeholder="Salon UUID (optional for superuser)" />'
                  : ''
              }
              <button type="submit">Add User</button>
            </form>
            <p id="nd-user-error" class="nd-error"></p>
          `
          : '<p class="nd-muted">Read-only access for this role.</p>'
      }
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
                    .map((row) => {
                      const isEditing = state.editing.userId === row.id;
                      const editRoleOptions =
                        role === 'superuser' ? ['staff', 'admin', 'superuser'] : ['staff', 'admin'];

                      const baseRow = `
                        <tr>
                          <td>${esc(row.name)}</td>
                          <td>${esc(row.email)}</td>
                          <td>${rolePill(row.role)}</td>
                          <td><code>${esc(row.salon_id || 'global')}</code></td>
                          <td>
                            ${
                              canCreate
                                ? `<div class="nd-row-actions"><button class="nd-secondary" data-action="start-edit-user" data-id="${esc(row.id)}">Edit</button><button class="nd-danger" data-action="delete-user" data-id="${esc(row.id)}">Delete</button></div>`
                                : '-'
                            }
                          </td>
                        </tr>
                      `;

                      if (!isEditing) return baseRow;

                      return `${baseRow}
                        <tr class="nd-edit-row">
                          <td colspan="5">
                            <form class="nd-inline-form" id="nd-user-edit-form-${esc(row.id)}" data-id="${esc(row.id)}">
                              <input name="name" required value="${esc(row.name)}" />
                              <input name="email" type="email" required value="${esc(row.email)}" />
                              <select name="role">
                                ${editRoleOptions
                                  .map(
                                    (option) =>
                                      `<option value="${option}" ${row.role === option ? 'selected' : ''}>${option}</option>`
                                  )
                                  .join('')}
                              </select>
                              ${
                                role === 'superuser'
                                  ? `<input name="salon_id" value="${esc(row.salon_id || '')}" placeholder="Salon UUID (blank keeps current)" />`
                                  : ''
                              }
                              <button type="submit">Save</button>
                              <button type="button" class="nd-secondary" data-action="cancel-edit-user">Cancel</button>
                            </form>
                          </td>
                        </tr>
                      `;
                    })
                    .join('')
                : '<tr><td colspan="5" class="nd-empty">No users in scope.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

export function bindUsersEvents(ctx) {
  const { app, state, client, refreshData, render } = ctx;

  app.querySelectorAll('[data-action="refresh-data"]').forEach((button) => {
    button.addEventListener('click', async () => {
      await refreshData();
      render();
    });
  });

  const userForm = document.getElementById('nd-user-form');
  if (userForm) {
    userForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorNode = document.getElementById('nd-user-error');
      errorNode.textContent = '';

      const formData = new FormData(userForm);
      const payload = {
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        role: String(formData.get('role') || '').trim(),
      };

      const salonId = String(formData.get('salon_id') || '').trim();
      if (salonId) payload.salon_id = salonId;

      try {
        await client.createUser(payload);
        userForm.reset();
        await refreshData();
        render();
      } catch (error) {
        errorNode.textContent = error.message || 'Failed to create user';
      }
    });
  }

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

  app.querySelectorAll('[data-action="start-edit-user"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.editing.userId = button.dataset.id || null;
      render();
    });
  });

  app.querySelectorAll('[data-action="cancel-edit-user"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.editing.userId = null;
      render();
    });
  });

  app.querySelectorAll('form[id^="nd-user-edit-form-"]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = form.dataset.id;
      if (!id) return;

      const formData = new FormData(form);
      const payload = {
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        role: String(formData.get('role') || '').trim(),
      };

      const salonId = String(formData.get('salon_id') || '').trim();
      if (salonId) payload.salon_id = salonId;

      try {
        await client.updateUser(id, payload);
        state.editing.userId = null;
        await refreshData();
        render();
      } catch (error) {
        window.alert(error.message || 'Failed to update user');
      }
    });
  });
}
