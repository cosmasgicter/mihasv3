import { apiClient } from './client'

interface RegisterData {
  email: string
  password: string
  fullName: string
}

interface LoginData {
  email: string
  password: string
}

interface PasswordResetData {
  email: string
}

interface PasswordResetConfirmData {
  token: string
  newPassword: string
}

export const authService = {
  register: (data: RegisterData) => {
    const [firstName, ...lastNameParts] = data.fullName.split(' ')
    return apiClient.request('/auth/register/', {
      method: 'POST',
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        first_name: firstName || '',
        last_name: lastNameParts.join(' ') || '',
      }),
    })
  },

  login: (data: LoginData) =>
    apiClient.request('/auth/login/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logout: () =>
    apiClient.request('/auth/logout/', {
      method: 'POST',
    }),

  session: () =>
    apiClient.request('/auth/session/', {
      method: 'GET',
    }),

  refresh: () =>
    apiClient.request('/auth/refresh/', {
      method: 'POST',
    }),

  passwordReset: (data: PasswordResetData) =>
    apiClient.request('/auth/password-reset/', {
      method: 'POST',
      body: JSON.stringify({ email: data.email }),
    }),

  passwordResetConfirm: (data: PasswordResetConfirmData) =>
    apiClient.request('/auth/password-reset/confirm/', {
      method: 'POST',
      body: JSON.stringify({
        token: data.token,
        newPassword: data.newPassword,
      }),
    }),
}
