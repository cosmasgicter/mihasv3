import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { isLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  <Suspense fallback={<div>Loading...</div>}>
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  {!data?.length && <p>"No results found"</p>}
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Applications</h1></div>
    </Suspense>
  );
}

export default Applications;
