import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userService } from '@/services/admin/users'

// Query Keys
const QUERY_KEYS = {
  users: ['users'] as const,
  usersList: ['users', 'list'] as const,
  userDetail: (id: string) => ['users', 'detail', id] as const,
}

// Data Access Functions
export const usersData = {
  // Get all users
  useList: () => {
    return useQuery({
      queryKey: QUERY_KEYS.usersList,
      queryFn: () => userService.list(),
      staleTime: 60000
    })
  },

  // Create user
  useCreate: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: (data: { email: string; password: string; full_name: string; phone?: string; role: string }) =>
        userService.create(data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users })
      }
    })
  },

  // Update user
  useUpdate: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: ({ id, data }: { id: string; data: { full_name: string; email: string; phone?: string; role: string } }) =>
        userService.update(id, data),
      onSuccess: (_, { id }) => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userDetail(id) })
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users })
      }
    })
  },

  // Remove user
  useRemove: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: (id: string) => userService.remove(id),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users })
      }
    })
  }
}