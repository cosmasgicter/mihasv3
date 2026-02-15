import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Applications() {
  const { data, isPending, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  {isLoading && <Loader />}
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  {!data?.length && <p>"No results found"</p>}
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
