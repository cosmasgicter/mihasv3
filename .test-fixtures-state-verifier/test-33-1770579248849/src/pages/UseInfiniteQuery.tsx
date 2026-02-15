
import React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

export function InfiniteQueryPage() {
  const { data, fetchNextPage, hasNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['applications'],
    queryFn: ({ pageParam = 0 }) => fetch(`/api/applications?page=${pageParam}`).then(res => res.json()),
    getNextPageParam: (lastPage) => lastPage.nextCursor
  });
  
  if (isLoading) return <div>Loading...</div>;
  
  return <div>{JSON.stringify(data)}</div>;
}
