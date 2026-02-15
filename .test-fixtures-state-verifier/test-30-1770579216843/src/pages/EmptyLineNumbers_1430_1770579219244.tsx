import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { data, isPending } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  <Button loading={isLoading}>Submit</Button>
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
