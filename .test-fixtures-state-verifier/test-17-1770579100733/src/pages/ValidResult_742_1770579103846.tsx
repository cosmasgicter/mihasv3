import React, { Suspense } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';

export function Applications() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
