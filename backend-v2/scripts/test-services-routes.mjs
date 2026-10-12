const baseUrl = (process.env.TEST_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
const salonId = process.env.TEST_SALON_ID;

if (!email || !password || !salonId) {
  console.error('Set TEST_EMAIL, TEST_PASSWORD, and TEST_SALON_ID in your shell before running this script.');
  process.exit(1);
}

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'x-salon-id': salonId
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  return { response, payload };
}

function expectStatus(label, result, status) {
  if (result.response.status !== status) {
    const message = typeof result.payload === 'string'
      ? result.payload
      : result.payload?.message || result.payload?.error || '';
    throw new Error(`${label}: expected HTTP ${status}, got ${result.response.status}${message ? ` (${message})` : ''}`);
  }
  console.log(`PASS ${label} (${status})`);
}

let token;
let createdServiceId;

try {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password }
  });
  expectStatus('login', login, 200);
  token = login.payload?.access_token;
  if (!token) throw new Error('Login succeeded but did not return an access token.');

  const categories = await request('/api/categories', { token });
  expectStatus('GET categories', categories, 200);
  const category = Array.isArray(categories.payload)
    ? categories.payload.find((item) => item.isActive)
    : null;
  if (!category) throw new Error('No active category is available for this salon.');

  const list = await request('/api/services', { token });
  expectStatus('GET services', list, 200);
  if (!Array.isArray(list.payload)) throw new Error('GET services did not return a list.');

  const unique = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const create = await request('/api/services', {
    token,
    method: 'POST',
    body: {
      name: `Temporary route check ${unique}`,
      categoryId: category.id,
      description: 'Temporary service created by the route smoke test',
      price: 1.23,
      durationMinutes: 15,
      isActive: true
    }
  });
  expectStatus('POST service', create, 201);
  createdServiceId = create.payload?.id;
  if (!createdServiceId) throw new Error('Service was created but the response did not include its record key.');
  for (const field of ['createdAt', 'updatedAt', 'createdBy', 'updatedBy']) {
    if (!(field in create.payload)) throw new Error(`Create response is missing ${field}.`);
  }

  const detailPath = `/api/services/${encodeURIComponent(createdServiceId)}`;
  const detail = await request(detailPath, { token });
  expectStatus('GET service detail', detail, 200);
  if (detail.payload?.name !== create.payload.name) throw new Error('Service detail did not match the created service.');

  const update = await request(detailPath, {
    token,
    method: 'PUT',
    body: { description: 'Updated by the temporary route check', isActive: false }
  });
  expectStatus('PUT service', update, 200);
  if (update.payload?.isActive !== false) throw new Error('Updated service did not become inactive.');

  const remove = await request(detailPath, { token, method: 'DELETE' });
  expectStatus('DELETE service', remove, 204);
  createdServiceId = undefined;

  const missing = await request(detailPath, { token });
  expectStatus('GET deleted service', missing, 404);
} catch (error) {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  if (createdServiceId && token) {
    try {
      await request(`/api/services/${encodeURIComponent(createdServiceId)}`, { token, method: 'DELETE' });
      console.log('CLEANUP attempted for the temporary service.');
    } catch {
      console.error('Cleanup could not reach the server. Check the Services list for the temporary route check record.');
      process.exitCode = 1;
    }
  }
}
