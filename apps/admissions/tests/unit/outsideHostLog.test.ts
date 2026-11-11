// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { OutsideHostLog } from '../harness-e2e/helpers/outside-hosts';

// Task 3.7 (R1.11): the record behind the outside-host gate.

describe('OutsideHostLog', () => {
  it('ignores the stack: loopback, *.localhost, compose names, relative and data URLs', () => {
    const log = new OutsideHostLog();
    for (const url of [
      'http://localhost:8090/api/v1/auth/session/',
      'http://mihas.localhost:8090/',
      'http://127.0.0.1:8000/health/live/',
      'http://[::1]:8000/',
      'http://localhost:59000/bucket/key?X-Amz-Signature=abc',
      'http://minio:9000/x',
      'data:text/plain,hello',
      'blob:http://localhost:8090/uuid',
      '/relative/path',
      // Chrome's built-in PDF viewer and internal pages are not network hosts.
      'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html',
      'chrome://resources/js/load_time_data.js',
      'about:blank',
    ]) {
      log.note(url, 'request');
    }
    expect(log.hosts).toEqual([]);
    expect(log.violations()).toEqual([]);
  });

  it('records an outside host name, and says what the browser did', () => {
    const log = new OutsideHostLog();
    log.note('https://pay.lenco.co/js/v1/inline.js', 'request');
    log.note('https://pay.lenco.co/js/v1/inline.js', 'refused by CSP');
    expect(log.hosts).toEqual(['pay.lenco.co']);
    expect(log.violations()).toEqual(['outside host: pay.lenco.co (request, refused by CSP)']);
  });

  it('records websocket hosts outside the stack', () => {
    const log = new OutsideHostLog();
    log.note('wss://socket.example.test/x', 'request');
    log.note('ws://localhost:8090/x', 'request');
    expect(log.hosts).toEqual(['socket.example.test']);
  });

  it('records IPv4 and IPv6 literals outside loopback', () => {
    const log = new OutsideHostLog();
    log.note('http://8.8.8.8/x', 'request');
    log.note('http://10.0.0.5:8000/x', 'request');
    log.note('http://[2001:db8::1]/x', 'request');
    expect(log.hosts.sort()).toEqual(['10.0.0.5', '8.8.8.8', '[2001:db8::1]']);
  });

  it('names the host and never the path or query', () => {
    const log = new OutsideHostLog();
    log.note('https://tracker.example.test/collect?email=someone@example.test&token=secret', 'request');
    const line = log.violations().join('\n');
    expect(line).toContain('tracker.example.test');
    expect(line).not.toContain('secret');
    expect(line).not.toContain('collect');
  });

  it('records a name-resolution failure like any other request', () => {
    const log = new OutsideHostLog();
    log.note('http://nav-probe.invalid/', 'failed: net::ERR_NAME_NOT_RESOLVED');
    expect(log.violations()).toEqual(['outside host: nav-probe.invalid (failed: net::ERR_NAME_NOT_RESOLVED)']);
  });
});
