import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Applications() {
  const { isPending } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  {isLoading && <Spinner size="md" />}
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
