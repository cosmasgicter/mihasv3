import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import type { Application } from '@/types/database'
import { applicationService } from '@/services/applications'
import { documentService } from '@/services/documents'
import { userService } from '@/services/admin/users'

type UserUpdateInput = Parameters<typeof userService.update>[1]
type RegistrationMetadata = Record<string, unknown>
type UserPermissionsResponse = Awaited<ReturnType<typeof userService.getPermissions>>

// Auth hooks
export const useLogin = () => {
  const { signIn } = useAuth()

  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signIn(email, password)
  })
}

export const useRegister = () => {
  const { signUp } = useAuth()

  return useMutation({
    mutationFn: ({ email, password, userData }: { email: string; password: string; userData: RegistrationMetadata }) =>
      signUp(email, password, userData)
  })
}

// Application hooks
export const useApplications = () => {
  return useQuery<Application[]>({
    queryKey: ['applications'],
    queryFn: async () => {
      const response = await applicationService.getAll()
      return response?.applications ?? []
    }
  })
}

export const useApplication = (id: string) => {
  return useQuery({
    queryKey: ['applications', id],
    queryFn: () => applicationService.getById(id),
    enabled: !!id
  })
}

export const useCreateApplication = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: applicationService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] })
    }
  })
}

export const useUpdateApplication = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Application> }) =>
      applicationService.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['applications', id] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
    }
  })
}

// Document hooks
export const useUploadDocument = () => {
  return useMutation({
    mutationFn: documentService.upload
  })
}

// User management hooks
export const useUsers = () => {
  return useQuery({
    queryKey: ['users'],
    queryFn: userService.list
  })
}

export const useCreateUser = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: userService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    }
  })
}

export const useUpdateUser = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserUpdateInput }) =>
      userService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    }
  })
}

export const useDeleteUser = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: userService.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    }
  })
}

export const useUserPermissions = (userId?: string) => {
  return useQuery<UserPermissionsResponse | null>({
    queryKey: ['user-permissions', userId],
    queryFn: () => {
      if (!userId) {
        return Promise.resolve(null)
      }
      return userService.getPermissions(userId)
    },
    enabled: Boolean(userId)
  })
}

export const useUpdateUserPermissions = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: string[] }) =>
      userService.updatePermissions(id, permissions),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions', id] })
    }
  })
}
