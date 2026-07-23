import { send, awaitIpc, makeId, matchResponse, serializeError } from '../server.toolsIpc';

describe('server.toolsIpc re-exports', () => {
  it.each([
    ['send', send],
    ['awaitIpc', awaitIpc],
    ['makeId', makeId],
    ['matchResponse', matchResponse],
    ['serializeError', serializeError]
  ])('should re-export %s from server.processIpc', (_name, fn) => {
    expect(typeof fn).toBe('function');
  });
});
