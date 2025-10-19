import { apiClient } from './client'

interface RegisterData {
  email: string
  password: string
  fullName: string
  turnstileToken?: string
}

interface LoginData {
  email: string
  password: string
}

export const authService = {
  register: (data: RegisterData) =>
    apiClient.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  login: (data: LoginData) =>
    apiClient.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  signin: (data: LoginData) =>
    apiClient.request('/auth/signin', {
      method: 'POST',
      body: JSON.stringify(data)
    })
}
