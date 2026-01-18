import { request as baseRequest } from '@playwright/test';

export async function createUser() {
  const email = `test.user.${Date.now()}@example.com`;
  const password = 'password123';

  const request = await baseRequest.newContext();
  const response = await request.post('/api/auth/register', {
    data: {
      email,
      password,
      firstName: 'Test',
      lastName: 'User',
    },
  });

  if (response.status() !== 200) {
    const responseBody = await response.text();
    console.error(`Failed to create user. Status: ${response.status()}, Body: ${responseBody}`);
    throw new Error(`Failed to create user: ${responseBody}`);
  }

  const { user } = await response.json();
  return { user, password };
}

export async function deleteUser(userId: string) {
  const request = await baseRequest.newContext();
  const response = await request.post('/api/test/delete-user', {
    headers: {
      'X-Test-Magic-Header': 'abracadabra',
    },
    data: {
      userId,
    },
  });

  if (response.status() !== 200) {
    throw new Error(`Failed to delete user: ${await response.text()}`);
  }
}

export async function login(email, password) {
  const request = await baseRequest.newContext();
  const response = await request.post('/api/auth/login', {
    data: {
      email,
      password,
    },
  });

  if (response.status() !== 200) {
    throw new Error(`Failed to login: ${await response.text()}`);
  }

  const { session } = await response.json();
  return session.access_token;
}
