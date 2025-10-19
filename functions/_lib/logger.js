const sanitize = (data) => {
  const sensitive = ['email', 'phone', 'address', 'password', 'token', 'authorization', 'nrc', 'passport'];
  return JSON.parse(JSON.stringify(data, (key, val) => 
    sensitive.some(s => key.toLowerCase().includes(s)) ? '[REDACTED]' : val
  ));
};

export const logger = {
  info: (msg, data) => console.log(msg, data ? sanitize(data) : ''),
  error: (msg, err) => console.error(msg, err ? sanitize(err) : ''),
  warn: (msg, data) => console.warn(msg, data ? sanitize(data) : '')
};
