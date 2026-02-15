
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function NoLengthPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  if (isLoading) return <div>Loading...</div>;
  
  if (!data?.length) {
    return <div>No applications found</div>;
  }
  
  return <div>{data.map(app => <div key={app.id}>{app.name}</div>)}</div>;
}
