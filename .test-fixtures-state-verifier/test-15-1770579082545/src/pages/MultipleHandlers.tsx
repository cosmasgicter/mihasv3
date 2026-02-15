
import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

export function MultipleHandlers() {
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => fetch('/api/admin?action=users').then(res => res.json())
  });
  
  const { data: apps, isPending: appsLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  if (usersLoading) {
    return <Skeleton className="h-20 w-full" />;
  }
  
  if (appsLoading) {
    return <Spinner size="lg" />;
  }
  
  if (users?.length === 0) {
    return <EmptyState message="No users" />;
  }
  
  if (!apps?.length) {
    return <div>"No applications found"</div>;
  }
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div>
        {users.map(u => <div key={u.id}>{u.name}</div>)}
        {apps.map(a => <div key={a.id}>{a.title}</div>)}
      </div>
    </Suspense>
  );
}
