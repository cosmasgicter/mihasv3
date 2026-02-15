import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  <Button loading={isLoading}>Submit</Button>
  
  if (!data) {
    return <div>No data</div>;
  }
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
