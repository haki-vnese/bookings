export class NDClient {
  constructor(config) {
    this.apiBaseUrl = (config.apiBaseUrl || '').replace(/\/$/, '');
    this.storageApiBaseKey = 'nd_api_base_url';
    this.syncSessionWithApiBase();
  }

  syncSessionWithApiBase() {
    const previousBase = window.localStorage.getItem(this.storageApiBaseKey) || '';
    const currentBase = this.apiBaseUrl || '';

    // If backend target changed (e.g. local -> Render), force fresh login.
    if (previousBase && currentBase && previousBase !== currentBase) {
      this.clearSession();
    }

    window.localStorage.setItem(this.storageApiBaseKey, currentBase);
  }

  get token() {
    return window.localStorage.getItem('nd_token') || '';
  }

  set token(value) {
    if (!value) {
      window.localStorage.removeItem('nd_token');
      return;
    }
    window.localStorage.setItem('nd_token', value);
  }

  clearSession() {
    this.token = '';
    window.localStorage.removeItem('nd_user');
  }

  setUser(user) {
    window.localStorage.setItem('nd_user', JSON.stringify(user || {}));
  }

  getUser() {
    try {
      const raw = window.localStorage.getItem('nd_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async request(path, options = {}) {
    const token = this.token;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...options,
      cache: 'no-store',
      headers,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? await response.json() : null;

    if (!response.ok) {
      const message = payload?.error?.message || payload?.error || payload?.message || 'Request failed';
      const error = new Error(String(message));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  async login(identifier, password) {
    const trimmedIdentifier = String(identifier || '').trim();
    const payload = {
      identifier: trimmedIdentifier,
      password,
    };

    // Only include `email` when identifier looks like an email; this avoids
    // server-side email format validation failures when users type usernames.
    if (trimmedIdentifier.includes('@')) {
      payload.email = trimmedIdentifier;
    }

    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async me() {
    return this.request('/auth/me', { method: 'GET' });
  }

  async getBookings() {
    return this.request('/bookings', { method: 'GET' });
  }

  async updateBooking(bookingId, payload) {
    return this.request(`/bookings/${bookingId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteBooking(bookingId) {
    return this.request(`/bookings/${bookingId}`, {
      method: 'DELETE',
    });
  }

  async getCustomers() {
    return this.request('/customers', { method: 'GET' });
  }

  async getUsers() {
    return this.request('/users', { method: 'GET' });
  }

  async updateMe(payload) {
    return this.request('/users/me', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async getStaff() {
    return this.request('/staff', { method: 'GET' });
  }

  async getCompanies() {
    return this.request('/companies', { method: 'GET' });
  }

  async getSalons() {
    return this.request('/salons', { method: 'GET' });
  }

  async getMyStaff() {
    return this.request('/staff/me', { method: 'GET' });
  }

  async createStaff(payload) {
    return this.request('/staff', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateStaff(staffId, payload) {
    return this.request(`/staff/${staffId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteStaff(staffId) {
    return this.request(`/staff/${staffId}`, {
      method: 'DELETE',
    });
  }

  async getServices() {
    return this.request('/services', { method: 'GET' });
  }

  async createUser(payload) {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async deleteUser(userId) {
    return this.request(`/users/${userId}`, {
      method: 'DELETE',
    });
  }

  async updateUser(userId, payload) {
    return this.request(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async createCustomer(payload) {
    return this.request('/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async deleteCustomer(customerId) {
    return this.request(`/customers/${customerId}`, {
      method: 'DELETE',
    });
  }

  async updateCustomer(customerId, payload) {
    return this.request(`/customers/${customerId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }
}
