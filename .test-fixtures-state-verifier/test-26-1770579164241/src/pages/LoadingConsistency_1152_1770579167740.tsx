import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  
  
  {!data?.length && <p>"No results found"</p>}
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
