
import React from 'react';

export function StaticPage() {
  const [count, setCount] = React.useState(0);
  
  return (
    <div>
      <h1>Static Page</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  );
}
