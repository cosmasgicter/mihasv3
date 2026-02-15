import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
