import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { error } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { isPending, error } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  if (loading) {
    return <div>Loading...</div>;
  }
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  {!data?.length && <p>"No results found"</p>}
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
