import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { data } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  <Button loading={isLoading}>Submit</Button>
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
